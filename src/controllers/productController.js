import { supabase } from "../config/supabase.js";
import cloudinary from "../config/cloudinary.js";

// 🥐 Add Product
export const addProduct = async (req, res) => {
  try {
    const { name, price, category, description } = req.body;
    if (!name || !price) return res.status(400).json({ message: "Name and price required" });

    let imageUrl = null;
    if (req.files && req.files.image) {
      const file = req.files.image;
      const uploadResult = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: "alka-bakery",
      });
      imageUrl = uploadResult.secure_url;
    }

    const { data, error } = await supabase
      .from("products")
      .insert([{ name, price, category, description, image: imageUrl }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: "Product added", product: data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, description } = req.body;

    let updateData = { name, price, category, description };

    if (req.files && req.files.image) {
      const file = req.files.image;
      const uploadResult = await cloudinary.uploader.upload(file.tempFilePath, { folder: "alka-bakery" });
      updateData.image = uploadResult.secure_url;
    }

    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "Product updated", product: data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Product (Admin)
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("products")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "Product deleted", product: data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// 🍰 Get All Products
export const getProducts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🎂 Get Single Product
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return res.status(404).json({ message: "Product not found" });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
