import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

const viteEnvironment = import.meta.env as unknown as Record<string, string | undefined>;

export function isSupabaseConfigured() {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? viteEnvironment.VITE_SUPABASE_URL) &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? viteEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY),
  );
}

export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  if (!browserClient) {
    browserClient = createClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL ?? viteEnvironment.VITE_SUPABASE_URL)!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? viteEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY)!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
  }
  return browserClient;
}
