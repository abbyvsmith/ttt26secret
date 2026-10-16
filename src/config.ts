// Must match public.is_allowed_user() in supabase/schema.sql.
export const ALLOWED_EMAIL_DOMAIN = 'viget.com';

// NEXT_PUBLIC_* come from Vercel's Supabase integration; VITE_* are for local .env.local.
const env = import.meta.env;
export const SUPABASE_URL = (env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL) as
  | string
  | undefined;
export const SUPABASE_ANON_KEY = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY) as string | undefined;
