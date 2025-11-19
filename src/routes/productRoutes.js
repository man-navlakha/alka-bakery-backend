// productRoutes.js
import express from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";

const router = express.Router();

// Public: list products
router.get("/", getProducts);

// Public: single product
router.get("/:id", getProductById);

// Protected/Admin: create product (you should protect this route with auth middleware in production)
router.post("/", createProduct);

// Protected/Admin: update product
router.put("/:id", updateProduct);

// Protected/Admin: delete product
router.delete("/:id", deleteProduct);

export default router;
