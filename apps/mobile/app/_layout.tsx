import "../global.css";

import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/contexts/auth-context";

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === "(auth)";

    if (!user && !inAuth) {
      router.replace("/(auth)/sign-in");
    } else if (user && inAuth) {
      router.replace("/(tabs)");
    }
  }, [user, loading, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <AuthGate />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen
            name="entry/[id]"
            options={{
              headerShown: true,
              headerStyle: { backgroundColor: "#09090B" },
              headerTintColor: "#FAFAFA",
              headerTitleStyle: { fontWeight: "600" },
              title: "Entry",
            }}
          />
          <Stack.Screen
            name="record"
            options={{
              headerShown: true,
              headerStyle: { backgroundColor: "#09090B" },
              headerTintColor: "#FAFAFA",
              headerTitleStyle: { fontWeight: "600" },
              title: "Brain dump",
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="paywall"
            options={{
              headerShown: false,
              presentation: "modal",
            }}
          />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
