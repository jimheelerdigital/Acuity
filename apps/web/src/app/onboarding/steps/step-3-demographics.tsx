"use client";

import { useEffect, useState } from "react";

import { useOnboarding } from "../onboarding-context";

/**
 * Step 3 — Demographics. Five optional questions. None gated.
 *
 * Copy ("This helps us tailor insights to people like you. Skip
 * anything you'd rather not share.") sets a non-extractive tone up
 * front — the user knows why we're asking and that opting out is
 * normal. Continue is always enabled; a user can tap it with every
 * field blank and move on.
 *
 * Country: we try to set a sensible default from the browser's
 * Intl.Locale (region subtag) when no value is picked yet — saves a
 * click for the US/UK/CA/AU majority. The user can always change it.
 * No IP geolocation — avoids a server round-trip and the privacy
 * ambiguity that a client-side geo library adds.
 */

const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55+"] as const;
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"] as const;
const REASONS = [
  "Career",
  "Relationships",
  "Mental health",
  "Productivity",
  "Curiosity",
  "Other",
] as const;
const LIFE_STAGES = [
  "Student",
  "Early career",
  "Established career",
  "Parent",
  "Retired",
  "In transition",
  "Prefer not to say",
] as const;

// Short subset — the full list ships in a follow-up. Covers the top
// signup geos without a 249-item dropdown.
const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "IN", name: "India" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "IE", name: "Ireland" },
  { code: "NZ", name: "New Zealand" },
  { code: "SG", name: "Singapore" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "ZA", name: "South Africa" },
  { code: "OTHER", name: "Somewhere else" },
];

function detectCountry(): string | null {
  try {
    const locale = new Intl.Locale(navigator.language);
    const region = (locale as { region?: string }).region;
    if (!region) return null;
    return COUNTRIES.some((c) => c.code === region) ? region : null;
  } catch {
    return null;
  }
}

export function Step3Demographics() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [primaryReasons, setPrimaryReasons] = useState<string[]>([]);
  const [lifeStage, setLifeStage] = useState<string | null>(null);

  // Seed country from the browser's locale once on mount.
  useEffect(() => {
    const d = detectCountry();
    if (d) setCountry(d);
  }, []);

  useEffect(() => {
    // Every field is optional — step is always continuable.
    setCanContinue(true);
    setCapturedData({
      ageRange,
      gender,
      country,
      primaryReasons,
      lifeStage,
    });
  }, [ageRange, gender, country, primaryReasons, lifeStage, setCanContinue, setCapturedData]);

  const toggleReason = (r: string) => {
    setPrimaryReasons((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  };

  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        A few quick things
      </h1>
      <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        This helps us tailor insights to people like you. Skip anything
        you&rsquo;d rather not share.
      </p>

      {/* Age */}
      <section className="mt-8">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-3">
          Age range
        </p>
        <div className="flex flex-wrap gap-2">
          {AGE_RANGES.map((a) => (
            <Chip
              key={a}
              active={ageRange === a}
              onClick={() => setAgeRange(ageRange === a ? null : a)}
            >
              {a}
            </Chip>
          ))}
        </div>
      </section>

      {/* Gender */}
      <section className="mt-6">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-3">
          Gender
        </p>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <Chip
              key={g}
              active={gender === g}
              onClick={() => setGender(gender === g ? null : g)}
            >
              {g}
            </Chip>
          ))}
        </div>
      </section>

      {/* Country */}
      <section className="mt-6">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-3">
          Country
        </p>
        <select
          value={country ?? ""}
          onChange={(e) => setCountry(e.target.value || null)}
          className="w-full max-w-xs rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500"
        >
          <option value="">Prefer not to say</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </section>

      {/* Primary reasons */}
      <section className="mt-6">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-1">
          What brings you here?
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">
          Pick any that fit.
        </p>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <Chip
              key={r}
              active={primaryReasons.includes(r)}
              onClick={() => toggleReason(r)}
            >
              {r}
            </Chip>
          ))}
        </div>
      </section>

      {/* Life stage */}
      <section className="mt-6">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-3">
          Life stage
        </p>
        <div className="flex flex-wrap gap-2">
          {LIFE_STAGES.map((s) => (
            <Chip
              key={s}
              active={lifeStage === s}
              onClick={() => setLifeStage(lifeStage === s ? null : s)}
            >
              {s}
            </Chip>
          ))}
        </div>
      </section>
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-500"
          : "border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20"
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
