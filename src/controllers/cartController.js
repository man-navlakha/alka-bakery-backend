// src/controllers/cartController.js
import { supabase } from "../config/supabase.js"; // adjust path if different
import { randomUUID } from "node:crypto";

/**
 * Helpers
 */

function getCartIdFromRequest(req) {
  const headerId = req.headers["x-cart-id"];
  const cookieId = req.cookies?.cart_id;
  return headerId || cookieId || null;
}

// If you have auth, extract user id from req.user or JWT
function getUserIdFromRequest(req) {
  // Example: if you use some auth middleware that sets req.user
  return req.user?.id || null;
}

async function findOrCreateCart({ cartId, userId }) {
  if (cartId) {
    const { data, error } = await supabase
      .from("carts")
      .select("*")
      .eq("id", cartId)
      .eq("status", "active")
      .single();

    if (!error && data) return data;
  }

  // If userId exists, try to reuse existing active cart for this user
  if (userId && !cartId) {
    const { data, error } = await supabase
      .from("carts")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) return data;
  }

  // Create new cart
  const newId = randomUUID();
  const { data: created, error: createErr } = await supabase
    .from("carts")
    .insert({
      id: newId,
      user_id: userId,
      status: "active",
      currency: "INR",
      subtotal: 0,
      discount_total: 0,
      grand_total: 0,
    })
    .select("*")
    .single();

  if (createErr) throw createErr;
  return created;
}

async function loadCartWithItems(cartId) {
  const { data: cart, error } = await supabase
    .from("carts")
    .select(
      `
      *,
      cart_items:cart_items (
        id,
        product_id,
        unit,
        quantity,
        grams,
        variant_label,
        variant_grams,
        variant_price,
        unit_price,
        line_total,
        is_gift,
        meta
      )
    `
    )
    .eq("id", cartId)
    .single();

  if (error) throw error;
  return cart;
}

