
import express from "express";
import {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress
} from "../controllers/addressController.js";
import { protect } from "../middleware/authMiddleware.js";
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Validator Middleware
const validateAddress = [
  body('recipient_name').notEmpty().withMessage('Recipient Name is required'),
  body('recipient_phone').notEmpty().isMobilePhone().withMessage('Valid phone number required'),
  body('street_address').notEmpty().withMessage('Street Address is required'),
  body('pincode').notEmpty().isLength({ min: 6 }).withMessage('Valid Pincode required'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    next();
  }
];

// All routes are protected
router.use(protect);

router.get("/", getAddresses);
router.post("/", validateAddress, addAddress);
router.put("/:id", updateAddress);
router.delete("/:id", deleteAddress);

export default router;