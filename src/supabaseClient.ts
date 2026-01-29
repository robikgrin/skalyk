import { createClient } from '@supabase/supabase-js';

// Используем import.meta.env для Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or Key is missing in .env file');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);