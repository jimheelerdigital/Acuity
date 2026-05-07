import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import { api } from "@/lib/api";
import {
  getStoredUser,
  getToken,
  setStoredUser,
  signOut as clearSession,
  type User,
} from "@/lib/auth";
import { debugLog } from "@/lib/debug-log";
import { tokenBridge } from "@/lib/token-bridge";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

type AuthState = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /**
   * Set the authenticated user directly from a known-good source
   * (e.g. the response body of mobile-callback / mobile-login /
   * mobile-complete). Bypasses the SecureStore round-trip that
   * `refresh()` does — necessary because iOS Keychain's
   * setItemAsync resolves before the value is queryable on a
   * subsequent getItemAsync, and `refresh()` ends up reading null
   * and 401-ing on `/api/user/me`. Diagnosed 2026-05-04 against
   * Vercel logs (mobile-callback.success → /api/user/me 401 with
   * empty logs[] = no Authorization header attached).
   *
   * Caller is responsible for having already stored the session
   * token via `setToken()` so subsequent api.* calls have it. This
   * setter is only the in-memory state hop needed to route past
   * the sign-in screen without waiting for the next refresh tick.
   *
   * The optional `token` argument writes through to `tokenBridge`
   * (lib/token-bridge.ts) — a synchronous module-level cache that
   * api.ts reads first when attaching the Authorization header.
   * Sign-in handlers (handleGoogle/handleApple/handlePassword in
   * app/(auth)/sign-in.tsx) pass it explicitly so the very next
   * api call has the bearer in hand without needing the SecureStore
   * round-trip OR the lib/auth memoryToken closure to be intact —
   * see lib/token-bridge.ts for the full rationale.
   */
  setAuthenticatedUser: (user: User, token?: string) => void;
  /**
   * Permanently delete the signed-in account. Calls
   * POST /api/user/delete with `{ confirm: "DELETE" }`. Caller (the
   * modal) gates the call on the user typing DELETE; this helper
   * fires the request and clears local SecureStore + cached user
   * state on success.
   */
  deleteAccount: () => Promise<DeleteAccountResult>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
  setAuthenticatedUser: () => {},
  deleteAccount: async () => ({ ok: false, error: "Not initialized" }),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, _setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  // Wrapped setter — every call to setUser(null) flows through here
  // so we get a stack trace + caller tag attached to the diagnostic
  // event. Non-null setUser calls are also logged but without stack
  // (those are positive signals from sign-in / /api/user/me).
  const setUser = useCallback(
    (next: User | null, where: string = "unknown") => {
      if (next === null) {
        debugLog("setUser.null", { where }, { withStack: true });
      } else {
        debugLog("setUser.value", { where, userId: next.id });
      }
      _setUser(next);
    },
    []
  );
  // Tracks whether the very first refresh after AuthProvider mount
  // has completed. Used to discriminate "user is genuinely signed
  // out" (cold launch, getToken=null) from "keychain returned null
  // transiently" (warm refresh fired by AppState change). See the
  // gated !token branch in refresh() for the rationale.
  const initialRefreshDone = useRef(false);

  /**
   * Refresh the current user state. Three cases:
   *   1. No JWT in SecureStore → user is signed out. Set user=null.
   *   2. JWT exists + /api/user/me returns 200 → authoritative.
   *   3. JWT exists + /api/user/me returns 401 → the server rejected
   *      the token (expired, secret rotated, user deleted). Clear
   *      local state so the AuthGate routes back to sign-in.
   *
   * Between 1 and 2 we fall back to the cached User from SecureStore
   * so offline app launches don't flash the sign-in screen.
   */
  const refresh = useCallback(async () => {
    debugLog("auth.refresh.entry", {
      initialDone: initialRefreshDone.current,
    });
    try {
      const token = await getToken();
      debugLog("auth.refresh.token", {
        hasToken: token !== null,
        len: token?.length ?? 0,
      });
      if (!token) {
        // Cold launch only: a null token at the very first refresh
        // means the user is genuinely signed out. Clear state so
        // the AuthGate routes to sign-in.
        //
        // Warm refresh (foreground from background, OAuth modal
        // dismiss): a null token here is suspicious. Two known
        // failure modes converge on this branch and should NOT
        // be allowed to wipe state:
        //   1. iOS keychain returns null transiently because the
        //      preceding setItemAsync hasn't settled (the same
        //      SecureStore race we've been chasing across builds
        //      27-29).
        //   2. AppState fires inactive→active during the OAuth
        //      Safari modal dismiss, calling refresh() seconds
        //      after handleApple/handleGoogle/handlePassword has
        //      populated the bridge — but before SecureStore has
        //      committed, so getToken returns null and (pre-fix)
        //      this branch wiped the freshly-set bridge.
        // Trust the existing state on warm refreshes. If the
        // session truly died, the next /api/user/me call will 401
        // and the 401 catch below handles it.
        debugLog("auth.refresh.no-token-branch", {
          initialDone: initialRefreshDone.current,
          willClear: !initialRefreshDone.current,
        });
        if (!initialRefreshDone.current) {
          setUser(null, "refresh.cold-launch-no-token");
          tokenBridge.set(null);
        }
        return;
      }
      // Hydrate the synchronous bridge from whatever getToken
      // resolved (SecureStore on cold launch, lib/auth memoryToken
      // on hot reads). Cheap idempotent assignment; lets the next
      // api call read the bearer without hitting SecureStore even
      // before any sign-in event in this session.
      tokenBridge.set(token);

      try {
        const data = await api.get<{ user?: User }>("/api/user/me");
        if (data.user?.id) {
          debugLog("auth.refresh.me-200-with-user", { userId: data.user.id });
          setUser(data.user, "refresh.me-200");
          await setStoredUser(data.user);
          return;
        }
        // 200 with no user — treat as signed-out. Server has
        // explicitly told us the user no longer exists; clearing
        // local state is the right call here.
        debugLog("auth.refresh.me-200-no-user");
        setUser(null, "refresh.me-200-no-user");
        tokenBridge.set(null);
        await clearSession();
      } catch (err) {
        const status = (err as { status?: number }).status;
        debugLog("auth.refresh.me-error", {
          status: status ?? null,
          message: err instanceof Error ? err.message : String(err),
        });
        if (status === 401) {
          // 2026-05-06 fix: was previously calling clearSession()
          // here, which deletes the bearer token from SecureStore +
          // memoryToken cache. That created a feedback loop —
          // a single 401 (which can fire transiently for many
          // reasons including the bearer-attach race we've been
          // debugging across three slices) would permanently wipe
          // a valid session, kicking the user back to sign-in
          // every time the foreground-refresh hook ran. Now we
          // only setUser(null) so the AuthGate shows sign-in, but
          // the underlying token survives. If the user signs in
          // again, setToken just overwrites; if the 401 was
          // transient, the next refresh tick (next foreground or
          // tab focus) recovers automatically.
          //
          // The "real" sign-out path (Profile → Sign out →
          // signOut() in auth-context) still calls clearSession
          // explicitly. This catch handler only changes the
          // server-rejected-401 path.
          setUser(null, "refresh.me-401");
          return;
        }
        // Network or transient error — keep the cached user so the
        // app stays usable until the next refresh tick.
        const stored = await getStoredUser();
        debugLog("auth.refresh.network-error-fallback", {
          hasStored: stored !== null,
        });
        setUser(stored, "refresh.network-error-stored");
      }
    } finally {
      initialRefreshDone.current = true;
      setLoading(false);
    }
  }, [setUser]);

  // Track AuthProvider mount/unmount so we can prove (or disprove)
  // that the provider is being torn down by Hermes/Expo on
  // background/resume — one of the working hypotheses for
  // build-30's failure.
  useEffect(() => {
    debugLog("AuthProvider.mount");
    return () => {
      debugLog("AuthProvider.unmount", {}, { withStack: true });
    };
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Foreground-refresh pattern (docs/APPLE_IAP_DECISION.md §5):
  // when the user returns from Safari-based upgrade checkout, the
  // server's subscriptionStatus may have changed. Re-fetch on any
  // background→active transition so local state catches up without
  // requiring a sign-out / sign-in cycle.
  useEffect(() => {
    debugLog("AppState.listener.attach");
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      const willRefresh =
        Boolean(prev.match(/inactive|background/)) && next === "active";
      debugLog("AppState.change", { prev, next, willRefresh });
      if (willRefresh) {
        refresh();
      }
    });
    return () => {
      debugLog("AppState.listener.detach");
      sub.remove();
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    debugLog("auth-context.signOut.entry", {}, { withStack: true });
    // No server call — mobile sign-out is local-only (see lib/auth.ts
    // signOut() for rationale).
    await clearSession();
    tokenBridge.set(null);
    setUser(null, "auth-context.signOut");
  }, [setUser]);

  /**
   * Permanently delete the account. Server cascades the User row
   * (Entry, Task, Goal, WeeklyReport, LifeMapArea, UserMemory, etc),
   * cancels Stripe customer, removes Supabase Storage audio, and
   * writes a DeletedUser tombstone for trial-reset protection.
   *
   * On success, the local session is cleared via signOut so the
   * AuthGate routes back to /(auth)/sign-in. On failure, the local
   * session is preserved — the user remains signed in and can retry
   * or contact support.
   */
  const deleteAccount = useCallback(async (): Promise<DeleteAccountResult> => {
    if (!user?.id) {
      return { ok: false, error: "No signed-in account to delete." };
    }
    try {
      await api.post("/api/user/delete", { confirm: "DELETE" });
    } catch (err) {
      const status = (err as { status?: number }).status;
      const message =
        (err as { message?: string }).message ??
        "We couldn't delete your account — please try again.";
      if (status === 429) {
        return {
          ok: false,
          status,
          error:
            "Too many deletion requests today. Please try again tomorrow or contact support.",
        };
      }
      if (status === 401) {
        return {
          ok: false,
          status,
          error:
            "Your session expired. Please sign out and back in, then try again.",
        };
      }
      return { ok: false, status, error: message };
    }
    await clearSession();
    setUser(null, "deleteAccount");
    return { ok: true };
  }, [user?.id, setUser]);

  // Direct setter for the post-OAuth flow — see the AuthState comment
  // above. Stable identity via useCallback so the provider value
  // doesn't churn every render and break consumers' useEffect deps.
  // When a token is supplied (sign-in path), write it through to the
  // synchronous tokenBridge so api.ts can attach the bearer on the
  // very next request without going through SecureStore or relying
  // on lib/auth's memoryToken closure (Layer 4 fix — see
  // lib/token-bridge.ts for the full rationale).
  const setAuthenticatedUser = useCallback(
    (next: User, token?: string) => {
      debugLog("setAuthenticatedUser.entry", {
        userId: next.id,
        hasToken: Boolean(token),
        tokenLen: token?.length ?? 0,
      });
      if (token) tokenBridge.set(token);
      setUser(next, "setAuthenticatedUser");
      setLoading(false);
    },
    [setUser]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signOut,
        refresh,
        setAuthenticatedUser,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
