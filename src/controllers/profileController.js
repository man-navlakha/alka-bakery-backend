// src/controllers/profileController.js
import { supabase } from "../config/supabase.js";

/**
 * @desc    Get current user's profile
 * @route   GET /api/profile
 * @access  Private
 */
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user; // Set by 'protect' middleware

    // Fetch user data - select only the fields you want to expose
    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, created_at, role") // Adjust fields as needed
      .eq("id", userId)
      .single();

    if (error) {
        console.error("Get Profile Error:", error);
        // Differentiate between not found (shouldn't happen if protect middleware works) and other errors
        if (error.code === 'PGRST116') { // PostgREST code for "Searched for one row, but found 0"
             return res.status(404).json({ message: "User profile not found." });
        }
        return res.status(500).json({ message: "Failed to fetch profile." });
    }

    if (!user) {
         // This case might be redundant if protect middleware guarantees user exists
         return res.status(404).json({ message: "User profile not found." });
    }

    res.json({ user }); // Send the user object

  } catch (error) {
    // Catch unexpected errors
    console.error("Unexpected Get Profile Error:", error);
    res.status(500).json({ message: "Server error while fetching profile." });
  }
};

/**
 * @desc    Update current user's profile
 * @route   PUT /api/profile
 * @access  Private
 */
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user;
    const { name /*, add other updatable fields here, e.g., address, phone */ } = req.body;

    // Basic validation: ensure at least 'name' is provided for update
    if (!name) {
        return res.status(400).json({ message: "Name is required for update." });
    }

    // Prepare the update object - only include fields you allow users to change
    const updateData = {
        name: name.trim(),
        // Add other fields here if you allow them to be updated
        // e.g., address: req.body.address, phone: req.body.phone
    };

    // Perform the update
    const { data: updatedUser, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", userId)
      .select("id, name, email, created_at, role") // Return updated user data (excluding sensitive fields)
      .single();

    if (error) {
      console.error("Update Profile Error:", error);
      return res.status(500).json({ message: "Failed to update profile." });
    }

     if (!updatedUser) {
         return res.status(404).json({ message: "User profile not found for update." });
     }

    res.json({ message: "Profile updated successfully", user: updatedUser });

  } catch (error) {
    console.error("Unexpected Update Profile Error:", error);
    res.status(500).json({ message: "Server error while updating profile." });
  }
};

// Add other profile-related functions if needed (e.g., change password - requires careful handling!)