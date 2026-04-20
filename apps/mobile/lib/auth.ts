import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "acuity_session_token";
const USER_KEY = "acuity_user";

export type User = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  subscriptionStatus?: string;
  // ISO-8601 string — matches what /api/user/me returns. Null for
  // freshly-created users before the createUser event writes it,
  // or for users who existed before the 2026-04-20 backfill.
  trialEndsAt?: string | null;
};

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: User): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearStoredUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function signOut(): Promise<void> {
  await clearToken();
  await clearStoredUser();
}
