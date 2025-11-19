import express from "express";
import {
    getCart,
    addOrUpdateItem,
    updateCartItemDetails,
    removeItem,
    applyCoupon,
    removeCoupon,
    setGiftWrap
} from "../controllers/cartController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Apply protect middleware to all cart routes
router.use(protect);

// Get Cart Details
router.get("/", getCart);

// Add/Update Item (based on variant existence in cart)
router.post("/item", addOrUpdateItem);

// Update Specific Item Details (Quantity, Note)
router.put("/item/:itemId", updateCartItemDetails);

// Remove Item
router.delete("/item/:itemId", removeItem);

// Apply Coupon
router.post("/coupon", applyCoupon);

// Remove Coupon
router.delete("/coupon", removeCoupon);

// Set Gift Wrapping
router.put("/giftwrap", setGiftWrap);


export default router;