import { supabase } from "../config/supabase.js";

// --- Configuration (Move to .env ideally) ---
const GIFT_WRAP_COST = 50; // Set your fixed gift wrap cost here

// --- Helper Functions ---

// Get or Create Cart for User
const getOrCreateCart = async (userId) => {
    let { data: cart, error } = await supabase
        .from('carts')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: Row not found
        throw error;
    }

    if (!cart) {
        // Create a new cart for the user
        const { data: newCart, error: createError } = await supabase
            .from('carts')
            .insert({ user_id: userId })
            .select('*')
            .single();
        if (createError) throw createError;
        cart = newCart;
    }
    return cart;
};

// Calculate Cart Totals (Subtotal, Discount, Gift Wrap, Total)
const calculateCartTotals = (items, coupon, isGiftWrapped) => {
    let subtotal = 0;
    let requiresGiftWrapOption = false;

    items.forEach(item => {
        // Base price comes from the product, modifier from the variant
        const basePrice = item.product_variants.products.price || 0;
        const salePrice = item.product_variants.products.sale_price;
        const onSale = item.product_variants.products.on_sale;
        const priceModifier = item.product_variants.price_modifier || 0;
        
        // Use sale price if applicable, otherwise base price
        const effectiveBase = (onSale && salePrice !== null) ? salePrice : basePrice;

        const itemPrice = effectiveBase + priceModifier;
        subtotal += itemPrice * item.quantity;

        if (item.product_variants.products.is_gift_wrappable) {
            requiresGiftWrapOption = true;
        }
    });

    let discountAmount = 0;
    if (coupon && coupon.is_active) {
        // Check expiry
        const now = new Date();
        const expiry = coupon.expiry_date ? new Date(coupon.expiry_date) : null;
        if (expiry && expiry < now) {
           coupon = null; // Coupon expired
        } else if (subtotal >= coupon.min_spend) {
            if (coupon.discount_type === 'percentage') {
                discountAmount = (subtotal * coupon.discount_value) / 100;
            } else if (coupon.discount_type === 'fixed') {
                discountAmount = coupon.discount_value;
            }
            // Ensure discount doesn't exceed subtotal
            discountAmount = Math.min(discountAmount, subtotal); 
        } else {
             coupon = null; // Didn't meet min spend
        }
    } else {
        coupon = null; // Coupon not active or doesn't exist
    }


    const giftWrapCost = (isGiftWrapped && requiresGiftWrapOption) ? GIFT_WRAP_COST : 0;
    const total = subtotal - discountAmount + giftWrapCost;

    return {
        subtotal: parseFloat(subtotal.toFixed(2)),
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        giftWrapCost: parseFloat(giftWrapCost.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
        appliedCoupon: coupon ? { code: coupon.code, description: coupon.description, value: coupon.discount_value, type: coupon.discount_type } : null,
        requiresGiftWrapOption // Let frontend know if gift wrap is applicable
    };
};


// Helper to check quantity rules
function isStepValid(value, step) {
    const val1000 = Math.round(value * 1000);
    const step1000 = Math.round(step * 1000);
    return Math.abs(val1000 % step1000) < 1e-5;
}


// --- API Functions ---

/**
 * @desc    Get User's Cart Details
 * @route   GET /api/cart
 * @access  Private
 */
export const getCart = async (req, res) => {
    try {
        const userId = req.user;
        const cart = await getOrCreateCart(userId);

        // Fetch cart items with necessary product and variant details
        const { data: items, error: itemsError } = await supabase
            .from('cart_items')
            .select(`
                *,
                product_variants (
                    *,
                    units ( name ),
                    products ( name, image, price, sale_price, on_sale, is_customizable, is_gift_wrappable )
                )
            `)
            .eq('cart_id', cart.id)
            .order('created_at', { ascending: true });

        if (itemsError) throw itemsError;

        // Fetch applied coupon details if any
        let coupon = null;
        if (cart.applied_coupon_id) {
            const { data: couponData, error: couponError } = await supabase
                .from('coupons')
                .select('*')
                .eq('id', cart.applied_coupon_id)
                .single();
            if (couponError && couponError.code !== 'PGRST116') throw couponError;
            coupon = couponData;
        }

        const totals = calculateCartTotals(items || [], coupon, cart.is_gift_wrapped);

        res.json({
            id: cart.id,
            user_id: cart.user_id,
            items: items || [],
            is_gift_wrapped: cart.is_gift_wrapped,
            ...totals // Includes subtotal, discountAmount, giftWrapCost, total, appliedCoupon, requiresGiftWrapOption
        });

    } catch (error) {
        console.error("Get Cart Error:", error);
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Add or Update Item in Cart
 * @route   POST /api/cart/item
 * @access  Private
 */
export const addOrUpdateItem = async (req, res) => {
    try {
        const userId = req.user;
        const { product_variant_id, quantity, customization_note } = req.body; // Quantity is the amount to ADD or the NEW total? Let's assume ADD.

        if (!product_variant_id || !quantity || quantity <= 0) {
            return res.status(400).json({ message: "Product Variant ID and positive quantity required." });
        }

        const cart = await getOrCreateCart(userId);

        // Fetch variant details including rules and product info
        const { data: variant, error: variantError } = await supabase
            .from('product_variants')
            .select(`
                *,
                products ( is_customizable ) 
            `)
            .eq('id', product_variant_id)
            .single();

        if (variantError || !variant) return res.status(404).json({ message: "Product Variant not found." });
        if (!variant.is_available) return res.status(400).json({ message: "This variant is currently unavailable." });

        // Check if item already exists in cart
        const { data: existingItem, error: existingError } = await supabase
            .from('cart_items')
            .select('id, quantity')
            .eq('cart_id', cart.id)
            .eq('product_variant_id', product_variant_id)
            .single();

        if (existingError && existingError.code !== 'PGRST116') throw existingError;

        const currentQuantity = existingItem ? existingItem.quantity : 0;
        const newTotalQuantity = currentQuantity + quantity;

        // --- Validation ---
        const { min_quantity, max_quantity, quantity_step } = variant;
        if (newTotalQuantity < min_quantity) {
          return res.status(400).json({ message: `Minimum quantity is ${min_quantity}.` });
        }
        if (newTotalQuantity > max_quantity) {
          return res.status(400).json({ message: `Maximum quantity is ${max_quantity}.` });
        }
        if (!isStepValid(newTotalQuantity, quantity_step)) {
           return res.status(400).json({ message: `Quantity must be in increments of ${quantity_step}.` });
        }

        // Validate note only if product is customizable
        const finalNote = variant.products.is_customizable ? customization_note : null;


        // Update or Insert
        if (existingItem) {
            const { data, error } = await supabase
                .from('cart_items')
                .update({ quantity: newTotalQuantity, customization_note: finalNote, updated_at: new Date() })
                .eq('id', existingItem.id)
                .select()
                .single();
            if (error) throw error;
            res.json({ message: "Cart item updated", item: data });
        } else {
            const { data, error } = await supabase
                .from('cart_items')
                .insert({
                    cart_id: cart.id,
                    product_variant_id: product_variant_id,
                    quantity: newTotalQuantity,
                    customization_note: finalNote
                })
                .select()
                .single();
            if (error) throw error;
            res.status(201).json({ message: "Item added to cart", item: data });
        }

    } catch (error) {
        console.error("Add/Update Cart Item Error:", error);
        res.status(500).json({ message: error.message });
    }
};


/**
 * @desc    Update specific cart item (e.g., set quantity, update note)
 * @route   PUT /api/cart/item/:itemId
 * @access  Private
 */
export const updateCartItemDetails = async (req, res) => {
    try {
        const userId = req.user;
        const itemId = req.params.itemId;
        const { quantity, customization_note } = req.body; // Expecting the NEW total quantity or new note

        if (quantity === undefined && customization_note === undefined) {
             return res.status(400).json({ message: "Provide quantity or customization_note to update." });
        }
        if (quantity !== undefined && (typeof quantity !== 'number' || quantity <= 0)) {
            return res.status(400).json({ message: "Quantity must be a positive number." });
        }

        const cart = await getOrCreateCart(userId); // Ensure cart exists

        // Fetch the item and its variant rules
        const { data: item, error: itemError } = await supabase
            .from('cart_items')
            .select(`
                *,
                product_variants ( min_quantity, max_quantity, quantity_step, products( is_customizable ) )
            `)
            .eq('id', itemId)
            .eq('cart_id', cart.id) // Ensure item belongs to user's cart
            .single();
        
        if (itemError || !item) return res.status(404).json({ message: "Cart item not found." });

        const updatePayload = { updated_at: new Date() };

        // Validate and add quantity if provided
        if (quantity !== undefined) {
            const { min_quantity, max_quantity, quantity_step } = item.product_variants;
            if (quantity < min_quantity || quantity > max_quantity || !isStepValid(quantity, quantity_step)) {
                return res.status(400).json({ message: `Invalid quantity. Min: ${min_quantity}, Max: ${max_quantity}, Step: ${quantity_step}.` });
            }
            updatePayload.quantity = quantity;
        }

        // Add note if provided and product is customizable
        if (customization_note !== undefined) {
            if (item.product_variants.products.is_customizable) {
                updatePayload.customization_note = customization_note;
            } else {
                 return res.status(400).json({ message: "This product cannot be customized." });
            }
        }
        
        // Perform update
        const { data: updatedItem, error: updateError } = await supabase
            .from('cart_items')
            .update(updatePayload)
            .eq('id', itemId)
            .select()
            .single();

        if (updateError) throw updateError;
        
        res.json({ message: "Cart item details updated", item: updatedItem });

    } catch (error) {
        console.error("Update Cart Item Details Error:", error);
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Remove Item from Cart
 * @route   DELETE /api/cart/item/:itemId
 * @access  Private
 */
export const removeItem = async (req, res) => {
    try {
        const userId = req.user;
        const itemId = req.params.itemId;
        const cart = await getOrCreateCart(userId);

        const { error } = await supabase
            .from('cart_items')
            .delete()
            .eq('id', itemId)
            .eq('cart_id', cart.id); // Ensure user owns this item

        if (error) throw error;

        // Check if the item was actually deleted (optional)
        // const { count } = await supabase... // Check count

        res.json({ message: "Item removed from cart" });

    } catch (error) {
        console.error("Remove Cart Item Error:", error);
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Apply Coupon to Cart
 * @route   POST /api/cart/coupon
 * @access  Private
 */
export const applyCoupon = async (req, res) => {
    try {
        const userId = req.user;
        const { code } = req.body;

        if (!code) return res.status(400).json({ message: "Coupon code is required." });

        const cart = await getOrCreateCart(userId);

        // Find the coupon
        const { data: coupon, error: couponError } = await supabase
            .from('coupons')
            .select('*')
            .eq('code', code.trim().toUpperCase()) // Case-insensitive lookup
            .single();

        if (couponError || !coupon) return res.status(404).json({ message: "Invalid coupon code." });
        if (!coupon.is_active) return res.status(400).json({ message: "This coupon is no longer active." });

        // Check expiry
        const now = new Date();
        const expiry = coupon.expiry_date ? new Date(coupon.expiry_date) : null;
        if (expiry && expiry < now) {
            return res.status(400).json({ message: "This coupon has expired." });
        }

        // Check min spend (requires fetching items and calculating subtotal first)
         const { data: items, error: itemsError } = await supabase
            .from('cart_items')
            .select(`*, product_variants (price_modifier, products(price, sale_price, on_sale))`)
            .eq('cart_id', cart.id);
        if (itemsError) throw itemsError;
        
        const totals = calculateCartTotals(items || [], coupon, cart.is_gift_wrapped);
        if (totals.subtotal < coupon.min_spend) {
            return res.status(400).json({ message: `Minimum spend of ${coupon.min_spend} required for this coupon.` });
        }

        // Apply coupon to cart
        const { error: updateError } = await supabase
            .from('carts')
            .update({ applied_coupon_id: coupon.id, updated_at: new Date() })
            .eq('id', cart.id);

        if (updateError) throw updateError;

        // Return updated cart details
        await getCart(req, res); // Reuse getCart to send full updated cart state

    } catch (error) {
        console.error("Apply Coupon Error:", error);
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Remove Coupon from Cart
 * @route   DELETE /api/cart/coupon
 * @access  Private
 */
export const removeCoupon = async (req, res) => {
    try {
        const userId = req.user;
        const cart = await getOrCreateCart(userId);

        const { error: updateError } = await supabase
            .from('carts')
            .update({ applied_coupon_id: null, updated_at: new Date() })
            .eq('id', cart.id);

        if (updateError) throw updateError;

        // Return updated cart details
        await getCart(req, res);

    } catch (error) {
        console.error("Remove Coupon Error:", error);
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Toggle Gift Wrapping for Cart
 * @route   PUT /api/cart/giftwrap
 * @access  Private
 */
export const setGiftWrap = async (req, res) => {
     try {
        const userId = req.user;
        const { is_gift_wrapped } = req.body; // Expect boolean true/false

        if (typeof is_gift_wrapped !== 'boolean') {
            return res.status(400).json({ message: "is_gift_wrapped must be true or false." });
        }

        const cart = await getOrCreateCart(userId);

        const { error: updateError } = await supabase
            .from('carts')
            .update({ is_gift_wrapped: is_gift_wrapped, updated_at: new Date() })
            .eq('id', cart.id);
        
        if (updateError) throw updateError;

        // Return updated cart details
        await getCart(req, res);

    } catch (error) {
        console.error("Set Gift Wrap Error:", error);
        res.status(500).json({ message: error.message });
    }
};