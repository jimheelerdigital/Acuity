import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth-context";
import { useTheme, type ThemeChoice } from "@/contexts/theme-context";

export default function ProfileTab() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          await signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  };

  const name = user?.name ?? "Acuity User";
  const email = user?.email ?? "—";
  const subStatus = user?.subscriptionStatus ?? "FREE";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12]" edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View className="mb-2">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Profile</Text>
          <Text className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
            Account &amp; settings
          </Text>
        </View>

        {/* Avatar */}
        <View className="items-center mt-6 mb-8">
          {user?.image ? (
            <View className="h-20 w-20 rounded-full overflow-hidden border border-violet-600/40">
              {/* RN Image would go here; using initials as fallback */}
              <View className="h-20 w-20 bg-violet-600/20 items-center justify-center">
                <Text className="text-2xl font-bold text-violet-400">
                  {initials}
                </Text>
              </View>
            </View>
          ) : (
            <View className="h-20 w-20 rounded-full bg-violet-600/20 items-center justify-center border border-violet-600/40">
              <Text className="text-2xl font-bold text-violet-400">
                {initials}
              </Text>
            </View>
          )}
          <Text className="text-zinc-800 dark:text-zinc-100 font-semibold text-lg mt-3">
            {name}
          </Text>
          <Text className="text-zinc-500 dark:text-zinc-400 text-sm">{email}</Text>

          {/* Subscription badge */}
          <View
            className={`mt-3 rounded-full px-3 py-1 ${
              subStatus === "PRO"
                ? "bg-violet-600/20"
                : "bg-zinc-800"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                subStatus === "PRO"
                  ? "text-violet-400"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {subStatus === "PRO" ? "Pro" : "Free Plan"}
            </Text>
          </View>
        </View>

        {/* Menu */}
        <View className="gap-2">
          {subStatus !== "PRO" && (
            // Copy deliberately avoids "Upgrade" / "Subscribe" / "$"
            // per docs/APPLE_IAP_DECISION.md (Option C / App Store
            // Review Guideline 3.1.1). Opens Safari (external
            // browser), never an in-app WebView. The foreground-
            // refresh hook in auth-context picks up the new
            // subscriptionStatus when the user returns.
            <MenuItem
              icon="globe-outline"
              label="Manage plan on web"
              sublabel="Opens your account in a browser"
              onPress={() => {
                const url = `${process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000"}/upgrade?src=mobile_profile`;
                import("expo-linking").then((Linking) =>
                  Linking.openURL(url)
                );
              }}
            />
          )}

          <ThemeMenuItem />

          <MenuItem
            icon="time-outline"
            label="Reminders"
            sublabel="When to nudge you to journal"
            onPress={() => router.push("/reminders")}
          />

          <MenuItem
            icon="log-out-outline"
            label={signingOut ? "Signing out..." : "Sign out"}
            destructive
            onPress={handleSignOut}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({
  icon,
  label,
  sublabel,
  destructive = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  sublabel?: string;
  destructive?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] dark:bg-[#1E1E2E] px-4 py-3.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Ionicons
        name={icon}
        size={20}
        color={destructive ? "#EF4444" : "#71717A"}
      />
      <View className="flex-1">
        <Text
          className={`text-sm ${
            destructive ? "text-red-400" : "text-zinc-700 dark:text-zinc-200"
          }`}
        >
          {label}
        </Text>
        {sublabel && (
          <Text className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">{sublabel}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#52525B" />
    </Pressable>
  );
}

/**
 * Three-state theme segmented control embedded into the profile menu.
 * Mirrors the web /account Appearance section. Persistence is handled
 * by ThemeProvider — picking an option fires a fire-and-forget POST to
 * /api/user/theme so the choice follows the user across devices.
 */
function ThemeMenuItem() {
  const { preference, setPreference } = useTheme();
  const options: { value: ThemeChoice; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];
  return (
    <View className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 dark:border-white/10 dark:bg-[#1E1E2E]">
      <View className="flex-row items-center gap-3 mb-3">
        <Ionicons name="contrast-outline" size={20} color="#71717A" />
        <View className="flex-1">
          <Text className="text-sm text-zinc-200 dark:text-zinc-200">
            Appearance
          </Text>
          <Text className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 dark:text-zinc-500">
            Light, dark, or follow your system
          </Text>
        </View>
      </View>
      <View className="flex-row rounded-full bg-zinc-800 p-0.5 dark:bg-white/10">
        {options.map((opt) => {
          const selected = preference === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setPreference(opt.value)}
              className={`flex-1 items-center justify-center rounded-full px-3 py-2 ${
                selected ? "bg-zinc-700 dark:bg-white/20" : ""
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  selected
                    ? "text-zinc-800 dark:text-zinc-100"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
