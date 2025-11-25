import { supabaseAdmin } from "../config/supabase.js";

export const trackOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Prepare the query selection
    let query = supabaseAdmin
      .from("orders")
      .select(`
        id, 
        status, 
        created_at, 
        delivery_fee,
        grand_total,
        payment_method,
        payment_status,
        address_snapshot,
        order_items (
          product_name,
          quantity,
          variant_label,
          unit
        )
      `);

    // --- SEARCH LOGIC ---
    // Regex to check if it's a full 36-char UUID
    const isFullUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);

    if (isFullUUID) {
      // Exact match for full ID
      query = query.eq("id", orderId);
    } else {
      // RANGE SEARCH for Short ID
      // 1. Strip non-hex characters to be safe
      const cleanId = orderId.replace(/[^0-9a-f]/gi, "").toLowerCase();

      if (cleanId.length < 4) {
         return res.status(400).json({ message: "Please enter at least 4 characters" });
      }

      // 2. Create Min and Max UUIDs by padding with 0s and Fs
      const minHex = cleanId.padEnd(32, "0");
      const maxHex = cleanId.padEnd(32, "f");

      // 3. Helper to format 32-char hex string into UUID structure (8-4-4-4-12)
      const toUUID = (hex) => 
        `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

      const minUUID = toUUID(minHex);
      const maxUUID = toUUID(maxHex);

      // 4. Search for any ID effectively "between" these two values
      query = query.gte("id", minUUID).lte("id", maxUUID);
    }

    // Execute query (limit to 1 result)
    const { data, error } = await query.limit(1).maybeSingle();

    if (error) {
      console.error("Tracking DB Error:", error);
      return res.status(500).json({ message: "Database error", details: error.message });
    }

    if (!data) {
      return res.status(404).json({ message: "Order not found. Please check the ID." });
    }

    // Calculate estimated delivery (Mock: +1 hour from creation)
    const createdAt = new Date(data.created_at);
    const estimatedDelivery = new Date(createdAt.getTime() + 60 * 60 * 1000);

    res.json({
      ...data,
      estimated_delivery: estimatedDelivery.toISOString()
    });

  } catch (error) {
    console.error("Tracking Server Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};