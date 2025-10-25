import express from "express";
import { placeOrder, getUserOrders, updateOrderStatus } from "../controllers/orderController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Place order (user)
router.post("/", protect, placeOrder);

// Get logged-in user's orders
router.get("/user", protect, getUserOrders);

// Update order status (admin)
router.put("/:id", protect, updateOrderStatus);

export default router;
