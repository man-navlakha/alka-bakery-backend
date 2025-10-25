import { supabase } from "../config/supabase.js";

// 🛒 Place Order (Cash Only)
export const placeOrder = async (req, res) => {
  try {
    const userId = req.user;
    const { products, total, address } = req.body;

    if (!products || !total || !address)
      return res.status(400).json({ message: "All fields are required" });

    const { data, error } = await supabase
      .from("orders")
      .insert([{ user_id: userId, products, total, address }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: "Order placed successfully", order: data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 📦 Get User Orders
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user;

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🛠 Admin: Update Order Status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const { data, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "Order status updated", order: data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// 🧁 Admin: Get All Orders
export const getAllOrders = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        users(name, email)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};