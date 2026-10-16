import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { createDemoBackend } from './demoBackend';
import { createSupabaseBackend } from './supabaseBackend';

export * from './types';

export const backend =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createSupabaseBackend(SUPABASE_URL, SUPABASE_ANON_KEY)
    : createDemoBackend();
