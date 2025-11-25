import express from "express";
import { placeOrder, getUserOrders, cancelOrder, generateInvoice } from "../controllers/orderController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect); // All order routes require login
router.post("/", placeOrder);
router.get("/", getUserOrders);
router.put("/:id/cancel", cancelOrder);
router.get("/:id/invoice", generateInvoice);

export default router;