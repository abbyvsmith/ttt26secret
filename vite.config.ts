import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Only variables with these prefixes reach the browser. NEXT_PUBLIC_ lets the
  // app use the public Supabase values Vercel's Supabase integration adds;
  // secret ones (service role, JWT secret, POSTGRES_*) never match.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
});
