import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./env";

let supabaseInstance: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase client using the service-role key.
 * Safe to call multiple times — only one client is created.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey
    );
  }
  return supabaseInstance;
}
