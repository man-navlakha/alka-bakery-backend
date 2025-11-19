// controllers/adminReviewsController.js
import { createClient } from "@supabase/supabase-js";
import { stringify } from "csv-stringify/sync";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { "x-my-app": "admin-reviews" } },
});

function parseBoolean(v) {
  if (v == null) return undefined;
  if (typeof v === "boolean") return v;
  v = String(v).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y";
}

export async function listReviews(req, res) {
  try {
    const {
      status, product, min_rating, max_rating,
      has_images, verified, search, sort = "created_at.desc",
      limit = 20, offset = 0
    } = req.query;

    const [sortCol, sortDir] = (sort || "created_at.desc").split(".");
    const rangeFrom = Number(offset);
    const rangeTo = Number(offset) + Number(limit) - 1;

    let q = supabase
      .from("reviews")
      .select(`*, review_images(*), review_replies(*)`, { count: "exact" })
      .order(sortCol || "created_at", { ascending: (sortDir || "desc").toLowerCase() === "asc" })
      .range(rangeFrom, rangeTo);

    if (status && status !== "all") q = q.eq("status", status);
    if (product) q = q.eq("product_id", product);
    if (verified != null) {
      const v = parseBoolean(verified);
      if (v !== undefined) q = q.eq("is_verified_purchase", v);
    }
    if (min_rating) q = q.gte("rating", Number(min_rating));
    if (max_rating) q = q.lte("rating", Number(max_rating));

    const { data, error, count } = await q;
    if (error) throw error;

    let rows = data || [];

    if (search) {
      const s = String(search).toLowerCase();
      rows = rows.filter((r) =>
        (r.body || "").toLowerCase().includes(s) ||
        (r.title || "").toLowerCase().includes(s) ||
        (r.display_name || "").toLowerCase().includes(s)
      );
    }

    if (has_images != null && has_images !== "any") {
      const hi = parseBoolean(has_images);
      rows = rows.filter(r => (Array.isArray(r.review_images) && r.review_images.length > 0) === hi);
    }

    return res.json({ data: rows, total: Number(count ?? rows.length) });
  } catch (err) {
    console.error("listReviews error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

export async function getReview(req, res) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("reviews")
      .select(`*, review_images(*), review_replies(*)`)
      .eq("id", id)
      .single();

    if (error) {
      // Supabase error will include .code in some cases
      if (error.code === "PGRST116") return res.status(404).json({ error: "Not found" });
      throw error;
    }

    return res.json(data);
  } catch (err) {
    console.error("getReview error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

export async function approveReview(req, res) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("reviews")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ ok: true, review: data });
  } catch (err) {
    console.error("approveReview error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

export async function rejectReview(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data, error } = await supabase
      .from("reviews")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (reason) {
      const { error: e2 } = await supabase.from("review_replies").insert([{
        review_id: id,
        admin_id: req.user?.id || null,
        body: `Moderation reason: ${reason}`,
      }]);
      if (e2) console.warn("Could not save moderation reason:", e2);
    }

    return res.json({ ok: true, review: data });
  } catch (err) {
    console.error("rejectReview error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

export async function replyToReview(req, res) {
  try {
    const { id } = req.params;
    const { body } = req.body;
    if (!body || !String(body).trim()) return res.status(400).json({ error: "Reply body required" });

    const { data, error } = await supabase.from("review_replies").insert([{
      review_id: id,
      admin_id: req.user?.id || null,
      body: body,
    }]).select().single();

    if (error) throw error;
    return res.json({ ok: true, reply: data });
  } catch (err) {
    console.error("replyToReview error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

export async function deleteReview(req, res) {
  try {
    const { id } = req.params;

    const { data: imgRows, error: imgErr } = await supabase
      .from("review_images")
      .select("*")
      .eq("review_id", id);

    if (imgErr) console.warn("Could not fetch images before delete:", imgErr);

    if (Array.isArray(imgRows)) {
      for (const img of imgRows) {
        try {
          const path = img.storage_path;
          if (!path) continue;
          if (path.includes("/") && !path.startsWith("http")) {
            const parts = path.split("/");
            const bucket = parts.shift();
            const filePath = parts.join("/");
            await supabase.storage.from(bucket).remove([filePath]);
          } else if (path.startsWith("public/")) {
            await supabase.storage.from("public").remove([path.replace(/^public\//, "")]);
          } else {
            // external URL (Cloudinary/S3) - leave for provider-specific deletion
          }
        } catch (e) {
          console.warn("Failed to delete storage object for review image:", e);
        }
      }
    }

    const { data, error } = await supabase.from("reviews").delete().eq("id", id).select();

    if (error) throw error;
    return res.json({ ok: true, deleted: data });
  } catch (err) {
    console.error("deleteReview error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

export async function bulkAction(req, res) {
  try {
    const { action, ids, reason } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required" });

    if (action === "approve") {
      const { data, error } = await supabase.from("reviews").update({ status: "approved", updated_at: new Date().toISOString() }).in("id", ids).select();
      if (error) throw error;
      return res.json({ ok: true, updated: data });
    } else if (action === "reject") {
      const { data, error } = await supabase.from("reviews").update({ status: "rejected", updated_at: new Date().toISOString() }).in("id", ids).select();
      if (error) throw error;
      if (reason) {
        const rows = ids.map(id => ({ review_id: id, admin_id: req.user?.id || null, body: `Bulk rejection: ${reason}` }));
        await supabase.from("review_replies").insert(rows);
      }
      return res.json({ ok: true, updated: data });
    } else if (action === "delete") {
      const { data, error } = await supabase.from("reviews").delete().in("id", ids).select();
      if (error) throw error;
      return res.json({ ok: true, deleted: data });
    } else {
      return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    console.error("bulkAction error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

export async function exportReviewsCsv(req, res) {
  try {
    const { status, product } = req.query;

    let q = supabase.from("reviews").select(`id, product_id, user_id, display_name, rating, title, body, is_verified_purchase, status, helpful_count, created_at, updated_at, review_images(storage_path)`);
    if (status) q = q.eq("status", status);
    if (product) q = q.eq("product_id", product);

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || []).map(r => ({
      id: r.id,
      product_id: r.product_id,
      user_id: r.user_id,
      display_name: r.display_name,
      rating: r.rating,
      title: r.title,
      body: r.body,
      is_verified_purchase: r.is_verified_purchase,
      status: r.status,
      helpful_count: r.helpful_count,
      created_at: r.created_at,
      updated_at: r.updated_at,
      images: Array.isArray(r.review_images) ? r.review_images.map(i => i.storage_path).join("|") : ""
    }));

    const csv = stringify(rows, { header: true });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=reviews-export.csv");
    return res.send(csv);
  } catch (err) {
    console.error("exportReviewsCsv error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
