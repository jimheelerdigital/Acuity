import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#09090B" },
          headerTintColor: "#FAFAFA",
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: "#09090B" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Acuity" }} />
        <Stack.Screen name="record" options={{ title: "Brain dump" }} />
        <Stack.Screen name="entry/[id]" options={{ title: "Entry" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
