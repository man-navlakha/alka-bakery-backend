import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import orderRoutes from "./routes/orderRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import productRoutes from "./routes/products.js";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express(); // ✅ create express app here
const PORT = process.env.PORT || 3000;

// ✅ Middleware
app.use(
  cors({
    origin: "http://localhost:5173", // your frontend (Vite)
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// ✅ Test route
app.get("/", (req, res) => res.send("🍰 Welcome to Alka Bakery API!"));

// ✅ Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/contact", contactRoutes);

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🍰 Alka Bakery API is running on port ${PORT}`);
});

export default app;
