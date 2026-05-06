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
   */
  setAuthenticatedUser: (user: User) => void;
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);

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
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }

      try {
        const data = await api.get<{ user?: User }>("/api/user/me");
        if (data.user?.id) {
          setUser(data.user);
          await setStoredUser(data.user);
          return;
        }
        // 200 with no user — treat as signed-out. Server has
        // explicitly told us the user no longer exists; clearing
        // local state is the right call here.
        setUser(null);
        await clearSession();
      } catch (err) {
        const status = (err as { status?: number }).status;
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
          setUser(null);
          return;
        }
        // Network or transient error — keep the cached user so the
        // app stays usable until the next refresh tick.
        const stored = await getStoredUser();
        setUser(stored);
      }
    } finally {
      setLoading(false);
    }
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
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const signOut = useCallback(async () => {
    // No server call — mobile sign-out is local-only (see lib/auth.ts
    // signOut() for rationale).
    await clearSession();
    setUser(null);
  }, []);

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
    setUser(null);
    return { ok: true };
  }, [user?.id]);

  // Direct setter for the post-OAuth flow — see the AuthState comment
  // above. Stable identity via useCallback so the provider value
  // doesn't churn every render and break consumers' useEffect deps.
  const setAuthenticatedUser = useCallback((next: User) => {
    setUser(next);
    setLoading(false);
  }, []);

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
