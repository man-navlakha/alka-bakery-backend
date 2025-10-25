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

    // --- Set the Cookie ---
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", // Use 'lax' for better dev compatibility between ports
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // --- Send Response ---
    // Send response AFTER setting cookie
    res.status(201).json({
      message: "User registered successfully",
      user: newUser, // Send the user object fetched after insert
      accessToken, // Only send accessToken in body
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
    // ... (validation handled by express-validator)
    const { email, password } = req.body;

    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("id, name, email, password, refresh_token, role") // Include role if needed by frontend
      .eq("email", email)
      .maybeSingle(); // Use maybeSingle

    // Differentiate between DB error and user not found
    if (fetchError) throw fetchError;
    if (!user) return res.status(401).json({ message: "Invalid credentials" });


    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });


    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Update refresh token in DB only if it's different (optional optimization)
    // or always update to ensure it's fresh
    const { error: updateError } = await supabase
      .from("users")
      .update({ refresh_token: refreshToken })
      .eq("id", user.id);

    if (updateError) {
        console.error("Failed to update refresh token during login:", updateError);
        // Non-critical, but log it. Proceed with login.
    }

    // --- Set the Cookie ---
    res.cookie("refreshToken", refreshToken, {
    httpOnly: true,                         // Makes it inaccessible to JS
    secure: process.env.NODE_ENV === "production", // SHOULD BE FALSE in local HTTP dev
    sameSite: "lax",                        // Allows sending from different ports on localhost
    maxAge: 7 * 24 * 60 * 60 * 1000,        // 7 days in milliseconds
    // path: '/' // Optionally add path: '/' if needed later
});

    // --- Send Response ---
    res.json({
      message: "Login successful",
      // Exclude password and refresh_token from response
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
    });

  } catch (error) {
    console.error("Login Error:", error);
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
  // Read token from cookies
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    // Use 401 Unauthorized, as this implies missing credentials
    return res.status(401).json({ message: "Refresh Token missing" });
  }

  try {
    // Verify refresh token signature and expiry
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    // Check if token exists and matches in the DB (prevents reuse after logout/theft)
    const { data: user, error: dbError } = await supabase
      .from("users")
      .select("id, refresh_token")
      .eq("id", payload.id)
      .maybeSingle(); // Use maybeSingle

    if (dbError) throw dbError; // Handle potential DB errors

    // If user not found OR the stored token doesn't match the one provided
    if (!user || user.refresh_token !== refreshToken) {
       // Clear potentially compromised cookie if it exists but doesn't match DB
       if (user && user.refresh_token !== refreshToken) {
          res.clearCookie("refreshToken", {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
          });
       }
       // Use 403 Forbidden as the token was present but invalid/revoked
      return res.status(403).json({ message: "Invalid or revoked Refresh Token" });
    }

    // If token is valid and matches DB, generate a new access token
    const newAccessToken = generateAccessToken(user.id);
    res.json({ accessToken: newAccessToken });

  } catch (err) {
    // Handle JWT errors (expired, malformed, etc.)
    console.warn("Refresh token verification failed:", err.message);
     // Clear the invalid/expired cookie
     res.clearCookie("refreshToken", {
         httpOnly: true,
         secure: process.env.NODE_ENV === "production",
         sameSite: "lax",
     });
    // Use 403 Forbidden for invalid/expired tokens
    res.status(403).json({ message: "Invalid or expired Refresh Token" });
  }
};