// productController.js
import asyncHandler from "express-async-handler";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";

// Use a service role or admin key on the server for writes
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_KEY in environment");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

// 2. Configure Multer (Store files in memory temporarily)
const storage = multer.memoryStorage();
export const uploadMiddleware = multer({ storage: storage }).array("images", 5); // Allows up to 5 images

// 3. Helper function to upload buffer to Cloudinary
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "products" }, // Optional: organize in a folder on Cloudinary
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};
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
  // 1. Parse body (because multipart form-data makes everything strings)
  const payload = { ...req.body };
  
  // If unitOptions is sent as a stringified JSON, parse it
  if (typeof payload.unitOptions === 'string') {
    try {
      payload.unitOptions = JSON.parse(payload.unitOptions);
    } catch (e) {
      return res.status(400).json({ message: "Invalid format for unitOptions" });
    }
  }

  // Basic validation
  const required = ["id", "name", "category", "unit"];
  for (const k of required) {
    if (!payload[k]) return res.status(400).json({ message: `Missing field: ${k}` });
  }

  // 2. Handle Image Uploads (if files exist)
  let uploadedImages = [];
  
  // If files were uploaded via Multer
  if (req.files && req.files.length > 0) {
    try {
      const uploadPromises = req.files.map((file) => uploadToCloudinary(file.buffer));
      const results = await Promise.all(uploadPromises);
      
      // Map Cloudinary results to your DB structure
      uploadedImages = results.map((res, index) => ({
        url: res.secure_url,
        alt: payload.name + " - " + (index + 1), // Default alt text
        position: index
      }));
    } catch (uploadErr) {
      return res.status(500).json({ message: "Image upload failed", details: uploadErr.message });
    }
  } 
  // Fallback: If user sent image URLs directly (not files)
  else if (payload.images) {
      let imagesRaw = payload.images;
      if (typeof imagesRaw === 'string') imagesRaw = JSON.parse(imagesRaw);
      uploadedImages = imagesRaw;
  }

  // 3. Insert Product into Supabase
  const { data: prodData, error: prodErr } = await supabase.from("products").insert([{
    id: payload.id,
    name: payload.name,
    category: payload.category,
    unit: payload.unit,
    price_per_100g: payload.price_per_100g ?? null,
    price_per_pc: payload.price_per_pc ?? null,
    description: payload.description ?? null,
  }]).select(); // Add .select() to ensure we get data back

  if (prodErr) {
    return res.status(500).json({ message: "Failed to create product", details: prodErr.message });
  }

  const createdProduct = Array.isArray(prodData) ? prodData[0] : prodData;

  try {
    // Insert unit options
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

    // Insert images (Using the uploadedImages array we created earlier)
    if (uploadedImages.length) {
      const imgs = uploadedImages.map((i) => ({
        product_id: createdProduct.id,
        url: i.url,
        alt: i.alt ?? null,
        position: i.position ?? 0,
      }));
      const { error: imgsErr } = await supabase.from("product_images").insert(imgs);
      if (imgsErr) throw imgsErr;
    }

  } catch (err) {
    // Cleanup on error
    await supabase.from("product_images").delete().eq("product_id", createdProduct.id);
    await supabase.from("product_unit_options").delete().eq("product_id", createdProduct.id);
    await supabase.from("products").delete().eq("id", createdProduct.id);
    return res.status(500).json({ message: "Failed to create product relations", details: err.message });
  }

  // Return full product
  const { data: full } = await supabase
    .from("products")
    .select(`*, product_unit_options(*), product_images(*)`)
    .eq("id", createdProduct.id)
    .maybeSingle();

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
  const payload = { ...req.body };
  if (!id) return res.status(400).json({ message: "Product id is required" });

  // Parse JSON strings if present
  if (typeof payload.unitOptions === 'string') payload.unitOptions = JSON.parse(payload.unitOptions);
  
  // Update base product fields
  const updateFields = {};
  ["name", "category", "unit", "price_per_100g", "price_per_pc", "description"].forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(payload, k)) updateFields[k] = payload[k];
  });

  if (Object.keys(updateFields).length) {
    const { error: updErr } = await supabase.from("products").update(updateFields).eq("id", id);
    if (updErr) return res.status(500).json({ message: "Failed to update product", details: updErr.message });
  }

  try {
    // Replace Unit Options
    if (payload.unitOptions) {
      await supabase.from("product_unit_options").delete().eq("product_id", id);
      if (payload.unitOptions.length) {
        const options = payload.unitOptions.map((o) => ({
          product_id: id,
          label: o.label,
          grams: o.grams ?? null,
          price: o.price,
          position: o.position ?? 0,
        }));
        await supabase.from("product_unit_options").insert(options);
      }
    }

    // Replace Images
    // Check if NEW files are being uploaded
    if (req.files && req.files.length > 0) {
      // 1. Upload new files to Cloudinary
      const uploadPromises = req.files.map((file) => uploadToCloudinary(file.buffer));
      const results = await Promise.all(uploadPromises);
      
      const newImages = results.map((res, index) => ({
        product_id: id,
        url: res.secure_url,
        alt: payload.name || "Product Image",
        position: index
      }));

      // 2. Delete old images from Supabase
      await supabase.from("product_images").delete().eq("product_id", id);

      // 3. Insert new images
      await supabase.from("product_images").insert(newImages);
    } 
    // If no files, but 'images' array sent in body (e.g., reordering existing URLs)
    else if (payload.images) {
       let imagesRaw = payload.images;
       if (typeof imagesRaw === 'string') imagesRaw = JSON.parse(imagesRaw);
       
       await supabase.from("product_images").delete().eq("product_id", id);
       
       const imgs = imagesRaw.map(i => ({
         product_id: id,
         url: i.url,
         alt: i.alt,
         position: i.position
       }));
       await supabase.from("product_images").insert(imgs);
    }

  } catch (err) {
    return res.status(500).json({ message: "Failed to update relations", details: err.message });
  }

  const { data } = await supabase
    .from("products")
    .select(`*, product_unit_options(*), product_images(*)`)
    .eq("id", id)
    .maybeSingle();

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
