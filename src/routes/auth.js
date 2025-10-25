import express from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  getProfile,
  refreshAccessToken,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { body, validationResult } from 'express-validator';


const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};


const router = express.Router();
// Update Register Route
router.post(
  "/register",
  [ // Add validation array
    body('name', 'Name is required').notEmpty().trim().escape(),
    body('email', 'Please include a valid email').isEmail().normalizeEmail(),
    body('password', 'Password must be 6 or more characters').isLength({ min: 6 }),
  ],
  handleValidationErrors, // Add error handler middleware
  registerUser
);

// Update Login Route
router.post(
  "/login",
  [ // Add validation array
    body('email', 'Please include a valid email').isEmail().normalizeEmail(),
    body('password', 'Password is required').exists(),
  ],
  handleValidationErrors, // Add error handler middleware
  loginUser
);
router.post("/logout", logoutUser);
router.get("/me", protect, getProfile);
router.post("/refresh-token", refreshAccessToken); // ✅ Add this

export default router;
