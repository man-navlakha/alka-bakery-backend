// src/controllers/cartController.js
import { supabase } from "../config/supabase.js";
import { randomUUID } from "node:crypto";

/**
 * ==============================
 * HELPER FUNCTIONS
 * ==============================
 */

function getCartIdFromRequest(req) {
  const headerId = req.headers["x-cart-id"];
  const cookieId = req.cookies?.cart_id;
  return headerId || cookieId || null;
}

function getUserIdFromRequest(req) {
  const user = req.user;
  const userId = user?.id || user || null;
  if (typeof userId === 'object') return null;
  return userId;
}

async function findOrCreateCart({ cartId, userId }) {
  let userCart = null;
  let guestCart = null;

  if (userId) {
    const { data } = await supabase
      .from("carts")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    userCart = data;
  }

  if (cartId) {
    const { data } = await supabase
      .from("carts")
      .select("*")
      .eq("id", cartId)
      .eq("status", "active")
      .maybeSingle();
    guestCart = data;
  }

  if (userId && guestCart) {
    if (guestCart.user_id === userId) {
      return guestCart;
    }
    if (!guestCart.user_id) {
      if (userCart) {
        await mergeCartItems(guestCart.id, userCart.id);
        await supabase.from("carts").update({ status: "merged" }).eq("id", guestCart.id);
        return userCart;
      } else {
        await supabase.from("carts").update({ user_id: userId }).eq("id", guestCart.id);
        guestCart.user_id = userId;
        return guestCart;
      }
    }
  }

  if (userCart) return userCart;
  if (guestCart) return guestCart;

  const newId = randomUUID();
  const { data: created, error } = await supabase
    .from("carts")
    .insert({
      id: newId,
      user_id: userId || null,
      status: "active",
      currency: "INR",
      subtotal: 0,
      discount_total: 0,
      grand_total: 0,
    })
    .select("*")
    .single();

  if (error) throw error;
  return created;
}

async function mergeCartItems(sourceCartId, targetCartId) {
  const { data: sourceItems } = await supabase
    .from("cart_items")
    .select("*")
    .eq("cart_id", sourceCartId);

  if (!sourceItems || sourceItems.length === 0) return;

  for (const item of sourceItems) {
    const { data: existing } = await supabase
      .from("cart_items")
      .select("id, quantity, unit_price")
      .eq("cart_id", targetCartId)
      .eq("product_id", item.product_id)
      .eq("unit", item.unit)
      .eq("variant_label", item.variant_label || null)
      .maybeSingle();

    if (existing) {
      const newQty = existing.quantity + item.quantity;
      const newTotal = existing.unit_price * newQty;
      await supabase
        .from("cart_items")
        .update({ quantity: newQty, line_total: newTotal })
        .eq("id", existing.id);
      await supabase.from("cart_items").delete().eq("id", item.id);
    } else {
      await supabase
        .from("cart_items")
        .update({ cart_id: targetCartId })
        .eq("id", item.id);
    }
  }
}



async function loadCartWithItems(cartId) {
  const { data: cart, error } = await supabase
    .from("carts")
    .select(`
      *,
      cart_items:cart_items (
        id, product_id, unit, quantity, grams, variant_label, 
        variant_grams, variant_price, unit_price, line_total, is_gift, meta,
        products ( 
          name, 
          product_images ( url, position ) 
        ) 
      )
    `)
    // ^ FIXED: Removed 'image', added 'product_images ( url, position )'
    .eq("id", cartId)
    .single();

  if (error) throw error;
  return cart;
}

/**
 * 🛠️ FIXED: Comprehensive Recalculation Logic
 * Handles both Manual and Auto coupons + Free Gifts correctly.
 */
