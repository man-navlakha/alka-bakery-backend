import { supabase } from "../config/supabase.js";

// Helper to get User ID from the middleware
const getUserId = (req) => req.user?.id || req.user;

/**
 * GET /api/addresses
 * Fetch all addresses for the logged-in user
 */
export const getAddresses = async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const { data, error } = await supabase
      .from("addresses")
      .select("*")
      .eq("user_id", userId)
      .order("is_default", { ascending: false }) // Default address first
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Get Addresses Error:", error);
    res.status(500).json({ message: "Failed to fetch addresses" });
  }
};

/**
 * POST /api/addresses
 * Add a new address
 */
export const addAddress = async (req, res) => {
  try {
    const userId = getUserId(req);
    const {
      recipient_name,
      recipient_phone,
      house_no,
      floor_no,
      society_building,
      street_address,
      landmark,
      pincode,
      city,
      state,
      type,
      is_default
    } = req.body;

    // 1. If this is set to default, unset previous default
    if (is_default) {
      await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", userId);
    }

    // 2. If this is the FIRST address, force it to be default
    const { count } = await supabase
      .from("addresses")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    
    const shouldBeDefault = is_default || count === 0;

    // 3. Insert
    const { data, error } = await supabase
      .from("addresses")
      .insert([{
        user_id: userId,
        recipient_name,
        recipient_phone,
        house_no,
        floor_no,
        society_building,
        street_address,
        landmark,
        pincode,
        city,
        state,
        type: type || 'Home',
        is_default: shouldBeDefault
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error("Add Address Error:", error);
    res.status(500).json({ message: "Failed to add address", error: error.message });
  }
};

/**
 * PUT /api/addresses/:id
 * Update an address
 */
export const updateAddress = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const updates = req.body;

    // Prevent updating user_id
    delete updates.user_id;
    delete updates.id;

    // Handle Default Logic
    if (updates.is_default === true) {
      await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", userId);
    }

    const { data, error } = await supabase
      .from("addresses")
      .update({ ...updates, updated_at: new Date() })
      .eq("id", id)
      .eq("user_id", userId) // Security: ensure belongs to user
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Update Address Error:", error);
    res.status(500).json({ message: "Failed to update address" });
  }
};

/**
 * DELETE /api/addresses/:id
 */
export const deleteAddress = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const { error } = await supabase
      .from("addresses")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;
    res.json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error("Delete Address Error:", error);
    res.status(500).json({ message: "Failed to delete address" });
  }
};