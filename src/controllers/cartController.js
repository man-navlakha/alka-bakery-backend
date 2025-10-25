import { supabase } from "../config/supabase.js";

/**
 * 🛒 Add or Update Cart Item
 */
export const addToCart = async (req, res) => {
  try {
    const userId = req.user; // Must be Supabase Auth UUID
    const { product_id, quantity } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!product_id || !quantity) return res.status(400).json({ message: "Product ID and quantity required" });

    // Fetch product info
    const { data: product, error: prodError } = await supabase
      .from("products")
      .select("*")
      .eq("id", product_id)
      .single();

    if (prodError || !product) return res.status(404).json({ message: "Product not found" });

    // Check if item exists in cart
    const { data: existingItem } = await supabase
      .from("cart")
      .select("*")
      .eq("user_id", userId)
      .eq("product_id", product_id)
      .single();

    if (existingItem) {
      // Update quantity
      const { data, error } = await supabase
        .from("cart")
        .update({ quantity: existingItem.quantity + quantity })
        .eq("id", existingItem.id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ message: "Cart updated", cart: data });
    }

    // Insert new cart item
    const { data, error } = await supabase
      .from("cart")
      .insert([{
        user_id: userId,
        product_id,
        name: product.name,
        price: product.price,
        image: product.image || null,
        quantity
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: "Added to cart", cart: data });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * 📋 Get User Cart
 */
export const getUserCart = async (req, res) => {
  try {
    const userId = req.user;

    const { data, error } = await supabase
      .from("cart")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ✏️ Update Cart Item Quantity
 */
export const updateCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity <= 0) return res.status(400).json({ message: "Quantity must be > 0" });

    const { data, error } = await supabase
      .from("cart")
      .update({ quantity })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "Cart item updated", cart: data });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ❌ Remove Cart Item
 */
export const removeCartItem = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("cart")
      .delete()
      .eq("id", id);

    if (error) throw error;
    res.json({ message: "Item removed from cart" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
