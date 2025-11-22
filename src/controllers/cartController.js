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
  const id = headerId || cookieId || null;
  return id;
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
        variant_grams, variant_price, unit_price, line_total, is_gift, meta
      )
    `)
    .eq("id", cartId)
    .single();

  if (error) throw error;
  return cart;
}

/**
 * 🔹 CORE LOGIC: Recalculate Totals, Apply Coupons (Manual & Auto), Add/Remove Gifts
 */
async function recalcTotals(cartId) {
  const cart = await loadCartWithItems(cartId);
  const items = cart.cart_items || [];

  // 1. Calculate Subtotal (exclude gifts from sum)
  const subtotal = items
    .filter((it) => !it.is_gift)
    .reduce((sum, it) => sum + Number(it.line_total || 0), 0);

  // State for calculation
  let coupon_discount = 0;
  let auto_discount = 0;
  let active_coupon_code = null; // To store the code of the *effective* coupon (manual or auto)
  let final_auto_code = null;
  let final_manual_code = cart.coupon_code;
  let freeGiftApplied = false;
  let activeCouponObj = null;

  // 2. Check Manual Coupon Validity
  if (final_manual_code) {
    const { data: manualCoupon } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", final_manual_code)
      .eq("is_active", true)
      .maybeSingle();

    if (manualCoupon) {
      // Check requirements
      if (subtotal >= (manualCoupon.min_cart_amount || 0)) {
        activeCouponObj = manualCoupon;
        active_coupon_code = manualCoupon.code;
        
        // Calculate Discount
        if (manualCoupon.type === "percent") {
          coupon_discount = (subtotal * Number(manualCoupon.value)) / 100;
        } else {
          coupon_discount = Number(manualCoupon.value);
        }
      } else {
        // Threshold not met -> Disable manual coupon effects (but keep code or remove? usually remove if invalid)
        // For better UX, we remove it if invalid so user knows.
        final_manual_code = null; 
      }
    } else {
      // Invalid/Inactive -> Remove
      final_manual_code = null;
    }
  }

  // 3. Check Auto Coupon (Only if no manual coupon is active)
  // Note: Some systems stack, but typical logic is Manual > Auto.


   let bestAuto = null;
  let bestAutoDiscount = 0;
  if (subtotal > 0) {
    const { data: autoCoupons } = await supabase
      .from("coupons")
      .select("*")
      .eq("is_auto", true)
      .eq("is_active", true)
      .lte("auto_threshold", subtotal)
      .order("value", { ascending: false });

    if (autoCoupons && autoCoupons.length > 0) {
      for (const c of autoCoupons) {
        let d = 0;
        if (c.type === "percent") d = (subtotal * Number(c.value)) / 100;
        else d = Number(c.value);

        if (d > bestAutoDiscount) {
          bestAutoDiscount = d;
          bestAuto = c;
        }
      }
    }
  }

  if (bestAuto) {
    final_auto_code = bestAuto.code;
    auto_discount = bestAutoDiscount;
    // NOTE: we intentionally DO NOT set:
    // activeCouponObj = bestAuto;
    // This prevents auto coupon from auto-applying gifts or changing totals.
  } else {
    final_auto_code = null;
    auto_discount = 0;
  }

  // 4. Apply Free Gift (Based on whichever coupon is ACTIVE)
  // 4. Apply Free Gift (ONLY if a manual coupon is active and it grants a gift)
  if (activeCouponObj && activeCouponObj.free_gift_product_id) {
    const giftId = activeCouponObj.free_gift_product_id;
    const giftQty = activeCouponObj.free_gift_qty || 1;

    const existingGift = items.find(i => i.product_id === giftId && i.is_gift);

    if (!existingGift) {
      // Add Gift
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
      // Update Gift Qty
      await supabase.from("cart_items").update({ quantity: giftQty }).eq("id", existingGift.id);
    }
    freeGiftApplied = true;
  } else {
    // No manual active gift-coupon -> ensure gifts are removed
    freeGiftApplied = false;
  }

  // 5. Cleanup Invalid Gifts
  // If freeGiftApplied is true, we must ensure NO OTHER gifts exist (e.g. from previous coupon)
  // 5. Cleanup invalid gifts
  if (freeGiftApplied && activeCouponObj) {
    // keep gift matching activeCouponObj, remove other gifts
    await supabase.from("cart_items")
      .delete()
      .eq("cart_id", cartId)
      .eq("is_gift", true)
      .neq("product_id", activeCouponObj.free_gift_product_id);
  } else {
    // remove all gifts if none should be applied
    await supabase.from("cart_items")
      .delete()
      .eq("cart_id", cartId)
      .eq("is_gift", true);
  }


  // 6. Update Cart Record
  const discount_total = coupon_discount + auto_discount;
  const grand_total = Math.max(0, subtotal - discount_total);

  const { error } = await supabase
    .from("carts")
    .update({
      subtotal,
      discount_total,
      grand_total,
      coupon_discount,
      coupon_code: final_manual_code, // Update manual code (might have been removed)
      auto_discount,
      auto_coupon_code: final_auto_code,
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
    items: (cart.cart_items || []).map((it) => ({
      id: it.id,
      product_id: it.product_id,
      unit: it.unit,
      quantity: it.quantity,
      grams: it.grams,
      variant_label: it.variant_label,
      line_total: Number(it.line_total || 0),
      is_gift: !!it.is_gift,
    })),
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

// GET /api/cart/coupons
export const getAvailableCoupons = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("coupons")
      .select("code, description, type, value, min_cart_amount")
      .eq("is_active", true)
      .order("min_cart_amount", { ascending: true });

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error("getAvailableCoupons error:", error);
    res.status(500).json({ error: "Failed to load coupons" });
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
      .eq("is_gift", false) 
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

    await supabase.from("cart_items").delete().eq("id", itemId).eq("cart_id", cart.id);

    const full = await recalcTotals(cart.id);
    res.setHeader("x-cart-id", full.id);
    return res.json(mapCartResponse(full));
  } catch (error) {
    res.status(500).json({ error: "Failed to remove item" });
  }
};

export const applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = getUserIdFromRequest(req);
    const incomingCartId = getCartIdFromRequest(req);
    const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

    // We simply update the code here. recalcTotals handles validation and logic.
    // (This allows recalcTotals to be the single source of truth for validation logic)
    
    // First quick check to see if coupon exists before attaching
    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .ilike("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (!coupon) return res.status(400).json({ error: "Invalid coupon" });

    // Attach code to cart temporarily
    await supabase.from("carts").update({ 
      coupon_code: coupon.code, 
      // coupon_discount will be calculated in recalcTotals
    }).eq("id", cart.id);

    const full = await recalcTotals(cart.id);
    
    // If recalcTotals removed the code (due to threshold), warn user
    if (!full.coupon_code) {
       return res.status(400).json({ error: `Coupon valid but threshold not met (Min ₹${coupon.min_cart_amount || 0})` });
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