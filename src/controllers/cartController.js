import { supabase } from "../config/supabase.js";
import { randomUUID } from "node:crypto";

/**
 * ==============================
 * HELPER FUNCTIONS
 * ==============================
 */

/**
 * Extracts the Cart ID from Headers or Cookies
 */
function getCartIdFromRequest(req) {
  const headerId = req.headers["x-cart-id"];
  const cookieId = req.cookies?.cart_id;
  const id = headerId || cookieId || null;
  return id;
}

/**
 * Extracts User ID from the Request (populated by authMiddleware)
 */
function getUserIdFromRequest(req) {
  // Handle both: req.user as Object (new middleware) OR req.user as String (old middleware)
  const user = req.user;
  const userId = user?.id || user || null; 

  // Simple check: if it's still an object (unlikely with ?.id), force null to prevent DB error
  if (typeof userId === 'object') return null; 

  if (userId) {
    console.log(`👤 [Cart] User Active: ${userId}`);
  } else {
    console.log("👻 [Cart] Guest Mode");
  }
  return userId;
}
/**
 * Core Logic: Finds the correct cart for the context, handling merging if needed.
 */
async function findOrCreateCart({ cartId, userId }) {
  let userCart = null;
  let guestCart = null;

  // 1. If User is logged in, try to find their existing active cart
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

  // 2. If a Cart ID is provided (from cookie/storage), try to find that guest cart
  if (cartId) {
    const { data } = await supabase
      .from("carts")
      .select("*")
      .eq("id", cartId)
      .eq("status", "active")
      .maybeSingle();
    guestCart = data;
  }

  // 3. MERGE LOGIC: If we have both a specific Guest Cart AND a User ID
  if (userId && guestCart) {
    // Scenario A: Guest Cart belongs to THIS user already
    if (guestCart.user_id === userId) {
      return guestCart;
    }

    // Scenario B: Guest Cart is truly anonymous (no owner yet)
    if (!guestCart.user_id) {
      if (userCart) {
        // B.1: User ALREADY has an account cart. MERGE Guest Items -> User Cart
        console.log(`🔀 Merging Guest Cart ${guestCart.id} items into User Cart ${userCart.id}`);
        await mergeCartItems(guestCart.id, userCart.id);
        
        // Mark guest cart as 'merged' so it's effectively deleted/archived
        await supabase.from("carts").update({ status: "merged" }).eq("id", guestCart.id);
        
        return userCart; // Use the account cart going forward
      } else {
        // B.2: User has NO account cart. Just CLAIM the guest cart.
        console.log(`👤 Assigning Guest Cart ${guestCart.id} to User ${userId}`);
        await supabase.from("carts").update({ user_id: userId }).eq("id", guestCart.id);
        guestCart.user_id = userId;
        return guestCart;
      }
    }
  }

  // 4. Return existing User Cart (Cross-device sync)
  if (userCart) return userCart;

  // 5. Return existing Guest Cart (Guest browsing)
  if (guestCart) return guestCart;

  // 6. No cart found anywhere? Create a NEW one.
  const newId = randomUUID();
  console.log(`✨ Creating New Cart: ${newId} (User: ${userId || 'Guest'})`);
  
  const { data: created, error } = await supabase
    .from("carts")
    .insert({
      id: newId,
      user_id: userId || null, // Link immediately if user is logged in
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

/**
 * Moves items from Source Cart to Target Cart, handling duplicates by summing quantities.
 */
async function mergeCartItems(sourceCartId, targetCartId) {
  // Get all items from the guest cart
  const { data: sourceItems } = await supabase
    .from("cart_items")
    .select("*")
    .eq("cart_id", sourceCartId);

  if (!sourceItems || sourceItems.length === 0) return;

  for (const item of sourceItems) {
    // Check if this product already exists in the target (user) cart
    const { data: existing } = await supabase
      .from("cart_items")
      .select("id, quantity, unit_price")
      .eq("cart_id", targetCartId)
      .eq("product_id", item.product_id)
      .eq("unit", item.unit)
      .eq("variant_label", item.variant_label || null) // Ensure strict variant matching
      .maybeSingle();

    if (existing) {
      // Item exists: Add quantities together
      const newQty = existing.quantity + item.quantity;
      const newTotal = existing.unit_price * newQty;
      
      await supabase
        .from("cart_items")
        .update({ quantity: newQty, line_total: newTotal })
        .eq("id", existing.id);
        
      // Delete the original item from guest cart
      await supabase.from("cart_items").delete().eq("id", item.id);
    } else {
      // Item does not exist: Move it to the target cart
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
 * Recalculate Subtotal, Auto-Discounts, Free Gifts, and Grand Total
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
    const { data: autoCoupons } = await supabase
      .from("coupons")
      .select("*")
      .eq("is_auto", true)
      .eq("is_active", true)
      .lte("auto_threshold", subtotal);

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
  if (!auto_coupon_code) {
    await supabase.from("cart_items").delete().eq("cart_id", cartId).eq("is_gift", true);
    freeGiftApplied = false;
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

// cartController.js

function mapCartResponse(cart) {
  return {
    id: cart.id,
    user_id: cart.user_id,
    status: cart.status,
    subtotal: Number(cart.subtotal || 0),
    discount_total: Number(cart.discount_total || 0),
    grand_total: Number(cart.grand_total || 0),

    // 🔹 Manual coupon
    coupon_code: cart.coupon_code,
    coupon_discount: Number(cart.coupon_discount || 0),

    // 🔹 Auto discount / auto coupon
    auto_coupon_code: cart.auto_coupon_code || null,
    auto_discount: Number(cart.auto_discount || 0),

    // 🔹 Free gift flag
    free_gift_applied: !!cart.free_gift_applied,

    // Items (paid + gifts; frontend will split)
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

// GET /api/cart
export const getCart = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const incomingCartId = getCartIdFromRequest(req);

    const cart = await findOrCreateCart({ cartId: incomingCartId, userId });
    const full = await recalcTotals(cart.id);

    // Set header for frontend to update if ID changed (e.g., merged)
    res.setHeader("x-cart-id", full.id);
    return res.json(mapCartResponse(full));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get cart" });
  }
};

// POST /api/cart/items
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

    // Check merge existing item
    const { data: existingItem } = await supabase
      .from("cart_items")
      .select("*")
      .eq("cart_id", cart.id)
      .eq("product_id", product_id)
      .eq("unit", unit)
      .eq("grams", unit === 'gm' ? pricing.grams : null)
      .eq("variant_label", unit === 'variant' ? pricing.variant_label : null)
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

// PATCH /api/cart/items/:itemId
export const updateItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    
    const userId = getUserIdFromRequest(req);
    const incomingCartId = getCartIdFromRequest(req);
    const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

    // Fetch item to get price
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

// DELETE /api/cart/items/:itemId
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

// POST /api/cart/apply-coupon
export const applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = getUserIdFromRequest(req);
    const incomingCartId = getCartIdFromRequest(req);
    const cart = await findOrCreateCart({ cartId: incomingCartId, userId });

    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .ilike("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (!coupon) return res.status(400).json({ error: "Invalid coupon" });

    // Basic validation: Min cart amount
    if (coupon.min_cart_amount && cart.subtotal < coupon.min_cart_amount) {
      return res.status(400).json({ error: `Minimum spend ₹${coupon.min_cart_amount} required` });
    }

    let discount = 0;
    if (coupon.type === "percent") discount = (cart.subtotal * coupon.value) / 100;
    else discount = coupon.value;

    await supabase.from("carts").update({ 
      coupon_code: coupon.code, 
      coupon_discount: discount 
    }).eq("id", cart.id);

    const full = await recalcTotals(cart.id);
    res.setHeader("x-cart-id", full.id);
    return res.json(mapCartResponse(full));
  } catch (error) {
    res.status(500).json({ error: "Failed to apply coupon" });
  }
};

// DELETE /api/cart/coupon
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