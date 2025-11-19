// reviewController.js
import asyncHandler from "express-async-handler";
import multer from "multer";
import streamifier from "streamifier";
import { v2 as cloudinary } from "cloudinary";
import { createClient } from "@supabase/supabase-js";
import path from "path";

// ---------- CONFIG (env) ----------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_SECRET;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "bakery/reviews"; // optional folder

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Missing SUPABASE env vars");
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  throw new Error("Missing Cloudinary env vars");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

// ---------- MULTER SETUP (in-memory) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024, // max 3MB per file (adjust as needed)
    files: 5, // max 5 images per review
  },
  fileFilter: (req, file, cb) => {
    // accept images only
    const allowed = /jpeg|jpg|png|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext) || allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only images (jpeg, png, webp) are allowed"));
  },
});

// ---------- Helper: upload buffer to Cloudinary using upload_stream ----------
function uploadBufferToCloudinary(buffer, publicIdBase) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_FOLDER,
        public_id: publicIdBase, // Cloudinary will append unique suffix if exists
        overwrite: false,
        resource_type: "image",
        // transformation, quality settings, moderation, etc. can be added here
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

// ---------- Controller: create review with optional images ----------
/**
 * POST /api/products/:productId/reviews
 * multipart/form-data fields:
 *  - rating (number, required)
 *  - title (string, optional)
 *  - body (string, optional)
 *  - display_name (string, optional)
 *  - is_verified_purchase (boolean; optional)
 *  - status (optional; default 'approved' or 'pending' depending on workflow)
 *  - files[] (images)
 *
 * NOTE: This route uses `upload.array('files', 5)` middleware.
 */
export const createReview = [
  // multer middleware: attach up to 5 files to req.files
  upload.array("files", 5),
  asyncHandler(async (req, res) => {
    const { productId } = req.params;
    if (!productId) return res.status(400).json({ message: "Missing productId parameter" });

    // parse fields (multer does not parse boolean/number types for you)
    const rating = Number(req.body.rating);
    const title = req.body.title?.trim() || null;
    const body = req.body.body?.trim() || null;
    const display_name = req.body.display_name?.trim() || null;
    const is_verified_purchase = req.body.is_verified_purchase === "true" || req.body.is_verified_purchase === true;
    // status: recommended to default to 'pending' or 'approved' depending on your moderation workflow
    const status = req.body.status || "approved";

    if (!rating && rating !== 0) return res.status(400).json({ message: "rating is required" });
    if (rating < 0 || rating > 5) return res.status(400).json({ message: "rating must be between 0 and 5" });

    // Optional: if you use authentication populate req.user from auth middleware
    const userId = req.user?.id || null;

    // 1) Insert review row to DB
    const { data: insertedReview, error: insertErr } = await supabase
      .from("reviews")
      .insert([{
        product_id: productId,
        user_id: userId,
        display_name: display_name ?? (userId ? "Verified Buyer" : "Anonymous"),
        rating,
        title,
        body,
        is_verified_purchase: !!is_verified_purchase,
        status,
      }])
      .select()
      .single();

    if (insertErr) {
      console.error("Failed to insert review:", insertErr);
      return res.status(500).json({ message: "Failed to create review", details: insertErr.message });
    }

    const reviewId = insertedReview.id;

    // 2) Upload images to Cloudinary (if any) and insert review_images rows
    const files = req.files || [];
    if (files.length) {
      // Upload in sequence or parallel (limit concurrency for many files)
      const uploadedImages = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          // build a public id base like reviews/<productId>_<reviewId>_<index>
          const publicIdBase = `${productId}_${reviewId}_${Date.now()}_${i}`;
          const result = await uploadBufferToCloudinary(f.buffer, publicIdBase);

          // result contains fields: secure_url, public_id, format, width, height, bytes
          const storage_path = result.secure_url; // or result.public_id if you want to store path instead of url

          // insert into review_images
          const { error: imgErr } = await supabase.from("review_images").insert([{
            review_id: reviewId,
            storage_path,
            alt: f.originalname,
            position: i,
          }]);

          if (imgErr) {
            console.warn("Failed to insert review_images row:", imgErr);
            // choose to continue — we already uploaded image to Cloudinary; you could delete it if desired
          } else {
            uploadedImages.push({ storage_path, public_id: result.public_id });
          }
        } catch (upErr) {
          console.error("Cloudinary upload error:", upErr);
          // continue uploading others, but record error
        }
      }
    }

    // 3) Recompute aggregate (optional): average rating and count (useful for product listing)
    // Note: you can compute this later server-side or with a DB view. Example fetch for convenience:
    try {
      const { data: aggData, error: aggErr } = await supabase
        .from("reviews")
        .select("rating", { count: "exact" })
        .eq("product_id", productId)
        .eq("status", "approved");
      // We could compute average from data client-side; optional
    } catch (e) {
      // ignore agg errors
    }

    // 4) Return created review (with images)
    const { data: full, error: fullErr } = await supabase
      .from("reviews")
      .select("*, review_images(*)")
      .eq("id", reviewId)
      .maybeSingle();

    if (fullErr) {
      return res.status(201).json({ created: insertedReview, note: "created but failed to fetch relations", details: fullErr.message });
    }

    return res.status(201).json(full);
  })

  
];


export const listReviews = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const limit = Math.min(100, Number(req.query.limit) || 10);
  const offset = Number(req.query.offset) || 0;
  const sort = req.query.sort || "recent"; // recent | helpful | rating_desc

  let orderCol = "created_at", ascending = false;
  if (sort === "helpful") { orderCol = "helpful_count"; ascending = false; }
  if (sort === "rating_desc") { orderCol = "rating"; ascending = false; }

  const { data, error, count } = await supabase
    .from("reviews")
    .select("*, review_images(*), review_replies(*)", { count: "exact" })
    .eq("product_id", productId)
    .eq("status", "approved")
    .order(orderCol, { ascending })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("listReviews error:", error);
    return res.status(500).json({ message: "Failed to load reviews", details: error.message });
  }

  return res.json({ data: data || [], total: typeof count === "number" ? count : (data?.length ?? 0) });
});


export const reviewsSummary = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  // fetch all approved ratings for this product (or an aggregate SQL/RPC)
  const { data, error } = await supabase
    .from("reviews")
    .select("rating")
    .eq("product_id", productId)
    .eq("status", "approved");

  if (error) {
    console.error("reviewsSummary error:", error);
    return res.status(500).json({ message: "Failed to aggregate", details: error.message });
  }

  const counts = { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 };
  let total = 0, sum = 0;
  (data || []).forEach(r => {
    const rnum = Math.round(Number(r.rating) || 0);
    const key = String(Math.min(5, Math.max(1, rnum || 1)));
    counts[key] = (counts[key] || 0) + 1;
    total += 1;
    sum += Number(r.rating) || 0;
  });
  const average = total ? +(sum / total).toFixed(2) : 0;
  return res.json({ average, total, counts });
});
