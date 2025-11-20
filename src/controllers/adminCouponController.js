// src/controllers/adminCouponController.js
import { supabase } from "../config/supabase.js";

/**
 * Helpers
 */
function toNullableNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function normalizeCouponRow(row) {
  if (!row) return null;
  return {
    ...row,
    value: Number(row.value || 0),
    min_cart_amount: Number(row.min_cart_amount || 0),
    max_uses: row.max_uses != null ? Number(row.max_uses) : null,
    used_count: Number(row.used_count || 0),
    per_user_limit: row.per_user_limit != null ? Number(row.per_user_limit) : null,
    auto_threshold: Number(row.auto_threshold || 0),
    free_gift_qty: row.free_gift_qty != null ? Number(row.free_gift_qty) : null,
    is_active: !!row.is_active,
    is_auto: !!row.is_auto,
  };
}

function getUserFromRequest(req) {
  return req.user || null;
}

/**
 * GET /api/admin/coupons
 */
export const listCoupons = async (req, res) => {
  try {
    // Optional: admin check
    // const user = getUserFromRequest(req);
    // if (!user || user.role !== "admin") {
    //   return res.status(403).json({ error: "Admin only" });
    // }

    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listCoupons error:", error);
      return res.status(500).json({ error: "Failed to load coupons" });
    }

    return res.json((data || []).map(normalizeCouponRow));
  } catch (e) {
    console.error("listCoupons fatal:", e);
    return res.status(500).json({ error: "Unexpected error" });
  }
};

/**
 * POST /api/admin/coupons
 * Create coupon (supports %/fixed + free gift + auto rule flags)
 */
export const createCoupon = async (req, res) => {
  try {
    // const user = getUserFromRequest(req);
    // if (!user || user.role !== "admin") {
    //   return res.status(403).json({ error: "Admin only" });
    // }

    const {
      code,
      name,
      description,
      type = "percent",      // "percent" | "fixed"
      value,
      min_cart_amount,
      is_active = true,

      max_uses,
      per_user_limit,
      valid_from,
      valid_to,

      is_auto = false,
      auto_threshold,
      free_gift_product_id,
      free_gift_qty,
    } = req.body || {};

    if (!code || !type) {
      return res.status(400).json({ error: "code and type are required" });
    }

    // Ensure coupon code unique (case-insensitive)
    const { data: existing, error: existErr } = await supabase
      .from("coupons")
      .select("id, code")
      .ilike("code", code.trim())
      .maybeSingle();

    if (existErr) {
      console.error("createCoupon existErr:", existErr);
    }
    if (existing) {
      return res.status(400).json({ error: "Coupon code already exists" });
    }

    const insertPayload = {
      code: code.trim().toUpperCase(),
      name: name || null,
      description: description || null,
      type,
      value: Number(value) || 0,
      min_cart_amount: Number(min_cart_amount || 0),
      is_active: !!is_active,

      max_uses: toNullableNumber(max_uses),
      per_user_limit: toNullableNumber(per_user_limit),
      valid_from: valid_from || null,
      valid_to: valid_to || null,

      is_auto: !!is_auto,
      auto_threshold: Number(auto_threshold || 0),
      free_gift_product_id: free_gift_product_id || null,
      free_gift_qty: free_gift_product_id
        ? Number(free_gift_qty || 1)
        : null,
      // used_count will default to 0 from DB
    };

    const { data: created, error } = await supabase
      .from("coupons")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      console.error("createCoupon insert error:", error);
      return res.status(500).json({ error: "Failed to create coupon" });
    }

    return res.status(201).json(normalizeCouponRow(created));
  } catch (e) {
    console.error("createCoupon fatal:", e);
    return res.status(500).json({ error: "Unexpected error" });
  }
};

/**
 * PUT /api/admin/coupons/:id
 * Update coupon
 */
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Coupon id is required" });

    const {
      code,
      name,
      description,
      type,
      value,
      min_cart_amount,
      is_active,

      max_uses,
      per_user_limit,
      valid_from,
      valid_to,

      is_auto,
      auto_threshold,
      free_gift_product_id,
      free_gift_qty,
    } = req.body || {};

    // Load existing coupon
    const { data: existing, error: loadErr } = await supabase
      .from("coupons")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (loadErr) {
      console.error("updateCoupon loadErr:", loadErr);
      return res.status(500).json({ error: "Failed to load coupon" });
    }
    if (!existing) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    // If code changed, enforce uniqueness
    if (code && code.trim().toUpperCase() !== existing.code) {
      const { data: conflict, error: conflictErr } = await supabase
        .from("coupons")
        .select("id, code")
        .ilike("code", code.trim())
        .maybeSingle();

      if (conflictErr) {
        console.error("updateCoupon conflictErr:", conflictErr);
      }
      if (conflict && conflict.id !== id) {
        return res
          .status(400)
          .json({ error: "Another coupon already uses this code" });
      }
    }

    const updatePayload = {
      code: code ? code.trim().toUpperCase() : existing.code,
      name: typeof name !== "undefined" ? name : existing.name,
      description:
        typeof description !== "undefined" ? description : existing.description,
      type: type || existing.type,
      value:
        typeof value !== "undefined"
          ? Number(value) || 0
          : Number(existing.value || 0),
      min_cart_amount:
        typeof min_cart_amount !== "undefined"
          ? Number(min_cart_amount || 0)
          : Number(existing.min_cart_amount || 0),
      is_active:
        typeof is_active !== "undefined" ? !!is_active : existing.is_active,

      max_uses:
        typeof max_uses !== "undefined"
          ? toNullableNumber(max_uses)
          : existing.max_uses,
      per_user_limit:
        typeof per_user_limit !== "undefined"
          ? toNullableNumber(per_user_limit)
          : existing.per_user_limit,
      valid_from:
        typeof valid_from !== "undefined" ? valid_from || null : existing.valid_from,
      valid_to:
        typeof valid_to !== "undefined" ? valid_to || null : existing.valid_to,

      is_auto:
        typeof is_auto !== "undefined" ? !!is_auto : existing.is_auto,
      auto_threshold:
        typeof auto_threshold !== "undefined"
          ? Number(auto_threshold || 0)
          : Number(existing.auto_threshold || 0),
      free_gift_product_id:
        typeof free_gift_product_id !== "undefined"
          ? free_gift_product_id || null
          : existing.free_gift_product_id,
      free_gift_qty:
        typeof free_gift_qty !== "undefined"
          ? (free_gift_product_id || existing.free_gift_product_id)
            ? Number(free_gift_qty || 1)
            : null
          : existing.free_gift_qty,
    };

    const { data: updated, error } = await supabase
      .from("coupons")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("updateCoupon update error:", error);
      return res.status(500).json({ error: "Failed to update coupon" });
    }

    return res.json(normalizeCouponRow(updated));
  } catch (e) {
    console.error("updateCoupon fatal:", e);
    return res.status(500).json({ error: "Unexpected error" });
  }
};

/**
 * DELETE /api/admin/coupons/:id
 */
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Coupon id is required" });

    const { error } = await supabase.from("coupons").delete().eq("id", id);

    if (error) {
      console.error("deleteCoupon error:", error);
      return res.status(500).json({ error: "Failed to delete coupon" });
    }

    return res.status(204).send();
  } catch (e) {
    console.error("deleteCoupon fatal:", e);
    return res.status(500).json({ error: "Unexpected error" });
  }
};
