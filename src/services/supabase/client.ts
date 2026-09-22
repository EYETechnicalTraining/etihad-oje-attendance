import { createClient } from '@supabase/supabase-js';

// Central Supabase Cloud Database Credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://yqnwvdqkttpfrujypqve.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxbnd2ZHFrdHRwZnJ1anlwcXZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzE0ODYsImV4cCI6MjEwNTY0NzQ4Nn0.ownqVqU9V0Wdzal2ax3f993W_GLqKfbWSiDrR5GDNXQ';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
