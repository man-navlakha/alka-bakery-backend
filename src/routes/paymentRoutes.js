import express from "express";
import { initiatePhonePePayment, validatePhonePePayment } from "../controllers/phonePeController.js"; // Import new controller
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Razorpay (Keep existing)
// router.post("/create-order", protect, createRazorpayOrder);

// PhonePe (New)
router.post("/phonepe/initiate", protect, initiatePhonePePayment);
router.post("/phonepe/validate", protect, validatePhonePePayment);

export default router;