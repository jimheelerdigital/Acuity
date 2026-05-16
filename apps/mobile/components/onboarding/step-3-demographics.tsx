import { useEffect, useState } from "react";
import {
  NativeModules,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOnboarding } from "./context";

/**
 * Step 3 — Demographics, split into TWO screens (2026-05-15 Slice G2
 * density restructure). The single 5-section screen was the heaviest
 * by 4x (401 LOC, 11 Text, 3 selectors) and was the most-cited
 * "overwhelming" surface in user testing. Split:
 *
 *   - Step3AboutYou   → Age + Gender + Country (factual demographics)
 *   - Step3Context    → Primary reasons + Life stage (intent/context)
 *
 * Each step persists its OWN subset of the demographics payload via
 * setCapturedData. The shell's persist() flow posts each step's data
 * independently to /api/onboarding/update, which cherry-picks fields
 * into userUpdates — so server contract is unchanged. No backfill
 * required for users mid-onboarding when this ships; their existing
 * captured data on step 3 just maps to the AboutYou half (the new
 * step 3) and they'll see step 4 (Context) on next mount.
 *
 * Shared chip/section helpers stay in this file so both halves render
 * consistently. Country picker stays inline with AboutYou — its
 * footprint is collapsed by default.
 */

const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55+"] as const;
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"] as const;
const REASONS = [
  "Stress / overwhelm",
  "Career direction",
  "Relationships",
  "Self-awareness",
  "Sleep / mental health",
  "Other",
] as const;

const LIFE_STAGES = [
  "Single / no kids",
  "Partnered / no kids",
  "Parenting young kids",
  "Parenting teens / adult kids",
  "In transition",
  "Prefer not to say",
] as const;

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "JP", name: "Japan" },
  { code: "SG", name: "Singapore" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "ZA", name: "South Africa" },
];

function detectRegion(): string | null {
  if (Platform.OS !== "ios") return null;
  try {
    const settings = NativeModules.SettingsManager?.settings;
    const locale: string | undefined =
      settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
    if (!locale) return null;
    const match = locale.match(/_([A-Z]{2})/);
    const region = match?.[1];
    if (!region) return null;
    return COUNTRIES.some((c) => c.code === region) ? region : null;
  } catch {
    return null;
  }
}

// ─── Step 3a: About you ──────────────────────────────────────

export function Step3AboutYou() {
  const { step, setCanContinue, setCapturedData, getCapturedData } =
    useOnboarding();

  const prior = getCapturedData(step) as
    | {
        ageRange?: string | null;
        gender?: string | null;
        country?: string | null;
      }
    | null;

  const [ageRange, setAgeRange] = useState<string | null>(
    () => prior?.ageRange ?? null
  );
  const [gender, setGender] = useState<string | null>(
    () => prior?.gender ?? null
  );
  const [country, setCountry] = useState<string | null>(
    () => prior?.country ?? detectRegion()
  );
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  useEffect(() => {
    setCanContinue(true);
    setCapturedData({ ageRange, gender, country });
  }, [ageRange, gender, country, setCanContinue, setCapturedData]);

  const selectedCountryName =
    COUNTRIES.find((c) => c.code === country)?.name ?? "Prefer not to say";

  return (
    <View className="flex-1">
      <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        About you
      </Text>
      <Text className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Three quick details so Acuity can tailor insights to people
        like you. Skip anything you&rsquo;d rather not share.
      </Text>

      <Section label="Age range">
        {AGE_RANGES.map((a) => (
          <Chip
            key={a}
            active={ageRange === a}
            onPress={() => setAgeRange(ageRange === a ? null : a)}
            label={a}
          />
        ))}
      </Section>

      <Section label="Gender">
        {GENDERS.map((g) => (
          <Chip
            key={g}
            active={gender === g}
            onPress={() => setGender(gender === g ? null : g)}
            label={g}
          />
        ))}
      </Section>

      <Section label="Country">
        <Pressable
          onPress={() => setCountryPickerOpen((v) => !v)}
          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 flex-row items-center justify-between"
        >
          <Text className="text-sm text-zinc-900 dark:text-zinc-100">
            {selectedCountryName}
          </Text>
          <Text className="text-xs text-zinc-400 dark:text-zinc-500">
            {countryPickerOpen ? "Close" : "Change"}
          </Text>
        </Pressable>
        {countryPickerOpen && (
          <View className="mt-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] max-h-60">
            <View className="p-1">
              <CountryRow
                code={null}
                name="Prefer not to say"
                active={country === null}
                onPress={() => {
                  setCountry(null);
                  setCountryPickerOpen(false);
                }}
              />
              {COUNTRIES.map((c) => (
                <CountryRow
                  key={c.code}
                  code={c.code}
                  name={c.name}
                  active={country === c.code}
                  onPress={() => {
                    setCountry(c.code);
                    setCountryPickerOpen(false);
                  }}
                />
              ))}
            </View>
          </View>
        )}
      </Section>
    </View>
  );
}

