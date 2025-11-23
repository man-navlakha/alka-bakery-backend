// src/config/supabase.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// 1. Standard Client (Public/Anon) - For client-side auth interactions if needed
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. Admin Client (Service Role) - For Backend Database Operations (Bypasses RLS)
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

export const supabaseAdmin = createClient(process.env.SUPABASE_URL, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});