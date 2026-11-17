import { createClient } from "@supabase/supabase-js";

function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Creates a trusted server client. The secret key is never sent to the browser.
 * The legacy service-role name remains supported while projects migrate.
 */
export function createServerSupabaseClient() {
  const url = getRequiredEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL");
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      "Missing required environment variable: SUPABASE_SECRET_KEY",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
