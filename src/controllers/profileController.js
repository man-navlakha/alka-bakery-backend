// src/controllers/profileController.js
import { supabase } from "../config/supabase.js";

export const getUserProfile = async (req, res) => {
  try {
    // FIX: specific check for object vs string
    const userId = req.user?.id || req.user; 

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, created_at, role")
      .eq("id", userId)
      .single();

    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ message: "User not found" });
        throw error;
    }

    res.json({ user });
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user; // FIX
    const { name } = req.body;

    if (!name) return res.status(400).json({ message: "Name is required" });

    const { data: updatedUser, error } = await supabase
      .from("users")
      .update({ name: name.trim() })
      .eq("id", userId)
      .select("id, name, email, created_at, role")
      .single();

    if (error) throw error;

    res.json({ message: "Profile updated", user: updatedUser });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ message: "Update failed" });
  }
};