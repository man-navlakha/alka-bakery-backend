// reviewRoutes.js
import express from "express";
import { listReviews, reviewsSummary, createReview, /* other handlers */ } from "../controllers/reviewController.js";

const router = express.Router();

router.get("/products/:productId/reviews", listReviews);
router.get("/products/:productId/reviews/summary", reviewsSummary);
router.post("/products/:productId/reviews", createReview); // your createReview from earlier

// helpful, replies etc...
// router.post("/reviews/:id/helpful", markHelpful);

export default router;