// ─── Step 3b: What brings you here ────────────────────────────

export function Step3Context() {
  const { step, setCanContinue, setCapturedData, getCapturedData } =
    useOnboarding();

  const prior = getCapturedData(step) as
    | {
        primaryReasons?: string[];
        primaryReasonsCustom?: string | null;
        lifeStages?: string[];
        lifeStageCustom?: string | null;
      }
    | null;

  const [primaryReasons, setPrimaryReasons] = useState<string[]>(
    () => prior?.primaryReasons ?? []
  );
  const [primaryReasonsCustom, setPrimaryReasonsCustom] = useState(
    () => prior?.primaryReasonsCustom ?? ""
  );
  const [lifeStages, setLifeStages] = useState<string[]>(
    () => prior?.lifeStages ?? []
  );
  const [lifeStageCustom, setLifeStageCustom] = useState(
    () => prior?.lifeStageCustom ?? ""
  );

  const showReasonsCustom = primaryReasons.includes("Other");
  const showLifeStageCustom = lifeStages.includes("In transition");

  useEffect(() => {
    setCanContinue(true);
    setCapturedData({
      primaryReasons,
      primaryReasonsCustom: showReasonsCustom
        ? primaryReasonsCustom.trim() || null
        : null,
      lifeStages,
      lifeStageCustom: showLifeStageCustom
        ? lifeStageCustom.trim() || null
        : null,
    });
  }, [
    primaryReasons,
    primaryReasonsCustom,
    lifeStages,
    lifeStageCustom,
    showReasonsCustom,
    showLifeStageCustom,
    setCanContinue,
    setCapturedData,
  ]);

  const toggleReason = (r: string) =>
    setPrimaryReasons((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );

  const toggleLifeStage = (s: string) =>
    setLifeStages((prev) => {
      if (s === "Prefer not to say") {
        return prev.includes(s) ? [] : [s];
      }
      const without = prev.filter((x) => x !== "Prefer not to say");
      return without.includes(s)
        ? without.filter((x) => x !== s)
        : [...without, s];
    });

  return (
    <View className="flex-1">
      <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        What brings you here?
      </Text>
      <Text className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Two more, just to know what kind of weeks Acuity should help
        you make sense of.
      </Text>

      <Section label="Why Acuity?" sub="Pick any that fit.">
        {REASONS.map((r) => (
          <Chip
            key={r}
            active={primaryReasons.includes(r)}
            onPress={() => toggleReason(r)}
            label={r}
          />
        ))}
      </Section>
      {showReasonsCustom && (
        <TextInput
          value={primaryReasonsCustom}
          onChangeText={setPrimaryReasonsCustom}
          maxLength={200}
          placeholder="Tell Acuity more — what brings you here?"
          placeholderTextColor="#71717A"
          className="mt-3 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100"
          accessibilityLabel="What brings you here (freeform)"
        />
      )}

      <Section label="Life stage" sub="Pick any that fit.">
        {LIFE_STAGES.map((s) => (
          <Chip
            key={s}
            active={lifeStages.includes(s)}
            onPress={() => toggleLifeStage(s)}
            label={s}
          />
        ))}
      </Section>
      {showLifeStageCustom && (
        <TextInput
          value={lifeStageCustom}
          onChangeText={setLifeStageCustom}
          maxLength={200}
          placeholder="What's shifting? (layoff, caregiving, sabbatical…)"
          placeholderTextColor="#71717A"
          className="mt-3 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100"
          accessibilityLabel="Life stage (freeform)"
        />
      )}
    </View>
  );
}

// ─── Shared helpers ───────────────────────────────────────────

function Section({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-6">
      <Text className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-1">
        {label}
      </Text>
      {sub && (
        <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">
          {sub}
        </Text>
      )}
      <View className="flex-row flex-wrap gap-2 mt-2">{children}</View>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`rounded-full border px-3 py-1.5 ${
        active
          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
          : "border-zinc-200 dark:border-white/10 bg-transparent"
      }`}
    >
      <Text
        className={`text-sm ${
          active
            ? "text-violet-700 dark:text-violet-300 font-semibold"
            : "text-zinc-600 dark:text-zinc-300"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CountryRow({
  code,
  name,
  active,
  onPress,
}: {
  code: string | null;
  name: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-lg px-3 py-2.5 ${
        active ? "bg-violet-50 dark:bg-violet-950/30" : ""
      }`}
    >
      <Text
        className={`text-sm ${
          active
            ? "text-violet-700 dark:text-violet-300 font-semibold"
            : "text-zinc-700 dark:text-zinc-200"
        }`}
      >
        {name}
        {code && (
          <Text className="text-xs text-zinc-400 dark:text-zinc-500"> · {code}</Text>
        )}
      </Text>
    </Pressable>
  );
}
