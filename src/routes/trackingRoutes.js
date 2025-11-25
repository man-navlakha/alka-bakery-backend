import express from "express";
import { trackOrder } from "../controllers/trackingController.js";

const router = express.Router();

// Public route: /api/tracking/:orderId
router.get("/:orderId", trackOrder);

export default router;