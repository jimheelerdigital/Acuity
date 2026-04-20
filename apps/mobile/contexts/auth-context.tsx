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

import {
  getStoredUser,
  setStoredUser,
  signOut as clearSession,
  type User,
} from "@/lib/auth";
import { api } from "@/lib/api";

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

  const refresh = useCallback(async () => {
    try {
      // Prefer the dedicated user-state endpoint. Falls back to
      // NextAuth's /api/auth/session if /api/user/me is missing
      // (older server deploy) or returns 401 (stale JWT).
      try {
        const data = await api.get<{ user?: User }>("/api/user/me");
        if (data.user?.id) {
          setUser(data.user);
          await setStoredUser(data.user);
          return;
        }
      } catch {
        // fall through to session fallback
      }

      const data = await api.get<{ user?: User }>("/api/auth/session");
      if (data.user?.id) {
        setUser(data.user);
        await setStoredUser(data.user);
      } else {
        const stored = await getStoredUser();
        setUser(stored);
      }
    } catch {
      const stored = await getStoredUser();
      setUser(stored);
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
    try {
      await api.post("/api/auth/signout", {});
    } catch {
      // Ignore signout API errors
    }
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
