import express from "express";
import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../controllers/categoryController.js";
import { protect } from "../middleware/authMiddleware.js";

import { adminCheck } from "../middleware/adminMiddleware.js";

const router = express.Router();

router.route("/")
  .post(protect, adminCheck, createCategory)
  .get(getCategories);

router.route("/:id")
  .get(getCategoryById)
  .put(protect, adminCheck, updateCategory)
  .delete(protect, adminCheck, deleteCategory);

export default router;
