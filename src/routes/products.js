import express from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import { supabase } from '../config/supabase.js';
import { protect } from '../middleware/authMiddleware.js';
import fs from 'fs';

const router = express.Router();
const upload = multer({ dest: '/tmp/uploads' });

// Add product (protected)
router.post('/add', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Image file required' });
    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'alka-bakery' });
    // remove temp file
    try { fs.unlinkSync(req.file.path); } catch(e){ /* ignore */ }

    const { name, price, category, description } = req.body;
    const { data, error } = await supabase
      .from('products')
      .insert([{ name, price: Number(price), category, description, image: result.secure_url }])
      .select('*')
      .single();
    if (error) throw error;
    res.json({ message: 'Product added', product: data });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Add product failed' });
  }
});

// Public: list products
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ products: data });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Fetch failed' });
  }
});

export default router;
