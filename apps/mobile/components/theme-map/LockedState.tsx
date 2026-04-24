import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  RadialGradient,
  Stop,
} from "react-native-svg";

/**
 * Locked landing — shown while the user has fewer than 10 entries.
 * Blurred teaser + progress bar + record CTA. No animation on the
 * progress bar on mobile (matches the static-first posture).
 */
export function LockedState({ count }: { count: number }) {
  const router = useRouter();
  const remaining = Math.max(0, 10 - count);
  const pct = Math.min(100, (count / 10) * 100);

  return (
    <View
      style={{
        alignItems: "center",
        paddingTop: 60,
        paddingHorizontal: 24,
        paddingBottom: 40,
      }}
    >
      {/* Teaser */}
      <View
        style={{
          width: 200,
          height: 200,
          marginBottom: 24,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Svg width={200} height={200} viewBox="0 0 200 200">
          <Defs>
            <RadialGradient id="lock-halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="rgba(124,58,237,0.35)" />
              <Stop offset="100%" stopColor="rgba(124,58,237,0)" />
            </RadialGradient>
          </Defs>
          <Circle cx={100} cy={100} r={80} fill="url(#lock-halo)" />
          <Circle cx={100} cy={100} r={26} fill="#7C3AED" opacity={0.55} />
          <Circle cx={40} cy={40} r={8} fill="#34D399" opacity={0.35} />
          <Circle cx={160} cy={40} r={8} fill="#F87171" opacity={0.35} />
          <Circle cx={40} cy={160} r={7} fill="#94a3b8" opacity={0.35} />
          <Circle cx={160} cy={160} r={7} fill="#94a3b8" opacity={0.35} />
          <Line x1={100} y1={100} x2={40} y2={40} stroke="#7C3AED" strokeOpacity={0.2} strokeWidth={1} />
          <Line x1={100} y1={100} x2={160} y2={40} stroke="#7C3AED" strokeOpacity={0.2} strokeWidth={1} />
          <Line x1={100} y1={100} x2={40} y2={160} stroke="#7C3AED" strokeOpacity={0.2} strokeWidth={1} />
          <Line x1={100} y1={100} x2={160} y2={160} stroke="#7C3AED" strokeOpacity={0.2} strokeWidth={1} />
        </Svg>
        {/* Lock icon overlay */}
        <View
          style={{
            position: "absolute",
            width: 64,
            height: 64,
            borderRadius: 32,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "#1E1E2E",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.4,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 10 },
            elevation: 10,
          }}
        >
          <Text style={{ fontSize: 28 }}>🔒</Text>
        </View>
      </View>

      <Text
        style={{
          fontSize: 24,
          fontWeight: "700",
          letterSpacing: -0.4,
          marginBottom: 8,
        }}
        className="text-zinc-900 dark:text-zinc-50"
      >
        Unlock your Theme Map
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 22,
          maxWidth: 300,
          textAlign: "center",
          marginBottom: 24,
        }}
        className="text-zinc-500 dark:text-zinc-400"
      >
        Record {remaining} more session{remaining === 1 ? "" : "s"} and
        Acuity will surface the patterns hiding in your words.
      </Text>

      {/* Progress card */}
      <View
        style={{
          width: "100%",
          maxWidth: 320,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          padding: 20,
          marginBottom: 24,
        }}
        className="bg-white dark:bg-[#1E1E2E]"
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Text
            style={{ fontSize: 28, fontWeight: "700", lineHeight: 30 }}
            className="text-zinc-900 dark:text-zinc-50"
          >
            {count}
          </Text>
          <Text
            style={{ fontSize: 14 }}
            className="text-zinc-400 dark:text-zinc-500"
          >
            of 10 entries
          </Text>
        </View>
        <View
          style={{
            height: 8,
            borderRadius: 4,
            overflow: "hidden",
          }}
          className="bg-zinc-100 dark:bg-white/10"
        >
          <View
            style={{
              width: `${pct}%`,
              height: "100%",
              backgroundColor: "#7C3AED",
              shadowColor: "#7C3AED",
              shadowOpacity: 0.5,
              shadowRadius: 6,
            }}
          />
        </View>
        <Text
          style={{ fontSize: 12, marginTop: 12 }}
          className="text-zinc-400 dark:text-zinc-500"
        >
          {remaining} more to unlock
        </Text>
      </View>

      <Pressable
        onPress={() => router.push("/record")}
        style={{
          paddingVertical: 14,
          paddingHorizontal: 28,
          borderRadius: 14,
          backgroundColor: "#7C3AED",
          shadowColor: "#7C3AED",
          shadowOpacity: 0.4,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        <Text
          style={{ fontSize: 15, fontWeight: "600", color: "#FFFFFF" }}
        >
          Record now
        </Text>
      </Pressable>
    </View>
  );
}
