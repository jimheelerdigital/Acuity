/**
 * Synchronous in-memory bearer-token cache — Layer 4 of the
 * SecureStore-race saga (build 29, 2026-05-06).
 *
 * Why this lives in its own file instead of contexts/auth-context.tsx
 * (where the original build-29 plan placed it):
 *
 *   contexts/auth-context.tsx imports from lib/api (it calls
 *   api.get('/api/user/me') in refresh() and api.post('/api/user/delete')
 *   in deleteAccount()). lib/api is the read site for the bridge.
 *   Co-locating the bridge with the Provider creates a circular
 *   import — auth-context → api → auth-context. ES module live
 *   bindings would technically resolve it, but the entire premise
 *   of this fix is that production Hermes/Metro module loading is
 *   showing surprises (build 28's lib/auth memoryToken closure
 *   didn't persist as expected), so adding a cycle is exactly the
 *   class of risk we're trying to dodge. Standalone module → no
 *   cycle, single eval path.
 *
 * What the bridge does:
 *
 *   set() — called by AuthContext.setAuthenticatedUser when sign-in
 *           hands off a fresh sessionToken, and by refresh() once
 *           getToken resolves (cold-launch hydration).
 *   get() — called by api.ts buildHeaders/upload SYNCHRONOUSLY
 *           before falling back to await getToken(). No await tick
 *           between read and Headers.set('Authorization', ...).
 *
 * Builds 26-28 each shipped a different mitigation for the iOS
 * keychain settling delay between SecureStore.setItemAsync and the
 * next SecureStore.getItemAsync (commits 8c2734a, 32f1faa, 3bf1778).
 * Build 28's in-memory `memoryToken` cache in lib/auth.ts SHOULD
 * have closed the gap, but production diagnostics
 * (`mobile-auth.no-header` events scoped to bearer-required routes)
 * confirmed bearer was still missing on every post-sign-in API call.
 * Working hypothesis: a Hermes/Metro module-loading quirk produces
 * two evaluation contexts for lib/auth.ts in the production bundle,
 * so setToken's memoryToken write happens in one closure and
 * getToken's read in another. This module is loaded at exactly one
 * site — top-level imports from auth-context and api — with no
 * cycle, giving Metro the simplest possible dependency graph.
 */
let bridgeToken: string | null = null;

export const tokenBridge = {
  set(token: string | null): void {
    bridgeToken = token;
  },
  get(): string | null {
    return bridgeToken;
  },
};
