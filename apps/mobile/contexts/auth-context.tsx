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

type AuthState = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
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
        // 200 with no user — treat as signed-out
        setUser(null);
        await clearSession();
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401) {
          // Server rejected our bearer token; boot the user.
          await clearSession();
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

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
