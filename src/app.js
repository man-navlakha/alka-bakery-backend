import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
// import orderRoutes from "./routes/orderRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";

dotenv.config();
const PORT = process.env.PORT || 3000;
const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("🍰 Welcome to Alka Bakery API!"));

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
// app.use("/api/orders", orderRoutes);
app.use("/api/contact", contactRoutes);
app.listen(PORT, () => {
  console.log(`🍰 Alka Bakery API is running on port ${PORT}`);
});

export default app;
