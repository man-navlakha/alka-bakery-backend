import { supabase } from "../config/supabase.js";

export const adminCheck = async (req, res, next) => {
  try {
    const userId = req.user;

    const { data: user, error } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", userId)
      .single();

    if (error || !user) return res.status(403).json({ message: "Access denied" });

    if (!user.is_admin) return res.status(403).json({ message: "Admin only" });

    next();
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
