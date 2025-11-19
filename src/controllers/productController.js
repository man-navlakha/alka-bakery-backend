// productController.js
import asyncHandler from "express-async-handler";
import { createClient } from "@supabase/supabase-js";

// Use a service role or admin key on the server for writes
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_KEY in environment");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * GET /api/products
 * returns products with product_unit_options and product_images
 */
export const getProducts = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      category,
      unit,
      price_per_100g,
      price_per_pc,
      description,
      created_at,
      product_unit_options ( id, label, grams, price, position ),
      product_images ( id, url, alt, position )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ message: "Failed to fetch products", details: error.message });
  }

  return res.json(data);
});

/**
 * GET /api/products/:id
 * returns a single product (with options & images)
 */
export const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: "Product id is required" });

  const { data, error } = await supabase
    .from("products")
    .select(
      `
      *,
      product_unit_options ( id, label, grams, price, position ),
      product_images ( id, url, alt, position )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return res.status(500).json({ message: "Failed to fetch product", details: error.message });
  if (!data) return res.status(404).json({ message: "Product not found" });

  return res.json(data);
});

/**
 * POST /api/products
 * body: {
 *   id, name, category, unit,
 *   price_per_100g?, price_per_pc?, description?,
 *   unitOptions?: [{ label, grams, price, position? }],
 *   images?: [{ url, alt, position? }]
 * }
 */
export const createProduct = asyncHandler(async (req, res) => {
  const payload = req.body || {};

  // Basic validation
  const required = ["id", "name", "category", "unit"];
  for (const k of required) {
    if (!payload[k]) return res.status(400).json({ message: `Missing field: ${k}` });
  }

  // Insert product
  const { data: prodData, error: prodErr } = await supabase.from("products").insert([{
    id: payload.id,
    name: payload.name,
    category: payload.category,
    unit: payload.unit,
    price_per_100g: payload.price_per_100g ?? null,
    price_per_pc: payload.price_per_pc ?? null,
    description: payload.description ?? null,
  }]);

  if (prodErr) {
    return res.status(500).json({ message: "Failed to create product", details: prodErr.message });
  }

  const createdProduct = Array.isArray(prodData) ? prodData[0] : prodData;

  try {
    // insert unit options if provided
    if (Array.isArray(payload.unitOptions) && payload.unitOptions.length) {
      const options = payload.unitOptions.map((o) => ({
        product_id: createdProduct.id,
        label: o.label,
        grams: o.grams ?? null,
        price: o.price,
        position: o.position ?? 0,
      }));

      const { error: optsErr } = await supabase.from("product_unit_options").insert(options);
      if (optsErr) throw optsErr;
    }

    // insert images if provided
    if (Array.isArray(payload.images) && payload.images.length) {
      const imgs = payload.images.map((i) => ({
        product_id: createdProduct.id,
        url: i.url,
        alt: i.alt ?? null,
        position: i.position ?? 0,
      }));

      const { error: imgsErr } = await supabase.from("product_images").insert(imgs);
      if (imgsErr) throw imgsErr;
    }
  } catch (err) {
    // attempt cleanup if follow-up inserts failed
    await supabase.from("product_images").delete().eq("product_id", createdProduct.id);
    await supabase.from("product_unit_options").delete().eq("product_id", createdProduct.id);
    await supabase.from("products").delete().eq("id", createdProduct.id);
    return res.status(500).json({ message: "Failed to create product related records", details: err.message });
  }

  // return the created product with relations
  const { data: full, error: fullErr } = await supabase
    .from("products")
    .select(
      `
      *,
      product_unit_options ( id, label, grams, price, position ),
      product_images ( id, url, alt, position )
    `
    )
    .eq("id", createdProduct.id)
    .maybeSingle();

  if (fullErr) return res.status(201).json({ created: createdProduct, note: "created but failed to fetch relations", details: fullErr.message });

  return res.status(201).json(full);
});

/**
 * PUT /api/products/:id
 * (full replace) - Accepts same payload as createProduct but fields optional.
 * For simplicity this implementation:
 *  - updates the products row
 *  - replaces unit options if provided (delete existing -> insert new)
 *  - replaces images if provided
 */
export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  if (!id) return res.status(400).json({ message: "Product id is required" });

  // Update base product fields (only provided ones)
  const updateFields = {};
  ["name", "category", "unit", "price_per_100g", "price_per_pc", "description"].forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(payload, k)) updateFields[k] = payload[k];
  });

  if (Object.keys(updateFields).length) {
    const { error: updErr } = await supabase.from("products").update(updateFields).eq("id", id);
    if (updErr) return res.status(500).json({ message: "Failed to update product", details: updErr.message });
  }

  try {
    // Replace unit options if provided (delete old -> insert new)
    if (Array.isArray(payload.unitOptions)) {
      await supabase.from("product_unit_options").delete().eq("product_id", id);

      if (payload.unitOptions.length) {
        const options = payload.unitOptions.map((o) => ({
          product_id: id,
          label: o.label,
          grams: o.grams ?? null,
          price: o.price,
          position: o.position ?? 0,
        }));
        const { error: optsErr } = await supabase.from("product_unit_options").insert(options);
        if (optsErr) throw optsErr;
      }
    }

    // Replace images if provided
    if (Array.isArray(payload.images)) {
      await supabase.from("product_images").delete().eq("product_id", id);

      if (payload.images.length) {
        const imgs = payload.images.map((i) => ({
          product_id: id,
          url: i.url,
          alt: i.alt ?? null,
          position: i.position ?? 0,
        }));
        const { error: imgsErr } = await supabase.from("product_images").insert(imgs);
        if (imgsErr) throw imgsErr;
      }
    }
  } catch (err) {
    return res.status(500).json({ message: "Failed to update product related records", details: err.message });
  }

  // return updated product
  const { data, error } = await supabase
    .from("products")
    .select(
      `
      *,
      product_unit_options ( id, label, grams, price, position ),
      product_images ( id, url, alt, position )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return res.status(500).json({ message: "Updated but failed to fetch product", details: error.message });

  return res.json(data);
});

/**
 * DELETE /api/products/:id
 */
export const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: "Product id is required" });

  // deleting product will cascade to options & images (if FK ON DELETE CASCADE set)
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return res.status(500).json({ message: "Failed to delete product", details: error.message });

  return res.json({ message: "Product deleted" });
});
