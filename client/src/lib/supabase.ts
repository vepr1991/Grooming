import { createClient } from '@supabase/supabase-js';

// Используем VITE_ префикс
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase URL and Key are missing. Check your .env file or Render environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);