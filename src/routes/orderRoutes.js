import express from "express";
import { 
  placeOrder, 
  getUserOrders, 
  updateOrderStatus, 
  getAllOrders // <-- add this
} from "../controllers/orderController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Place order (user)
router.post("/", protect, placeOrder);

// Get logged-in user's orders
router.get("/user", protect, getUserOrders);

// 🧁 Admin: Get all orders
router.get("/admin", protect, getAllOrders); // <-- new route

// Update order status (admin)
router.put("/:id", protect, updateOrderStatus);

export default router;
