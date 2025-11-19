import { supabase } from "../config/supabase.js";
import { generateAccessToken, generateRefreshToken } from "../utils/generateToken.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/**
 * 📝 Register User
 */
export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const { data: newUser, error } = await supabase
      .from("users")
      .insert([{ name, email, password: hashedPassword }])
      .select("id, name, email, role") // ✅ Added 'role' to selection
      .single();

    if (error) throw error;

    // Generate tokens
    const accessToken = generateAccessToken(newUser.id);
    const refreshToken = generateRefreshToken(newUser.id);

    // Store refresh token in DB
    const { error: updateError } = await supabase
      .from("users")
      .update({ refresh_token: refreshToken })
      .eq("id", newUser.id);

    if (updateError) {
      console.error("Failed to store refresh token during registration:", updateError);
      return res.status(500).json({ message: "Registration failed during token storage." });
    }

    // --- Send Response ---
    res.json({
      message: "Registration successful",
      // ✅ FIX: Changed 'user' to 'newUser'
      user: { 
        id: newUser.id, 
        name: newUser.name, 
        email: newUser.email, 
        role: newUser.role 
      },
      accessToken,
      refreshToken,
    });

  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ message: "An unexpected error occurred during registration." });
  }
};

// ... (Keep loginUser, logoutUser, etc. as they were) ...
export const loginUser = async (req, res) => {
  try {
    console.log("Login attempt for:", req.body.email); 
    const { email, password } = req.body;

    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("id, name, email, password, refresh_token, role")
      .eq("email", email)
      .maybeSingle();

    if (fetchError) {
      console.error("Supabase fetch error:", fetchError);
      throw fetchError;
    }
    if (!user) {
      console.warn("User not found:", email);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.warn("Password mismatch for user:", email);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    console.log("Credentials valid for:", email); 

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    console.log("Generated Tokens. AccessToken:", accessToken.substring(0, 10) + "...", "RefreshToken:", refreshToken.substring(0, 10) + "..."); 

    // Update refresh token in DB
    const { error: updateError } = await supabase
      .from("users")
      .update({ refresh_token: refreshToken })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to update refresh token in DB:", updateError);
    } else {
      console.log("Successfully updated refresh token in DB for user:", user.id);
    }

    // --- Send Response ---
    res.json({
      message: "Login successful",
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken, 
    });
    console.log("Response sent."); 

  } catch (error) {
    console.error("Login Error in catch block:", error); 
    res.status(500).json({ message: "An unexpected error occurred during login." });
  }
};

export const logoutUser = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", 
  };

  if (!refreshToken) {
    res.clearCookie("refreshToken", cookieOptions);
    return res.sendStatus(204); 
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    await supabase
      .from("users")
      .update({ refresh_token: null })
      .eq("id", payload.id); 

    res.clearCookie("refreshToken", cookieOptions);
    res.status(200).json({ message: "Logout successful" });

  } catch (err) {
    console.warn("Logout attempt with invalid refresh token:", err.message);
    res.clearCookie("refreshToken", cookieOptions);
    res.status(204).send();
  }
};

export const getProfile = async (req, res) => {
  try {
    const userId = req.user; 

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, created_at, role")
      .eq("id", userId)
      .single(); 

    if (error) throw error; 

    res.json({ user }); 

  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ message: "Failed to fetch profile." });
  }
};

export const refreshAccessToken = async (req, res) => {
  const { refreshToken } = req.body; 

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh Token missing in request body" }); 
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const { data: user, error: dbError } = await supabase
      .from("users")
      .select("id, refresh_token")
      .eq("id", payload.id)
      .maybeSingle();

    if (dbError) throw dbError;

    if (!user || user.refresh_token !== refreshToken) {
      return res.status(403).json({ message: "Invalid or revoked Refresh Token" });
    }

    const newAccessToken = generateAccessToken(user.id);
    res.json({ accessToken: newAccessToken });

  } catch (err) {
    console.warn("Refresh token verification failed:", err.message);
    res.status(403).json({ message: "Invalid or expired Refresh Token" });
  }
};