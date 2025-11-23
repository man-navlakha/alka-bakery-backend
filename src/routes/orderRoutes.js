import express from "express";
import { placeOrder, getUserOrders } from "../controllers/orderController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect); // All order routes require login
router.post("/", placeOrder);
router.get("/", getUserOrders);

export default router;