async function recalcTotals(cartId) {
  const cart = await loadCartWithItems(cartId);
  const items = cart.cart_items || [];

  // 1. Calculate Subtotal
  const subtotal = items
    .filter((it) => !it.is_gift)
    .reduce((sum, it) => sum + Number(it.line_total || 0), 0);

  const coupon_discount = Number(cart.coupon_discount || 0);
  let auto_discount = 0;
  let auto_coupon_code = null;
  let freeGiftApplied = false;

  // 2. Check Auto-Coupons / Free Gifts
  if (subtotal > 0) {
    let query = supabase
      .from("coupons")
      .select("*")
      .eq("is_auto", true)
      .eq("is_active", true)
      .lte("auto_threshold", subtotal);

    // Prevent double dipping: If a manual coupon is applied, exclude it from auto-check
    if (cart.coupon_code) {
      query = query.neq("code", cart.coupon_code);
    }

    const { data: autoCoupons } = await query;

    if (autoCoupons && autoCoupons.length > 0) {
      // Pick best discount
      let bestCoupon = null;
      let maxDiscount = 0;

      for (const c of autoCoupons) {
        let d = 0;
        if (c.type === "percent") d = (subtotal * Number(c.value)) / 100;
        else if (c.type === "fixed") d = Number(c.value || 0);
        
        if (d >= maxDiscount) {
          maxDiscount = d;
          bestCoupon = c;
        }
      }

      if (bestCoupon) {
        auto_discount = maxDiscount;
        auto_coupon_code = bestCoupon.code;

        // Apply Free Gift if configured
        if (bestCoupon.free_gift_product_id) {
          const giftId = bestCoupon.free_gift_product_id;
          const giftQty = bestCoupon.free_gift_qty || 1;

          // Check if gift exists
          const existingGift = items.find(i => i.product_id === giftId && i.is_gift);
          
          if (!existingGift) {
            await supabase.from("cart_items").insert({
              cart_id: cartId,
              product_id: giftId,
              unit: "pc",
              quantity: giftQty,
              unit_price: 0,
              line_total: 0,
              is_gift: true
            });
          } else if (existingGift.quantity !== giftQty) {
             await supabase.from("cart_items").update({ quantity: giftQty }).eq("id", existingGift.id);
          }
          freeGiftApplied = true;
        }
      }
    }
  }
// 3. Cleanup invalid gifts
  if (!freeGiftApplied) {
    await supabase.from("cart_items").delete().eq("cart_id", cartId).eq("is_gift", true);
  }

  // 4. Update Cart Totals
  const discount_total = coupon_discount + auto_discount;
  const grand_total = Math.max(0, subtotal - discount_total);

  const { error } = await supabase
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
    .eq("id", cartId);

  if (error) throw error;

  return await loadCartWithItems(cartId);
}


function mapCartResponse(cart) {
  return {
    id: cart.id,
    user_id: cart.user_id,
    status: cart.status,
    subtotal: Number(cart.subtotal || 0),
    discount_total: Number(cart.discount_total || 0),
    grand_total: Number(cart.grand_total || 0),
    coupon_code: cart.coupon_code,
    coupon_discount: Number(cart.coupon_discount || 0),
    auto_coupon_code: cart.auto_coupon_code || null,
    auto_discount: Number(cart.auto_discount || 0),
    free_gift_applied: !!cart.free_gift_applied,
    items: (cart.cart_items || []).map((it) => {
      // Extract the first image from the sorted array (if available)
      const images = it.products?.product_images || [];
      // Optional: Sort by position if you have that column, otherwise just take the first
      const firstImage = images.sort((a, b) => (a.position || 0) - (b.position || 0))[0]?.url;

      return {
        id: it.id,
        product_id: it.product_id,
        product_name: it.products?.name,       // ✅ Correctly mapped name
        product_image: firstImage || null,     // ✅ Correctly mapped image URL
        unit: it.unit,
        quantity: it.quantity,
        grams: it.grams,
        variant_label: it.variant_label,
        line_total: Number(it.line_total || 0),
        is_gift: !!it.is_gift,
      };
    }),
  };
}

async function resolveItemPricing({ product_id, unit, grams, variant_label }) {
  const { data: product } = await supabase
    .from("products")
    .select(`*, product_unit_options(label, grams, price)`)
    .eq("id", product_id)
    .single();

  if (!product) throw new Error("Product not found");

  let unit_price = 0;
  let finalGrams = null;

  if (unit === "gm") {
    finalGrams = grams || 100;
    unit_price = (finalGrams / 100) * Number(product.price_per_100g || 0);
  } else if (unit === "pc") {
    unit_price = Number(product.price_per_pc || 0);
  } else if (unit === "variant") {
    const opt = product.product_unit_options?.find(o => o.label === variant_label);
    if (!opt) throw new Error("Variant not found");
    unit_price = Number(opt.price || 0);
    finalGrams = opt.grams;
  }

  return { unit_price, grams: finalGrams, variant_label, variant_grams: finalGrams, variant_price: unit_price };
}

/**
 * ==============================
 * CONTROLLERS
 * ==============================
 */

export const getCart = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const incomingCartId = getCartIdFromRequest(req);
    const cart = await findOrCreateCart({ cartId: incomingCartId, userId });
    const full = await recalcTotals(cart.id);
    res.setHeader("x-cart-id", full.id);
    return res.json(mapCartResponse(full));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get cart" });
  }
};

