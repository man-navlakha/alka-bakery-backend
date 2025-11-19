// routes/adminReviewsRoutes.js
import express from "express";
import {
  listReviews,
  getReview,
  approveReview,
  rejectReview,
  replyToReview,
  deleteReview,
  bulkAction,
  exportReviewsCsv
} from "../controllers/adminReviewsController.js";

const router = express.Router();

// GET /api/admin/reviews
router.get("/", listReviews);

// GET /api/admin/reviews/:id
router.get("/:id", getReview);

// POST /api/admin/reviews/:id/approve
router.post("/:id/approve", approveReview);

// POST /api/admin/reviews/:id/reject
router.post("/:id/reject", rejectReview);

// POST /api/admin/reviews/:id/reply
router.post("/:id/reply", replyToReview);

// DELETE /api/admin/reviews/:id
router.delete("/:id", deleteReview);

// POST /api/admin/reviews/bulk
router.post("/bulk", bulkAction);

// GET /api/admin/reports/reviews (export CSV)
router.get("/reports/reviews", exportReviewsCsv);

export default router;
