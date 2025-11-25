import express from "express";
import { getAllOrdersAdmin, updateOrder } from "../controllers/orderController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminCheck } from "../middleware/adminMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getAllOrdersAdmin); 
router.put("/:id", updateOrder); 

export default router;