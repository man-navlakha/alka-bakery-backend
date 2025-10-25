import express from "express";
import {
  registerUser,
  loginUser,
  getProfile,
  refreshAccessToken,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", protect, getProfile);
router.post("/refresh-token", refreshAccessToken); // ✅ Add this

export default router;
