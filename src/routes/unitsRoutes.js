import express from "express";
import {
  createUnit,
  getUnits,
  getUnitById,
  updateUnit,
  deleteUnit,
} from "../controllers/unitController.js";
import { protect } from "../middleware/authMiddleware.js";

import { adminCheck } from "../middleware/adminMiddleware.js";

const router = express.Router();

// Create new unit (admin)
router.post("/", protect, adminCheck, createUnit);

// Get all units
router.get("/", getUnits);

// Get single unit by ID
router.get("/:id", getUnitById);

// Update a unit
router.put("/:id", protect, adminCheck, updateUnit);

// Delete a unit
router.delete("/:id", protect, adminCheck, deleteUnit);

export default router;
