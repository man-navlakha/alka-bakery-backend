// src/controllers/authController.js
import { supabase } from "../config/supabase.js";
import { generateAccessToken, generateRefreshToken } from "../utils/generateToken.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// ... (keep registerUser as is) ...

export const registerUser = async (req, res) => {
  // ... (Keep existing register logic)
  try {
    const { name, email, password } = req.body;
    const { data: existingUser } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const { data: newUser, error } = await supabase
      .from("users")
      .insert([{ name, email, password: hashedPassword }])
      .select("id, name, email, role")
      .single();

    if (error) throw error;

    const accessToken = generateAccessToken(newUser.id);
    const refreshToken = generateRefreshToken(newUser.id);

    await supabase.from("users").update({ refresh_token: refreshToken }).eq("id", newUser.id);

    res.json({
      message: "Registration successful",
      user: newUser,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: "Registration error" });
  }
};


export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, password, role")
      .eq("email", email)
      .maybeSingle();

    if (error || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate Tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Store Refresh Token
    await supabase.from("users").update({ refresh_token: refreshToken }).eq("id", user.id);

    // Set HTTP-Only Cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      message: "Login successful",
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken 
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Login failed" });
  }
};

export const logoutUser = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  // Clear ALL auth/cart cookies
  const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" };
  res.clearCookie("refreshToken", cookieOptions);
  res.clearCookie("cart_id", cookieOptions); // Clear backend cart cookie if set

  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      await supabase.from("users").update({ refresh_token: null }).eq("id", payload.id);
    } catch (err) {
      // Token invalid, just ignore
    }
  }

  res.status(200).json({ message: "Logout successful" });
};

export const getProfile = async (req, res) => {
  try {
    // FIX: Extract ID from the req.user object
    const userId = req.user?.id || req.user; 

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, created_at, role")
      .eq("id", userId)
      .single();

    if (error) throw error;
    res.json({ user });
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
};

// ... (keep refreshAccessToken as is) ...
export const refreshAccessToken = async (req, res) => {
    // ... existing logic ...
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: "No token" });
    try {
        const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        const { data: user } = await supabase.from("users").select("id, refresh_token").eq("id", payload.id).single();
        if (!user || user.refresh_token !== refreshToken) return res.status(403).json({ message: "Invalid token" });
        const newAccessToken = generateAccessToken(user.id);
        res.json({ accessToken: newAccessToken });
    } catch (e) {
        res.status(403).json({ message: "Token failed" });
    }
};