import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://guarlhujglahctspnxng.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1YXJsaHVqZ2xhaGN0c3BueG5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTQzNzcsImV4cCI6MjA4NTIzMDM3N30.KDg-neQx0bfxtPDepsffGWTNDsTmi_nqyeolAR8pG3U';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);