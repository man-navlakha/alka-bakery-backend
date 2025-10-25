import express from "express";
import { 
  addToCart, 
  getUserCart, 
  updateCartItem, 
  removeCartItem 
} from "../controllers/cartController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Add item to cart
router.post("/", protect, addToCart);

// Get logged-in user's cart
router.get("/", protect, getUserCart);

// Update quantity of a cart item
router.put("/:id", protect, updateCartItem);

// Remove item from cart
router.delete("/:id", protect, removeCartItem);

export default router;
