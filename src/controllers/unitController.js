import asyncHandler from "express-async-handler";
import { supabase } from "../config/supabase.js";

/**
 * @desc Create a new unit (e.g. kg, gram, pcs)
 * @route POST /api/units
 * @access Admin
 */
export const createUnit = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    res.status(400);
    throw new Error("Unit name is required");
  }

  // Check if unit exists
  const { data: existing } = await supabase
    .from("units")
    .select("*")
    .eq("name", name)
    .single();

  if (existing) {
    res.status(400);
    throw new Error("Unit already exists");
  }

  const { data, error } = await supabase
    .from("units")
    .insert([{ name, description }])
    .select()
    .single();

  if (error) throw new Error(error.message);

  res.status(201).json(data);
});

/**
 * @desc Get all units
 * @route GET /api/units
 * @access Public
 */
export const getUnits = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from("units").select("*").order("name");

  if (error) throw new Error(error.message);

  res.json(data);
});

/**
 * @desc Get single unit by ID
 * @route GET /api/units/:id
 * @access Public
 */
export const getUnitById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase.from("units").select("*").eq("id", id).single();

  if (error) throw new Error(error.message);

  if (!data) {
    res.status(404);
    throw new Error("Unit not found");
  }

  res.json(data);
});

/**
 * @desc Update a unit
 * @route PUT /api/units/:id
 * @access Admin
 */
export const updateUnit = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  const { data, error } = await supabase
    .from("units")
    .update({ name, description })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  res.json(data);
});

/**
 * @desc Delete a unit
 * @route DELETE /api/units/:id
 * @access Admin
 */
export const deleteUnit = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase.from("units").delete().eq("id", id);

  if (error) throw new Error(error.message);

  res.json({ message: "Unit deleted successfully" });
});
