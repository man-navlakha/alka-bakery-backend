import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import contactRoutes from "./routes/contactRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import addressRoutes from "./routes/addressRoutes.js";
import adminReviewsRoutes from "./routes/adminReviewsRoutes.js";
import adminCouponRoutes from "./routes/adminCouponRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import adminOrderRoutes from "./routes/adminOrderRoutes.js"; // Import new file
import { autoSuggest, getPlaceDetails } from './services/mapplsService.js';

import { supabaseAdmin } from "./config/supabase.js";
// Note: Ensure the path matches where you created the file. 
// If you put it in 'services', use './services/mapplsService.js'.
import cookieParser from "cookie-parser"; // Ensure this is imported
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';


dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());

// Whitelist the origins you use in dev
const WHITELIST = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.10.18:5173", // your LAN machine if you use that
  // add any other local dev hosts you use
];

// More permissive fallback (echo origin) — good for dev only
const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like curl, mobile apps, or server-to-server)
    if (!origin) return callback(null, true);

    if (WHITELIST.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // you may want to allow all in dev: callback(null, true)
      callback(new Error("CORS: Not allowed by CORS"));
    }
  },
  credentials: true, // allow cookies/auth headers
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
};

app.use(cors(corsOptions));

// Ensure preflight is handled for all routes
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(cookieParser());


// --- Rate Limiting ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP (Relaxed for dev, tighten in prod maybe to 10-20)
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true, // Return rate limit info
  legacyHeaders: false,
});

// Apply rate limiting specifically to sensitive auth endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/refresh-token', authLimiter); // Good to limit refresh attempts too

app.use("/api", reviewRoutes);

app.use("/api/addresses", addressRoutes);

// --- Routes ---
// Test route
app.get("/", (req, res) => res.send("🍰 Welcome to Alka Bakery API!"));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin/coupons", adminCouponRoutes);
app.use("/api/admin/reviews", adminReviewsRoutes);
app.use("/api/admin/orders", adminOrderRoutes);

// --- Global Error Handler (Optional but Recommended) ---
// Add a simple error handler at the end
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Something went wrong!',
    // Optionally include stack in development
    // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});
// --- Mappls Routes ---
app.get('/api/places/search', async (req, res) => {
  const { query, location } = req.query;
  if (!query) return res.status(400).json({ error: 'Query parameter is required' });

  try {
    const data = await autoSuggest(query, location);
    res.json(data);
  } catch (error) {
    console.error("Autosuggest Error:", error.message);
    res.status(500).json({ error: 'Error fetching suggestions' });
  }
});

app.get('/api/places/details/:eloc', async (req, res) => {
  const { eloc } = req.params;
  if (!eloc) return res.status(400).json({ error: 'eLoc is required' });

  try {
    const data = await getPlaceDetails(eloc);
    res.json(data);
  } catch (error) {
    console.error("Place Details Error:", error.message);
    res.status(500).json({ error: 'Error fetching place details' });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Something went wrong!' });
});
// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🍰 Alka Bakery API is running on port http://localhost:${PORT}`);
});

export default app;