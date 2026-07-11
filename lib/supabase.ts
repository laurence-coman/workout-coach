import { createClient } from "@supabase/supabase-js";

// Server-side client. Uses the service role key so API routes can read/write
// without row-level security setup. Never expose this key to the browser.
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
