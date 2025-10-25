import express from "express";
import { addProduct, getProducts, getProductById, updateProduct, deleteProduct } from "../controllers/productController.js";
import { protect } from "../middleware/authMiddleware.js";
import fileUpload from "express-fileupload";
import { adminCheck } from "../middleware/adminMiddleware.js";

const router = express.Router();

// Middleware to handle file uploads
router.use(fileUpload({ useTempFiles: true }));

// Routes
router.post("/", protect, adminCheck, addProduct);       // Add product (protected)
router.get("/", getProducts);               // Get all products
router.get("/:id", getProductById);         // Get single product

// Update product (admin only)
router.put("/:id", protect, adminCheck, updateProduct);

// Delete product (admin only)
router.delete("/:id", protect, adminCheck, deleteProduct);


export default router;
