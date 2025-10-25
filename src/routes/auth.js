import express from 'express';
import { supabase } from '../config/supabase.js';
import bcrypt from 'bcrypt';
import { generateToken } from '../utils/generateToken.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const { data: existing, error: findErr } = await supabase
      .from('users')
      .select('id,email')
      .eq('email', email)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('users')
      .insert([{ email, password: hashed, name }])
      .select('*')
      .single();
    if (error) throw error;

    const token = generateToken(data.id);
    res.json({ token, user: { id: data.id, email: data.email, name: data.name } });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    if (!user) return res.status(404).json({ message: 'User not found' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Invalid password' });

    const token = generateToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Login failed' });
  }
});

export default router;
