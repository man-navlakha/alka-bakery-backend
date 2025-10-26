import asyncHandler from "express-async-handler";
import { supabase } from "../config/supabase.js";

/**
 * @desc Create a new category
 * @route POST /api/categories
 * @access Admin
 */
export const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    res.status(400);
    throw new Error("Category name is required");
  }

  // Check if category already exists
  const { data: existing, error: existingError } = await supabase
    .from("categories")
    .select("*")
    .eq("name", name)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing) {
    res.status(400);
    throw new Error("Category already exists");
  }

  // Insert new category
  const { data, error } = await supabase
    .from("categories")
    .insert([{ name, description }])
    .select()
    .single();

  if (error) throw new Error(error.message);

  res.status(201).json(data);
});

/**
 * @desc Get all categories
 * @route GET /api/categories
 * @access Public
 */
export const getCategories = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  res.json(data);
});

/**
 * @desc Get single category
 * @route GET /api/categories/:id
 * @access Public
 */
export const getCategoryById = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      res.status(404);
      throw new Error("Category not found");
    }
    throw new Error(error.message);
  }

  res.json(data);
});

/**
 * @desc Update category
 * @route PUT /api/categories/:id
 * @access Admin
 */
export const updateCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  const { data, error } = await supabase
    .from("categories")
    .update({ name, description, updated_at: new Date() })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      res.status(404);
      throw new Error("Category not found");
    }
    throw new Error(error.message);
  }

  res.json(data);
});

/**
 * @desc Delete category
 * @route DELETE /api/categories/:id
 * @access Admin
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from("categories")
    .delete()
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      res.status(404);
      throw new Error("Category not found");
    }
    throw new Error(error.message);
  }

  res.json({ message: "Category deleted successfully" });
});
