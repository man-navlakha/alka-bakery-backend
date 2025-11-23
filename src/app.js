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
import { autoSuggest, getPlaceDetails } from './services/mapplsService.js';
// Note: Ensure the path matches where you created the file. 
// If you put it in 'services', use './services/mapplsService.js'.
import cookieParser from "cookie-parser"; // Ensure this is imported
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';


dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());

// Configure CORS
app.use(
  cors({
    origin: "http://localhost:5173", // Frontend origin
    credentials: true,               // Allow cookies and authorization headers
  })
);
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

app.use("/api/admin/coupons", adminCouponRoutes);
app.use("/api/admin/reviews", adminReviewsRoutes);

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