async function recalcTotals(cartId) {
  // 1) Load cart + items
  const cart = await loadCartWithItems(cartId);
  const items = cart.cart_items || [];

  // 2) Subtotal = sum of non-gift lines
  const subtotal = items
    .filter((it) => !it.is_gift)
    .reduce((sum, it) => sum + Number(it.line_total || 0), 0);

  // 3) Existing manual coupon discount (user-entered code)
  const coupon_discount = Number(cart.coupon_discount || 0);

  // 4) AUTO DISCOUNT (based on subtotal)
  let auto_discount = 0;
  let auto_coupon_code = null;
  let freeGiftApplied = false;

  if (subtotal > 0) {
    // find all eligible auto coupons
    const { data: autoCoupons, error: autoErr } = await supabase
      .from("coupons")
      .select("*")
      .eq("is_auto", true)
      .eq("is_active", true)
      .lte("auto_threshold", subtotal);

    if (autoErr) {
      console.error("auto coupon lookup error:", autoErr);
    } else if (autoCoupons && autoCoupons.length > 0) {
      // pick coupon that gives max discount
      let chosenAuto = null;
      let maxDiscount = 0;

      for (const c of autoCoupons) {
        let d = 0;
        if (c.type === "percent") {
          d = (subtotal * Number(c.value)) / 100;
        } else if (c.type === "fixed") {
          d = Number(c.value || 0);
        }
        if (d > maxDiscount) {
          maxDiscount = d;
          chosenAuto = c;
        }
      }

      if (chosenAuto && maxDiscount > 0) {
        auto_discount = maxDiscount;
        auto_coupon_code = chosenAuto.code;

        // 5) FREE GIFT based on this auto coupon
        if (chosenAuto.free_gift_product_id) {
          const giftProductId = chosenAuto.free_gift_product_id;
          const giftQty = chosenAuto.free_gift_qty || 1;

          // does a gift line already exist?
          const { data: giftItems } = await supabase
            .from("cart_items")
            .select("*")
            .eq("cart_id", cartId)
            .eq("product_id", giftProductId)
            .eq("is_gift", true);

          if (!giftItems || giftItems.length === 0) {
            // create new gift item (free)
            const { error: giftInsertErr } = await supabase
              .from("cart_items")
              .insert({
                cart_id: cartId,
                product_id: giftProductId,
                unit: "pc", // you can change if your gift is gm/variant
                quantity: giftQty,
                unit_price: 0,
                line_total: 0,
                is_gift: true,
              });

            if (giftInsertErr) {
              console.error("gift insert error:", giftInsertErr);
            } else {
              freeGiftApplied = true;
            }
          } else {
            // ensure quantity and price are correct
            const gift = giftItems[0];
            const { error: giftUpdateErr } = await supabase
              .from("cart_items")
              .update({
                quantity: giftQty,
                unit_price: 0,
                line_total: 0,
              })
              .eq("id", gift.id);

            if (giftUpdateErr) {
              console.error("gift update error:", giftUpdateErr);
            } else {
              freeGiftApplied = true;
            }
          }
        }
      }
    }
  }

  // 6) If no auto coupon qualifies -> remove any existing gift items
  if (!auto_coupon_code) {
    const { error: giftDeleteErr } = await supabase
      .from("cart_items")
      .delete()
      .eq("cart_id", cartId)
      .eq("is_gift", true);

    if (giftDeleteErr) {
      console.error("gift delete error:", giftDeleteErr);
    }
    freeGiftApplied = false;
  }

  // 7) Aggregate totals
  const discount_total = coupon_discount + auto_discount;
  const grand_total = Math.max(0, subtotal - discount_total);

  // 8) Save totals + flags on carts table
  const { data: updated, error } = await supabase
    .from("carts")
    .update({
      subtotal,
      discount_total,
      grand_total,
      coupon_discount,
      auto_discount,
      auto_coupon_code,
      free_gift_applied: freeGiftApplied,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cartId)
    .select("*")
    .single();

  if (error) throw error;

  // 9) Reload complete cart with items and return
  const full = await loadCartWithItems(cartId);
  return full;
}


/**
 * Convert internal cart row to API response structure
 * (you can adjust to match your frontend exactly)
 */
function mapCartResponse(cart) {
  const items = (cart.cart_items || []).map((it) => ({
    id: it.id,
    product_id: it.product_id,
    unit: it.unit,
    quantity: it.quantity,
    grams: it.grams,
    variant_label: it.variant_label,
    variant_grams: it.variant_grams,
    variant_price: it.variant_price,
    unit_price: it.unit_price,
    line_total: it.line_total,
    is_gift: it.is_gift,
    meta: it.meta,
  }));

  return {
    id: cart.id,
    user_id: cart.user_id,
    status: cart.status,
    currency: cart.currency,
    subtotal: Number(cart.subtotal || 0),
    discount_total: Number(cart.discount_total || 0),
    grand_total: Number(cart.grand_total || 0),

    // manual coupon
    coupon_code: cart.coupon_code,
    coupon_discount: Number(cart.coupon_discount || 0),

    // NEW: auto coupon
    auto_coupon_code: cart.auto_coupon_code,
    auto_discount: Number(cart.auto_discount || 0),

    // NEW: free gift flag
    free_gift_applied: cart.free_gift_applied || false,

    meta: cart.meta || {},
    items,
    applied_discounts: cart.applied_discounts || [],
  };
}


/**
 * Load product and compute price snapshot for a cart item.
 * This matches your gm/pc/variant model.
 */
async function resolveItemPricing({ product_id, unit, grams, variant_label }) {
  const { data: product, error } = await supabase
    .from("products")
    .select(
      `
      *,
      product_unit_options:product_unit_options (
        label,
        grams,
        price
      )
    `
    )
    .eq("id", product_id)
    .single();

  if (error || !product) throw new Error("Product not found");

  if (unit === "gm") {
    const pricePer100g = Number(product.price_per_100g || 0);
    const g = grams || 100;
    const unit_price = (g / 100) * pricePer100g;
    return { unit_price, grams: g, variant_label: null, variant_grams: null, variant_price: null };
  }

  if (unit === "pc") {
    const pricePerPc = Number(product.price_per_pc || 0);
    return { unit_price: pricePerPc, grams: null, variant_label: null, variant_grams: null, variant_price: null };
  }

  if (unit === "variant") {
    const options = product.product_unit_options || [];
    const opt = options.find((o) => o.label === variant_label) || options[0];
    if (!opt) throw new Error("Variant option not found for product");
    const unit_price = Number(opt.price || 0);
    return {
      unit_price,
      grams: null,
      variant_label: opt.label,
      variant_grams: opt.grams,
      variant_price: unit_price,
    };
  }

  throw new Error("Unsupported unit type");
}

/**
 * Controllers
 */

// GET /api/cart
export const getCart = async (req, res) => {
  const userId = getUserIdFromRequest(req);
  const incomingCartId = getCartIdFromRequest(req);

  const cart = await findOrCreateCart({ cartId: incomingCartId, userId });
  const full = await recalcTotals(cart.id);

  // If new cart, set header so frontend can store it (x-cart-id)
  res.setHeader("x-cart-id", full.id);
  return res.json(mapCartResponse(full));
};

// POST /api/cart/items
export const addItem = async (req, res) => {
  const { product_id, unit, quantity = 1, grams, variant_label } = req.body;

  if (!product_id || !unit) {
    return res.status(400).json({ error: "product_id and unit are required" });
  }

  const userId = getUserIdFromRequest(req);
  const incomingCartId = getCartIdFromRequest(req);
  const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

  const qty = Math.max(1, Number(quantity) || 1);
  const pricing = await resolveItemPricing({ product_id, unit, grams, variant_label });

  const line_total = pricing.unit_price * qty;

  const { error: insertErr } = await supabase.from("cart_items").insert({
    cart_id: cart.id,
    product_id,
    unit,
    quantity: qty,
    grams: pricing.grams,
    variant_label: pricing.variant_label,
    variant_grams: pricing.variant_grams,
    variant_price: pricing.variant_price,
    unit_price: pricing.unit_price,
    line_total,
    is_gift: false,
  });

  if (insertErr) {
    console.error("addItem insert error:", insertErr);
    return res.status(500).json({ error: "Failed to add item to cart" });
  }

  const full = await recalcTotals(cart.id);
  res.setHeader("x-cart-id", full.id);
  return res.json(mapCartResponse(full));
};

// PATCH /api/cart/items/:itemId
export const updateItem = async (req, res) => {
  const { itemId } = req.params;
  const { quantity, grams } = req.body;

  const userId = getUserIdFromRequest(req);
  const incomingCartId = getCartIdFromRequest(req);
  const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

  const { data: item, error } = await supabase
    .from("cart_items")
    .select("*")
    .eq("id", itemId)
    .eq("cart_id", cart.id)
    .single();

  if (error || !item) {
    return res.status(404).json({ error: "Cart item not found" });
  }

  let newQty = item.quantity;
  let newGrams = item.grams;

  if (typeof quantity !== "undefined") {
    newQty = Math.max(1, Number(quantity) || 1);
  }
  if (typeof grams !== "undefined" && item.unit === "gm") {
    newGrams = Number(grams) || item.grams;
  }

  // recalc unit_price / line_total if needed
  let pricing = {
    unit_price: item.unit_price,
    grams: newGrams,
    variant_label: item.variant_label,
    variant_grams: item.variant_grams,
    variant_price: item.variant_price,
  };

  if (item.unit === "gm" && typeof grams !== "undefined") {
    const p = await resolveItemPricing({
      product_id: item.product_id,
      unit: "gm",
      grams: newGrams,
      variant_label: null,
    });
    pricing = { ...pricing, ...p };
  }

  const line_total = pricing.unit_price * newQty;

  const { error: updateErr } = await supabase
    .from("cart_items")
    .update({
      quantity: newQty,
      grams: pricing.grams,
      unit_price: pricing.unit_price,
      line_total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("cart_id", cart.id);

  if (updateErr) {
    console.error("updateItem error:", updateErr);
    return res.status(500).json({ error: "Failed to update cart item" });
  }

  const full = await recalcTotals(cart.id);
  res.setHeader("x-cart-id", full.id);
  return res.json(mapCartResponse(full));
};

// DELETE /api/cart/items/:itemId
export const removeItem = async (req, res) => {
  const { itemId } = req.params;

  const userId = getUserIdFromRequest(req);
  const incomingCartId = getCartIdFromRequest(req);
  const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("id", itemId)
    .eq("cart_id", cart.id);

  if (error) {
    console.error("removeItem error:", error);
    return res.status(500).json({ error: "Failed to remove cart item" });
  }

  const full = await recalcTotals(cart.id);
  res.setHeader("x-cart-id", full.id);
  return res.json(mapCartResponse(full));
};

// POST /api/cart/apply-coupon
export const applyCoupon = async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Coupon code required" });

  const userId = getUserIdFromRequest(req);
  const incomingCartId = getCartIdFromRequest(req);
  const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

  // Basic coupon lookup (you can extend with per-user limits, dates, etc.)
  const { data: coupon, error } = await supabase
    .from("coupons")
    .select("*")
    .ilike("code", code)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !coupon) {
    return res.status(400).json({ error: "Invalid or inactive coupon" });
  }

  // Reload cart to get current subtotal
  const current = await loadCartWithItems(cart.id);
  const subtotal = Number(current.subtotal || 0);

  if (coupon.min_cart_amount && subtotal < Number(coupon.min_cart_amount)) {
    return res.status(400).json({
      error: `Minimum cart amount ₹${coupon.min_cart_amount} required for this coupon`,
    });
  }

  let couponDiscount = 0;
  if (coupon.type === "percent") {
    couponDiscount = (subtotal * Number(coupon.value)) / 100;
  } else if (coupon.type === "fixed") {
    couponDiscount = Number(coupon.value || 0);
  }
  // Optional: cap by max_discount if you add that column

  const { error: updateErr } = await supabase
    .from("carts")
    .update({
      coupon_code: coupon.code,
      coupon_discount: couponDiscount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cart.id);

  if (updateErr) {
    console.error("applyCoupon error:", updateErr);
    return res.status(500).json({ error: "Failed to apply coupon" });
  }

  const full = await recalcTotals(cart.id);
  res.setHeader("x-cart-id", full.id);
  return res.json(mapCartResponse(full));
};

// DELETE /api/cart/coupon
export const removeCoupon = async (req, res) => {
  const userId = getUserIdFromRequest(req);
  const incomingCartId = getCartIdFromRequest(req);
  const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

  const { error } = await supabase
    .from("carts")
    .update({
      coupon_code: null,
      coupon_discount: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cart.id);

  if (error) {
    console.error("removeCoupon error:", error);
    return res.status(500).json({ error: "Failed to remove coupon" });
  }

  const full = await recalcTotals(cart.id);
  res.setHeader("x-cart-id", full.id);
  return res.json(mapCartResponse(full));
};
