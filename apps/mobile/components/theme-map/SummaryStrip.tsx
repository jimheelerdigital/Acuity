import { Text, View } from "react-native";

/**
 * Three-column summary card. Mirrors the web component pixel-for-pixel
 * per the spec: values 22/700/-0.4, labels 10/uppercase/0.8px.
 */
export function SummaryStrip({
  themeCount,
  mentionCount,
  topTheme,
}: {
  themeCount: number;
  mentionCount: number;
  topTheme: string | null;
}) {
  return (
    <View
      style={{
        marginHorizontal: 20,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "#1E1E2E",
      }}
      className="dark:bg-[#1E1E2E] bg-white border-zinc-200 dark:border-white/10"
    >
      <View style={{ flexDirection: "row" }}>
        <Cell value={String(themeCount)} label="Themes" />
        <Divider />
        <Cell value={String(mentionCount)} label="Mentions" />
        <Divider />
        <Cell
          value={topTheme ?? "—"}
          label="Top theme"
          small={Boolean(topTheme && topTheme.length > 8)}
        />
      </View>
    </View>
  );
}

function Cell({
  value,
  label,
  small,
}: {
  value: string;
  label: string;
  small?: boolean;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 4 }}>
      <Text
        style={{
          fontSize: small ? 16 : 22,
          fontWeight: "700",
          letterSpacing: -0.4,
          textAlign: "center",
        }}
        className="text-zinc-900 dark:text-zinc-50"
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 10,
          letterSpacing: 0.8,
          marginTop: 4,
          textTransform: "uppercase",
        }}
        className="text-zinc-400 dark:text-zinc-500"
      >
        {label}
      </Text>
    </View>
  );
}

function Divider() {
  return (
    <View
      style={{
        width: 1,
        marginVertical: 2,
      }}
      className="bg-zinc-200 dark:bg-white/10"
    />
  );
}
