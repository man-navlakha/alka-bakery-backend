import { supabase } from "../config/supabase.js";
import { generateAccessToken, generateRefreshToken } from "../utils/generateToken.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/**
 * 🧁 Register User
 */
export const registerUser = async (req, res) => {
  try {
    // ... (validation should be handled by express-validator middleware)
    const { name, email, password } = req.body;

    // Check if user already exists (keep this)
    const { data: existingUser } = await supabase
      .from("users")
      .select("id") // Only select necessary field
      .eq("email", email)
      .maybeSingle(); // Use maybeSingle to handle null without error

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const { data: newUser, error } = await supabase
      .from("users")
      .insert([{ name, email, password: hashedPassword }])
      .select("id, name, email") // Select only needed fields
      .single();

    if (error) throw error; // Let global error handler catch DB errors

    // Generate tokens
    const accessToken = generateAccessToken(newUser.id);
    const refreshToken = generateRefreshToken(newUser.id);

    // Store refresh token in DB (handle potential error)
    const { error: updateError } = await supabase
      .from("users")
      .update({ refresh_token: refreshToken })
      .eq("id", newUser.id);

    // If storing the refresh token fails, we might want to rollback or log
    if (updateError) {
      console.error("Failed to store refresh token during registration:", updateError);
      // Decide how to handle: maybe delete the user or just return an error
      return res.status(500).json({ message: "Registration failed during token storage." });
    }


    // --- Send Response ---
    // Send response AFTER setting cookie
    res.json({
      message: "Login successful",
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken, // <-- ADD THIS LINE
    });

  } catch (error) {
    console.error("Registration Error:", error); // Log the actual error
    res.status(500).json({ message: "An unexpected error occurred during registration." }); // Generic message
  }
};

/**
 * 🍪 Login User
 */
export const loginUser = async (req, res) => {
  try {
    console.log("Login attempt for:", req.body.email); // Log entry
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

    console.log("Credentials valid for:", email); // Log success

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    console.log("Generated Tokens. AccessToken:", accessToken.substring(0, 10) + "...", "RefreshToken:", refreshToken.substring(0, 10) + "..."); // Log token generation

    // Update refresh token in DB
    const { error: updateError } = await supabase
      .from("users")
      .update({ refresh_token: refreshToken })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to update refresh token in DB:", updateError);
      // Non-critical, but log it. Proceed with login.
    } else {
      console.log("Successfully updated refresh token in DB for user:", user.id);
    }

    // --- Send Response ---
    res.json({
      message: "Login successful",
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken, // <-- ADD THIS LINE
    });
    console.log("Response sent."); // Log after res.json

  } catch (error) {
    console.error("Login Error in catch block:", error); // Log any caught errors
    res.status(500).json({ message: "An unexpected error occurred during login." });
  }
};

/**
 * 🔒 Logout User
 */
export const logoutUser = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  // Define cookie options for clearing (must match setting options like path, domain if used)
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // Match the setting options
    // Add path: '/' if you set it during login/register
    // Add domain: 'yourdomain.com' if applicable
  };

  if (!refreshToken) {
    // No token, maybe already logged out or cookie expired. Still clear just in case.
    res.clearCookie("refreshToken", cookieOptions);
    return res.sendStatus(204); // No Content
  }

  try {
    // Verify token to get user ID
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    // Clear the refresh token in the database
    await supabase
      .from("users")
      .update({ refresh_token: null })
      .eq("id", payload.id); // Use ID from verified token

    // Clear the cookie and send success response
    res.clearCookie("refreshToken", cookieOptions);
    res.status(200).json({ message: "Logout successful" });

  } catch (err) {
    // If token verification fails (invalid/expired), still clear the potentially invalid cookie
    console.warn("Logout attempt with invalid refresh token:", err.message);
    res.clearCookie("refreshToken", cookieOptions);
    // Don't send an error, just indicate success or no content from client's perspective
    res.status(204).send();
  }
};

/**
 * 🍰 Get Logged-In User Profile
 */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user; // Set by 'protect' middleware

    const { data: user, error } = await supabase
      .from("users")
      // Select fields needed by the frontend profile display
      .select("id, name, email, created_at, role")
      .eq("id", userId)
      .single(); // Use single as user MUST exist if middleware passed

    if (error) throw error; // Should ideally not happen if middleware is correct
    // No need to check !user because middleware already verified the ID from a valid token

    res.json({ user }); // Send the user object directly

  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ message: "Failed to fetch profile." });
  }
};

/**
 * 🔄 Refresh Access Token
 */
export const refreshAccessToken = async (req, res) => {
  // Read token from request BODY instead of cookies
  const { refreshToken } = req.body; // <-- CHANGE THIS

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh Token missing in request body" }); // Update message
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const { data: user, error: dbError } = await supabase
      .from("users")
      .select("id, refresh_token")
      .eq("id", payload.id)
      .maybeSingle();

    if (dbError) throw dbError;

    // Still compare against DB token for security
    if (!user || user.refresh_token !== refreshToken) {
      // No need to clear cookie here
      return res.status(403).json({ message: "Invalid or revoked Refresh Token" });
    }

    const newAccessToken = generateAccessToken(user.id);
    res.json({ accessToken: newAccessToken });

  } catch (err) {
    console.warn("Refresh token verification failed:", err.message);
    // No cookie to clear
    res.status(403).json({ message: "Invalid or expired Refresh Token" });
  }
};