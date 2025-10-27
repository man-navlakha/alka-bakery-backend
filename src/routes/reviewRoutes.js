import express from "express";
import { 
    addReview, 
    getApprovedReviews,
    getAllReviewsAdmin,
    approveReviewAdmin,
    deleteReviewAdmin
} from "../controllers/reviewController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminCheck } from "../middleware/adminMiddleware.js";

const router = express.Router();

// Public route to get reviews for a specific product
router.get("/:productId", getApprovedReviews);

// Protected route for users to add a review
router.post("/:productId", protect, addReview);

// --- Admin Routes ---
router.get("/admin/all", protect, adminCheck, getAllReviewsAdmin);
router.put("/admin/approve/:reviewId", protect, adminCheck, approveReviewAdmin);
router.delete("/admin/:reviewId", protect, adminCheck, deleteReviewAdmin);

export default router;