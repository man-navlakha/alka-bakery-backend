// src/routes/reviewRoutes.js
import express from "express";
import { 
  listReviews, 
  reviewsSummary, 
  createReview, 
  getUserReviewedProducts // <--- Import this
} from "../controllers/reviewController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.get("/products/:productId/reviews", listReviews);
router.get("/products/:productId/reviews/summary", reviewsSummary);
router.post("/products/:productId/reviews", createReview);

// Protected routes
router.get("/me/products", protect, getUserReviewedProducts); // <--- Add this line

export default router;