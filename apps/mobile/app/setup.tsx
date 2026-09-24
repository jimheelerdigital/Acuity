import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import { useTheme } from "@/contexts/theme-context";
import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Set up Ripple everywhere — the "make a debrief a reflex" hub.
 *
 * The Action Button and Siri phrases can only be assigned in Apple's own
 * Settings/Shortcuts (no app API sets them, and there's no sanctioned deep
 * link to the Action Button pane), so those cards are guided steps. Mic and
 * Notifications DO live on the app's own Settings page, so those get a real
 * one-tap jump via `app-settings:` (Apple-sanctioned).
 */
export default function SetupScreen() {
  const { tokens } = useTheme();
  const router = useRouter();

  const openAppSettings = () => {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:").catch(() => {});
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }} edges={["top"]}>
      <StickyBackButton onPress={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 56, paddingBottom: 48 }}>
        <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 26, color: tokens.text, marginBottom: 6 }}>
          Set up Ripple everywhere
        </Text>
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, lineHeight: 22, color: tokens.textSec, marginBottom: 24 }}>
          A debrief works best when it's one tap — or one phrase — away. A few
          quick ways to reach Ripple without opening the app.
        </Text>

        {/* Action Button */}
        <Card tokens={tokens} icon="ellipse-outline" title="Action Button">
          <Text style={cardBody(tokens)}>
            On iPhone 15 Pro and later, set the side Action Button to start a
            debrief instantly. Apple only lets you assign it in Settings:
          </Text>
          <Step tokens={tokens} n={1} text="Open the Settings app → Action Button." />
          <Step tokens={tokens} n={2} text="Swipe to the Shortcut option." />
          <Step tokens={tokens} n={3} text="Tap Choose a Shortcut → search Ripple → Start a Debrief." />
          <Text style={cardNote(tokens)}>
            Apple doesn't allow apps to jump straight to this screen — but once
            it's set, one press opens Ripple ready to record.
          </Text>
        </Card>

        {/* Siri */}
        <Card tokens={tokens} icon="mic-circle-outline" title="Siri">
          <Text style={cardBody(tokens)}>
            No setup needed — just say it:
          </Text>
          <Step tokens={tokens} n={1} text={'"Hey Siri, start a debrief in Ripple."'} />
          <Step tokens={tokens} n={2} text={'Or "Check my habits in Ripple" and "Ask Ripple."'} />
          <Text style={cardNote(tokens)}>
            These also show up in Spotlight search and the Shortcuts app, so you
            can build your own automations around them.
          </Text>
        </Card>

        {/* Widgets */}
        <Card tokens={tokens} icon="apps-outline" title="Widgets">
          <Text style={cardBody(tokens)}>
            Keep your streak and today's habits in view — tap to record.
          </Text>
          <Step tokens={tokens} n={1} text="Home screen: long-press an empty area → + (top-left) → search Ripple." />
          <Step tokens={tokens} n={2} text="Lock screen: long-press the lock screen → Customize → tap the area under the clock → add Ripple." />
        </Card>

        {/* Permissions — these DO deep-link to Ripple's own Settings page */}
        <Card tokens={tokens} icon="options-outline" title="Permissions">
          <Text style={cardBody(tokens)}>
            Recording needs the microphone; reminders need notifications. Both
            live on Ripple's Settings page:
          </Text>
          <SettingsButton tokens={tokens} label="Open Ripple's iOS Settings" onPress={openAppSettings} />
          <Text style={cardNote(tokens)}>
            Opens straight to Ripple in Settings — toggle Microphone and
            Notifications there.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Presentational helpers ───────────────────────────────────────────

function cardBody(tokens: AcuityTokens) {
  return {
    fontFamily: tokens.fontSans,
    fontSize: 14,
    lineHeight: 21,
    color: tokens.textSec,
    marginBottom: 12,
  } as const;
}

function cardNote(tokens: AcuityTokens) {
  return {
    fontFamily: tokens.fontSans,
    fontSize: 12.5,
    lineHeight: 19,
    color: tokens.textTer,
    marginTop: 10,
  } as const;
}

function Card({
  tokens,
  icon,
  title,
  children,
}: {
  tokens: AcuityTokens;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: tokens.line,
        borderRadius: 16,
        backgroundColor: tokens.cardBg,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Ionicons name={icon} size={20} color={tokens.primary} />
        <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 17, color: tokens.text }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function Step({ tokens, n, text }: { tokens: AcuityTokens; n: number; text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: tokens.bgInset,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 11, fontWeight: "700", color: tokens.textSec }}>
          {n}
        </Text>
      </View>
      <Text style={{ flex: 1, fontFamily: tokens.fontSans, fontSize: 14, lineHeight: 21, color: tokens.text }}>
        {text}
      </Text>
    </View>
  );
}

function SettingsButton({
  tokens,
  label,
  onPress,
}: {
  tokens: AcuityTokens;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginTop: 4,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: tokens.primary,
      }}
    >
      <Ionicons name="settings-outline" size={16} color="#FFFFFF" />
      <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 15, color: "#FFFFFF" }}>
        {label}
      </Text>
    </Pressable>
  );
}
