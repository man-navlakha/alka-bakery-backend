// src/routes/profileRoutes.js
import express from "express";
import { getUserProfile, updateUserProfile } from "../controllers/profileController.js";
import { protect } from "../middleware/authMiddleware.js";
import { body, validationResult } from 'express-validator';

// Optional: Validation middleware for profile updates
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const router = express.Router();

// GET current user's profile
// Uses protect middleware to ensure user is logged in
router.get("/", protect, getUserProfile);

// PUT update current user's profile
// Uses protect middleware
router.put(
    "/",
    protect,
    [ // Add validation rules for fields you allow updating
        body('name', 'Name cannot be empty').notEmpty().trim().escape(),
        // Add validation for other fields like address, phone if you add them
    ],
    handleValidationErrors, // Apply validation
    updateUserProfile
);

export default router;