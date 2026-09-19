import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Cookie-less client for public pages (shared recipe links). It can only
 *  do what the anon role is granted — currently: call get_shared_recipe. */
export function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables");
  }
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
