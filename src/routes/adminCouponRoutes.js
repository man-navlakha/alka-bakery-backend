// src/routes/adminCouponRoutes.js
import express from "express";
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from "../controllers/adminCouponController.js";

// If you have auth middleware, import it here:
// import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// If you have auth, you probably want:
// router.use(protect);
// router.use(adminOnly);

// GET /api/admin/coupons
router.get("/", listCoupons);

// POST /api/admin/coupons
router.post("/", createCoupon);

// PUT /api/admin/coupons/:id
router.put("/:id", updateCoupon);

// DELETE /api/admin/coupons/:id
router.delete("/:id", deleteCoupon);

export default router;
