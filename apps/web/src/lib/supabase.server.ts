import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Supabase clients — server-only by `import "server-only"` at the top.
 * Importing this module from any `"use client"` file will throw at
 * build time, making accidental service-role-key exposure impossible.
 *
 * The `supabaseAnon` client is defined here purely so the two singletons
 * share one config source. It's still a server-side singleton; if
 * clients ever need direct Supabase access, create a separate
 * `supabase.client.ts` (without `server-only`) that uses only the
 * NEXT_PUBLIC_ anon key.
 *
 * SECURITY_AUDIT.md §S9.
 */

/** Service-role client — bypasses RLS. Never expose to the browser. */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Anon-key client — server-side for parity. */
export const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