export const addItem = async (req, res) => {
  try {
    const { product_id, unit, quantity = 1, grams, variant_label } = req.body;
    if (!product_id || !unit) return res.status(400).json({ error: "Missing required fields" });

    const userId = getUserIdFromRequest(req);
    const incomingCartId = getCartIdFromRequest(req);
    const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

    const qty = Math.max(1, Number(quantity));
    const pricing = await resolveItemPricing({ product_id, unit, grams, variant_label });
    const line_total = pricing.unit_price * qty;

    const { data: existingItem } = await supabase
      .from("cart_items")
      .select("*")
      .eq("cart_id", cart.id)
      .eq("product_id", product_id)
      .eq("unit", unit)
      .eq("grams", unit === 'gm' ? pricing.grams : null)
      .eq("variant_label", unit === 'variant' ? pricing.variant_label : null)
      .eq("is_gift", false) // Don't merge with gift items
      .maybeSingle();

    if (existingItem) {
      await supabase.from("cart_items")
        .update({ quantity: existingItem.quantity + qty, line_total: (existingItem.quantity + qty) * pricing.unit_price })
        .eq("id", existingItem.id);
    } else {
      await supabase.from("cart_items").insert({
        cart_id: cart.id,
        product_id,
        unit,
        quantity: qty,
        grams: pricing.grams,
        variant_label: pricing.variant_label,
        unit_price: pricing.unit_price,
        line_total,
        is_gift: false
      });
    }

    const full = await recalcTotals(cart.id);
    res.setHeader("x-cart-id", full.id);
    return res.json(mapCartResponse(full));
  } catch (error) {
    console.error("AddItem Error:", error);
    res.status(500).json({ error: error.message });
  }
};

export const updateItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const userId = getUserIdFromRequest(req);
    const incomingCartId = getCartIdFromRequest(req);
    const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

    const { data: item } = await supabase
      .from("cart_items")
      .select("*")
      .eq("id", itemId)
      .eq("cart_id", cart.id)
      .single();

    if (!item) return res.status(404).json({ error: "Item not found" });
    if (item.is_gift) return res.status(400).json({ error: "Cannot modify gift items directly" });

    const newQty = Math.max(1, Number(quantity));
    const newTotal = item.unit_price * newQty;

    await supabase.from("cart_items").update({ quantity: newQty, line_total: newTotal }).eq("id", itemId);

    const full = await recalcTotals(cart.id);
    res.setHeader("x-cart-id", full.id);
    return res.json(mapCartResponse(full));
  } catch (error) {
    res.status(500).json({ error: "Failed to update item" });
  }
};

export const removeItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = getUserIdFromRequest(req);
    const incomingCartId = getCartIdFromRequest(req);
    const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

    // Prevent deleting gifts manually if you want, or allow it (logic below will re-add it if criteria met)
    await supabase.from("cart_items").delete().eq("id", itemId).eq("cart_id", cart.id);

    const full = await recalcTotals(cart.id);
    res.setHeader("x-cart-id", full.id);
    return res.json(mapCartResponse(full));
  } catch (error) {
    res.status(500).json({ error: "Failed to remove item" });
  }
};


export const getAvailableCoupons = async (req, res) => {
  try {
    // Fetch active "auto" coupons which act as public offers
    const { data, error } = await supabase
      .from("coupons")
      .select("code, description, type, value, min_cart_amount")
      .eq("is_active", true)
      .eq("is_auto", true)
      .order("min_cart_amount", { ascending: true });

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error("getAvailableCoupons error:", error);
    res.status(500).json({ error: "Failed to load coupons" });
  }
};


export const applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = getUserIdFromRequest(req);
    const incomingCartId = getCartIdFromRequest(req);
    const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

    // Just set the code here. recalcTotals handles validation and gifts.
    await supabase.from("carts").update({ 
      coupon_code: code ? code.trim().toUpperCase() : null
    }).eq("id", cart.id);

    // This will validate the coupon we just set and apply effects
    const full = await recalcTotals(cart.id);
    
    // Check if the code stuck (valid) or was removed (invalid)
    if (code && !full.coupon_code) {
       return res.status(400).json({ error: "Invalid or inapplicable coupon code" });
    }

    res.setHeader("x-cart-id", full.id);
    return res.json(mapCartResponse(full));
  } catch (error) {
    res.status(500).json({ error: "Failed to apply coupon" });
  }
};

export const removeCoupon = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const incomingCartId = getCartIdFromRequest(req);
    const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

    await supabase.from("carts").update({ coupon_code: null, coupon_discount: 0 }).eq("id", cart.id);

    const full = await recalcTotals(cart.id);
    res.setHeader("x-cart-id", full.id);
    return res.json(mapCartResponse(full));
  } catch (error) {
    res.status(500).json({ error: "Failed to remove coupon" });
  }
};