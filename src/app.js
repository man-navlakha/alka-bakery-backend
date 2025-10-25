import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import orderRoutes from "./routes/orderRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import productRoutes from "./routes/products.js";
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

// --- Routes ---
// Test route
app.get("/", (req, res) => res.send("🍰 Welcome to Alka Bakery API!"));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/contact", contactRoutes);

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


// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🍰 Alka Bakery API is running on port ${PORT}`);
});

export default app;