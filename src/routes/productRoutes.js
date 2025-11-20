// productRoutes.js
import express from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadMiddleware,
} from "../controllers/productController.js";

const router = express.Router();

// Public: list products
router.get("/", getProducts);

// Public: single product
router.get("/:id", getProductById);

// Add the middleware here. 'images' matches the field name in Postman/Frontend
router.post('/', uploadMiddleware, createProduct); 

// Add here too
router.put('/:id', uploadMiddleware, updateProduct);

// Protected/Admin: delete product
router.delete("/:id", deleteProduct);

export default router;
