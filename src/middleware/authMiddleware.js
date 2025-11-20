// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';

export const protect = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  
  if (!token) return res.status(401).json({ message: 'Not authorized, token missing' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Standardize: req.user is the FULL object. Controllers must use req.user.id
    req.user = decoded; 
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Optional auth for Cart (Guests + Users)
export const identifyUser = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Set full object here too
  } catch (err) {
    req.user = null;
  }
  next();
};