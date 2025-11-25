// src/routes/cartRoutes.js
import express from "express";
import asyncHandler from "express-async-handler";
import {
  getCart,
  addItem,
  updateItem,
  removeItem,
  applyCoupon,
  removeCoupon,
  getAvailableCoupons,
  mergeOrderToCart
} from "../controllers/cartController.js";
import { identifyUser } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(identifyUser);
// GET /api/cart
router.get("/", asyncHandler(getCart));

// GET /api/cart/coupons (New public list for dropdown)
router.get("/coupons", asyncHandler(getAvailableCoupons));

// POST /api/cart/items
router.post("/items", asyncHandler(addItem));

// PATCH /api/cart/items/:itemId
router.patch("/items/:itemId", asyncHandler(updateItem));

// DELETE /api/cart/items/:itemId
router.delete("/items/:itemId", asyncHandler(removeItem));

// POST /api/cart/apply-coupon
router.post("/apply-coupon", asyncHandler(applyCoupon));

// DELETE /api/cart/coupon
router.delete("/coupon", asyncHandler(removeCoupon));

// POST /api/cart/merge-order
router.post("/merge-order", asyncHandler(mergeOrderToCart));

export default router;
