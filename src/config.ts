// Must match public.is_allowed_user() in supabase/schema.sql.
export const ALLOWED_EMAIL_DOMAIN = 'viget.com';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
