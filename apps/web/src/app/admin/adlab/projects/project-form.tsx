"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Upload, Loader2, Search, Eye, Volume2, VolumeX, User } from "lucide-react";

interface TargetAudience {
  ageMin: number;
  ageMax: number;
  geo: string[];
  interests: string[];
  painPoints: string[];
  desires: string[];
  identityMarkers: string[];
}

interface VideoAvatar {
  id: string;
  voiceId: string;
  name: string;
  gender: string;
  previewUrl?: string | null;
}

interface ProjectFormData {
  name: string;
  slug: string;
  brandVoiceGuide: string;
  targetAudience: TargetAudience;
  usps: string[];
  bannedPhrases: string[];
  imageStylePrompt: string;
  logoUrl: string;
  targetCplCents: number;
  dailyBudgetCentsPerVariant: number;
  testDurationDays: number;
  metaAdAccountId: string;
  metaPixelId: string;
  metaPageId: string;
  conversionEvent: string;
  conversionObjective: string;
  landingPageUrl: string;
  targetInterests: { id: string; name: string }[];
  imageEnabled: boolean;
  videoEnabled: boolean;
  videoAvatars: VideoAvatar[];
  videoPrimaryAvatar: VideoAvatar | null;
  videoSecondaryAvatar: VideoAvatar | null;
}

interface ProjectFormProps {
  initialData?: Partial<ProjectFormData>;
  projectId?: string;
  mode: "create" | "edit";
}

const DEFAULT_DATA: ProjectFormData = {
  name: "",
  slug: "",
  brandVoiceGuide: "",
  targetAudience: {
    ageMin: 25,
    ageMax: 55,
    geo: [],
    interests: [],
    painPoints: [],
    desires: [],
    identityMarkers: [],
  },
  usps: [""],
  bannedPhrases: [],
  imageStylePrompt: "",
  logoUrl: "",
  targetCplCents: 0,
  dailyBudgetCentsPerVariant: 0,
  testDurationDays: 14,
  metaAdAccountId: "",
  metaPixelId: "",
  metaPageId: "",
  conversionEvent: "",
  conversionObjective: "OUTCOME_LEADS",
  landingPageUrl: "",
  targetInterests: [],
  imageEnabled: true,
  videoEnabled: false,
  videoAvatars: [],
  videoPrimaryAvatar: null,
  videoSecondaryAvatar: null,
};

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ProjectForm({ initialData, projectId, mode }: ProjectFormProps) {
  const router = useRouter();
  const [data, setData] = useState<ProjectFormData>({
    ...DEFAULT_DATA,
    ...initialData,
    targetAudience: (() => {
      const base = DEFAULT_DATA.targetAudience;
      const init = (initialData?.targetAudience ?? {}) as Partial<TargetAudience>;
      return {
        ageMin: init.ageMin ?? base.ageMin,
        ageMax: init.ageMax ?? base.ageMax,
        geo: init.geo ?? base.geo,
        interests: init.interests ?? base.interests,
        painPoints: init.painPoints ?? base.painPoints,
        desires: init.desires ?? base.desires,
        identityMarkers: init.identityMarkers ?? base.identityMarkers,
      };
    })(),
    usps: initialData?.usps?.length ? initialData.usps : [""],
    targetInterests: initialData?.targetInterests ?? DEFAULT_DATA.targetInterests,
    metaPageId: initialData?.metaPageId ?? DEFAULT_DATA.metaPageId,
    bannedPhrases: initialData?.bannedPhrases ?? DEFAULT_DATA.bannedPhrases,
    logoUrl: initialData?.logoUrl ?? DEFAULT_DATA.logoUrl,
    landingPageUrl: initialData?.landingPageUrl ?? DEFAULT_DATA.landingPageUrl,
    conversionEvent: initialData?.conversionEvent ?? DEFAULT_DATA.conversionEvent,
    metaAdAccountId: initialData?.metaAdAccountId ?? DEFAULT_DATA.metaAdAccountId,
    metaPixelId: initialData?.metaPixelId ?? DEFAULT_DATA.metaPixelId,
    videoAvatars: (initialData?.videoAvatars as VideoAvatar[] | undefined) ?? DEFAULT_DATA.videoAvatars,
    videoPrimaryAvatar: (initialData?.videoPrimaryAvatar as VideoAvatar | null | undefined) ?? DEFAULT_DATA.videoPrimaryAvatar,
    videoSecondaryAvatar: (initialData?.videoSecondaryAvatar as VideoAvatar | null | undefined) ?? DEFAULT_DATA.videoSecondaryAvatar,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});

  function updateField<K extends keyof ProjectFormData>(key: K, value: ProjectFormData[K]) {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function updateAudience<K extends keyof TargetAudience>(key: K, value: TargetAudience[K]) {
    setData((d) => ({
      ...d,
      targetAudience: { ...d.targetAudience, [key]: value },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});

    // Convert dollars to cents
    const payload = {
      ...data,
      targetCplCents: Math.round(data.targetCplCents * 100),
      dailyBudgetCentsPerVariant: Math.round(data.dailyBudgetCentsPerVariant * 100),
      usps: data.usps.filter((u) => u.trim()),
      logoUrl: data.logoUrl || null,
      landingPageUrl: data.landingPageUrl || null,
      metaPageId: data.metaPageId || null,
      targetInterests: data.targetInterests.length > 0 ? data.targetInterests : null,
    };

    try {
      const url = mode === "create"
        ? "/api/admin/adlab/projects"
        : `/api/admin/adlab/projects/${projectId}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        if (err.issues) {
          const fieldErrors: Record<string, string> = {};
          for (const issue of err.issues) {
            const path = issue.path?.join(".") || "form";
            fieldErrors[path] = issue.message;
          }
          setErrors(fieldErrors);
        } else {
          setErrors({ form: err.error || "Failed to save" });
        }
        setSaving(false);
        return;
      }

      const saved = await res.json();
      router.push(`/admin/adlab/projects/${saved.id}`);
    } catch {
      setErrors({ form: "Network error" });
      setSaving(false);
    }
  }

  function addTag(field: keyof TargetAudience | "bannedPhrases") {
    const key = String(field);
    const value = (tagInputs[key] || "").trim();
    if (!value) return;

    if (field === "bannedPhrases") {
      if (!data.bannedPhrases.includes(value)) {
        updateField("bannedPhrases", [...data.bannedPhrases, value]);
      }
    } else {
      const current = data.targetAudience[field] as string[];
      if (!current.includes(value)) {
        updateAudience(field, [...current, value]);
      }
    }
    setTagInputs((t) => ({ ...t, [key]: "" }));
  }

  function removeTag(field: keyof TargetAudience | "bannedPhrases", index: number) {
    if (field === "bannedPhrases") {
      updateField("bannedPhrases", data.bannedPhrases.filter((_, i) => i !== index));
    } else {
      const current = data.targetAudience[field] as string[];
      updateAudience(field, current.filter((_, i) => i !== index));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {errors.form && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {errors.form}
        </div>
      )}

      {/* Basic Info */}
      <Section title="Basic Info">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project Name" error={errors.name}>
            <input
              type="text"
              value={data.name}
              onChange={(e) => {
                updateField("name", e.target.value);
                if (mode === "create" && !data.slug) {
                  updateField("slug", slugify(e.target.value));
                }
              }}
              className={inputClass}
              placeholder="Acuity"
            />
          </Field>
          <Field label="Slug" error={errors.slug}>
            <input
              type="text"
              value={data.slug}
              onChange={(e) => updateField("slug", slugify(e.target.value))}
              className={inputClass}
              placeholder="acuity"
            />
          </Field>
        </div>
      </Section>

      {/* Brand Voice */}
      <Section title="Brand Voice Guide">
        <Field label="Voice guide (markdown supported)" error={errors.brandVoiceGuide}>
          <textarea
            value={data.brandVoiceGuide}
            onChange={(e) => updateField("brandVoiceGuide", e.target.value)}
            className={`${inputClass} min-h-[120px]`}
            placeholder="Direct, specific, zero-fluff. Smart friend explaining, not marketing blog..."
          />
        </Field>
      </Section>

      {/* Target Audience */}
      <Section title="Target Audience">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Min Age">
            <input
              type="number"
              value={data.targetAudience.ageMin}
              onChange={(e) => updateAudience("ageMin", Number(e.target.value))}
              className={inputClass}
              min={13}
              max={65}
            />
          </Field>
          <Field label="Max Age">
            <input
              type="number"
              value={data.targetAudience.ageMax}
              onChange={(e) => updateAudience("ageMax", Number(e.target.value))}
              className={inputClass}
              min={18}
              max={65}
            />
          </Field>
        </div>
        <TagField
          label="Geographies"
          tags={data.targetAudience.geo}
          inputValue={tagInputs.geo || ""}
          onInputChange={(v) => setTagInputs((t) => ({ ...t, geo: v }))}
          onAdd={() => addTag("geo")}
          onRemove={(i) => removeTag("geo", i)}
          placeholder="US, CA, UK..."
        />
        <TagField
          label="Interests"
          tags={data.targetAudience.interests}
          inputValue={tagInputs.interests || ""}
          onInputChange={(v) => setTagInputs((t) => ({ ...t, interests: v }))}
          onAdd={() => addTag("interests")}
          onRemove={(i) => removeTag("interests", i)}
          placeholder="productivity, journaling, mental health..."
        />
        <TagField
          label="Pain Points"
          tags={data.targetAudience.painPoints}
          inputValue={tagInputs.painPoints || ""}
          onInputChange={(v) => setTagInputs((t) => ({ ...t, painPoints: v }))}
          onAdd={() => addTag("painPoints")}
          onRemove={(i) => removeTag("painPoints", i)}
          placeholder="forgets tasks, no self-awareness..."
        />
        <TagField
          label="Desires"
          tags={data.targetAudience.desires}
          inputValue={tagInputs.desires || ""}
          onInputChange={(v) => setTagInputs((t) => ({ ...t, desires: v }))}
          onAdd={() => addTag("desires")}
          onRemove={(i) => removeTag("desires", i)}
          placeholder="clarity, better habits, weekly review..."
        />
        <TagField
          label="Identity Markers"
          tags={data.targetAudience.identityMarkers}
          inputValue={tagInputs.identityMarkers || ""}
          onInputChange={(v) => setTagInputs((t) => ({ ...t, identityMarkers: v }))}
          onAdd={() => addTag("identityMarkers")}
          onRemove={(i) => removeTag("identityMarkers", i)}
          placeholder="founders, ADHD, therapists..."
        />
      </Section>

      {/* USPs */}
      <Section title="USPs">
        {data.usps.map((usp, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              type="text"
              value={usp}
              onChange={(e) => {
                const next = [...data.usps];
                next[i] = e.target.value;
                updateField("usps", next);
              }}
              className={`${inputClass} flex-1`}
              placeholder="voice entry pulls out tasks and tracks goals automatically"
            />
            {data.usps.length > 1 && (
              <button
                type="button"
                onClick={() => updateField("usps", data.usps.filter((_, j) => j !== i))}
                className="shrink-0 rounded-lg border border-white/10 p-2 text-[#A0A0B8] hover:text-red-400 hover:border-red-400/30 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => updateField("usps", [...data.usps, ""])}
          className="flex items-center gap-1.5 text-xs text-[#7C5CFC] hover:text-[#9B7FFF] transition-colors"
        >
          <Plus className="h-3 w-3" /> Add USP
        </button>
      </Section>

      {/* Banned Phrases */}
      <Section title="Banned Phrases">
        <TagField
          label=""
          tags={data.bannedPhrases}
          inputValue={tagInputs.bannedPhrases || ""}
          onInputChange={(v) => setTagInputs((t) => ({ ...t, bannedPhrases: v }))}
          onAdd={() => addTag("bannedPhrases")}
          onRemove={(i) => removeTag("bannedPhrases", i)}
          placeholder="unlock, elevate, game-changer..."
        />
      </Section>

      {/* Image & Creative */}
      <Section title="Image & Creative">
        <Field label="Image Style Prompt" error={errors.imageStylePrompt}>
          <textarea
            value={data.imageStylePrompt}
            onChange={(e) => updateField("imageStylePrompt", e.target.value)}
            className={`${inputClass} min-h-[80px]`}
            placeholder="Abstract, editorial style. Moody lighting, muted purple/indigo tones on dark background."
          />
        </Field>
        <Field label="Logo URL">
          <input
            type="url"
            value={data.logoUrl}
            onChange={(e) => updateField("logoUrl", e.target.value)}
            className={inputClass}
            placeholder="https://getacuity.io/AcuityLogo.png"
          />
        </Field>
        <Field label="Landing Page URL">
          <input
            type="url"
            value={data.landingPageUrl}
            onChange={(e) => updateField("landingPageUrl", e.target.value)}
            className={inputClass}
            placeholder="https://getacuity.io"
          />
        </Field>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className={`relative h-5 w-9 rounded-full transition-colors ${
              data.imageEnabled ? "bg-[#7C5CFC]" : "bg-white/20"
            }`}
            onClick={() => updateField("imageEnabled", !data.imageEnabled)}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                data.imageEnabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-sm text-[#A0A0B8]">Image creatives enabled (OpenAI gpt-image)</span>
        </label>
      </Section>

      {/* Video / HeyGen */}
      <Section title="Video / HeyGen">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className={`relative h-5 w-9 rounded-full transition-colors ${
              data.videoEnabled ? "bg-[#7C5CFC]" : "bg-white/20"
            }`}
            onClick={() => updateField("videoEnabled", !data.videoEnabled)}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                data.videoEnabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-sm text-[#A0A0B8]">Video creatives enabled (HeyGen)</span>
        </label>
        {data.videoEnabled && (
          <div className="space-y-4 mt-2">
            <p className="text-xs text-[#A0A0B8]">
              Every video script generates <strong>two versions</strong> — one per avatar. Both go into the same ad set so Meta optimizes between them.
              If only the primary avatar is set, videos generate with just that one.
            </p>
            <AvatarSlot
              label="Primary Avatar"
              description="e.g. Keenan — the main presenter"
              avatar={data.videoPrimaryAvatar}
              onChange={(a) => updateField("videoPrimaryAvatar", a)}
            />
            <AvatarSlot
              label="Secondary Avatar"
              description="e.g. female presenter — same script, different face"
              avatar={data.videoSecondaryAvatar}
              onChange={(a) => updateField("videoSecondaryAvatar", a)}
            />
          </div>
        )}
      </Section>

      {/* Ad Config */}
      <Section title="Ad Configuration">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target CPL ($)" error={errors.targetCplCents}>
            <input
              type="number"
              step="0.01"
              value={data.targetCplCents}
              onChange={(e) => updateField("targetCplCents", Number(e.target.value))}
              className={inputClass}
              placeholder="5.00"
            />
          </Field>
          <Field label="Daily Budget per Variant ($)" error={errors.dailyBudgetCentsPerVariant}>
            <input
              type="number"
              step="0.01"
              value={data.dailyBudgetCentsPerVariant}
              onChange={(e) => updateField("dailyBudgetCentsPerVariant", Number(e.target.value))}
              className={inputClass}
              placeholder="10.00"
            />
          </Field>
          <Field label="Test Duration (days)">
            <input
              type="number"
              value={data.testDurationDays}
              onChange={(e) => updateField("testDurationDays", Number(e.target.value))}
              className={inputClass}
              min={1}
            />
          </Field>
          <Field label="Conversion Objective">
            <select
              value={data.conversionObjective}
              onChange={(e) => updateField("conversionObjective", e.target.value)}
              className={inputClass}
            >
              <option value="OUTCOME_LEADS">OUTCOME_LEADS</option>
              <option value="OUTCOME_SALES">OUTCOME_SALES</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* Meta Integration */}
      <Section title="Meta Integration">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ad Account ID" error={errors.metaAdAccountId}>
            <input
              type="text"
              value={data.metaAdAccountId}
              onChange={(e) => updateField("metaAdAccountId", e.target.value)}
              className={inputClass}
              placeholder="act_XXXXXXXXX"
            />
          </Field>
          <Field label="Pixel ID" error={errors.metaPixelId}>
            <input
              type="text"
              value={data.metaPixelId}
              onChange={(e) => updateField("metaPixelId", e.target.value)}
              className={inputClass}
              placeholder="XXXXXXXXX"
            />
          </Field>
        </div>
        <Field label="Facebook Page ID" error={errors.metaPageId}>
          <input
            type="text"
            value={data.metaPageId}
            onChange={(e) => updateField("metaPageId", e.target.value)}
            className={inputClass}
            placeholder="XXXXXXXXX"
          />
          <p className="mt-1 text-[10px] text-[#A0A0B8]/60">Required to launch ads. Find this in your Facebook Page &rarr; About &rarr; Page ID</p>
        </Field>
        <Field label="Conversion Event">
          <input
            type="text"
            value={data.conversionEvent}
            onChange={(e) => updateField("conversionEvent", e.target.value)}
            className={inputClass}
            placeholder="Lead, CompleteRegistration, Purchase..."
          />
        </Field>
      </Section>

      {/* Target Interests (Meta) */}
      <Section title="Target Interests (Meta)">
        <InterestSearch
          selected={data.targetInterests}
          onAdd={(interest) => {
            if (!data.targetInterests.find((i) => i.id === interest.id)) {
              updateField("targetInterests", [...data.targetInterests, interest]);
            }
          }}
          onRemove={(id) => {
            updateField("targetInterests", data.targetInterests.filter((i) => i.id !== id));
          }}
        />
      </Section>

      {/* Submit */}
      <div className="flex items-center gap-4 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFC] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create Project" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-[#A0A0B8] hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-white/10 bg-[#1E1E2E] px-3 py-2 text-sm text-white placeholder-[#A0A0B8]/50 outline-none focus:border-[#7C5CFC] transition-colors";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#13131F] p-6">
      <h3 className="text-base font-semibold text-white mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && (
        <label className="block text-xs text-[#A0A0B8] mb-1.5">{label}</label>
      )}
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function TagField({
  label,
  tags,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  tags: string[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  placeholder: string;
}) {
  return (
    <div>
      {label && (
        <label className="block text-xs text-[#A0A0B8] mb-1.5">{label}</label>
      )}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-md bg-[#7C5CFC]/15 px-2 py-0.5 text-xs text-[#7C5CFC]"
          >
            {tag}
            <button type="button" onClick={() => onRemove(i)}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          className={`${inputClass} flex-1`}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#A0A0B8] hover:text-white hover:border-white/20 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function InterestSearch({
  selected,
  onAdd,
  onRemove,
}: {
  selected: { id: string; name: string }[];
  onAdd: (interest: { id: string; name: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; audienceSize: number | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const search = useCallback((q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    fetch(`/api/admin/adlab/interests/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setResults(data);
      })
      .finally(() => setSearching(false));
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(() => search(value), 400));
  }

  return (
    <div>
      <p className="text-xs text-[#A0A0B8] mb-3">
        Search Meta&apos;s ad interest database to target specific audiences. Leave empty for broad/Advantage+ targeting.
      </p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {selected.map((i) => (
            <span
              key={i.id}
              className="inline-flex items-center gap-1 rounded-md bg-[#7C5CFC]/15 px-2 py-0.5 text-xs text-[#7C5CFC]"
            >
              {i.name}
              <button type="button" onClick={() => onRemove(i.id)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A0A0B8]/50" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              className={`${inputClass} pl-8`}
              placeholder="Search interests (e.g. productivity, meditation...)"
            />
          </div>
          {searching && <Loader2 className="h-4 w-4 text-[#A0A0B8] animate-spin self-center" />}
        </div>
        {results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-white/10 bg-[#1E1E2E] shadow-lg z-20 max-h-48 overflow-y-auto">
            {results.map((r) => {
              const alreadySelected = selected.some((s) => s.id === r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={alreadySelected}
                  onClick={() => {
                    onAdd({ id: r.id, name: r.name });
                    setQuery("");
                    setResults([]);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-white/5 last:border-0 transition-colors ${
                    alreadySelected
                      ? "text-[#A0A0B8]/40 cursor-not-allowed"
                      : "text-white hover:bg-white/5 cursor-pointer"
                  }`}
                >
                  <span>{r.name}</span>
                  {r.audienceSize && (
                    <span className="ml-2 text-[10px] text-[#A0A0B8]">
                      ~{(r.audienceSize / 1_000_000).toFixed(1)}M
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Avatar slot picker (primary / secondary) ──────────────────────────

interface HeyGenAvatarOption {
  avatarId: string;
  avatarName: string;
  gender: string;
  lookId: string;
  lookName: string;
  previewUrl: string | null;
  isInstantAvatar: boolean;
}

interface HeyGenVoiceOption {
  voiceId: string;
  voiceName: string;
  language: string;
  gender: string;
  isCloned: boolean;
  previewAudio: string | null;
}

// Tiny play/pause toggle for voice previews
function VoicePreviewButton({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!audioRef.current) {
      audioRef.current = new Audio(src);
      audioRef.current.addEventListener("ended", () => setPlaying(false));
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  }

  return (
    <button type="button" onClick={toggle}
      className="shrink-0 rounded-full p-1 text-[#A0A0B8] hover:text-white hover:bg-white/10 transition" title="Preview voice">
      {playing ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
    </button>
  );
}

// Avatar thumbnail — shows preview image or placeholder silhouette
function AvatarThumb({ src, size = 40 }: { src?: string | null; size?: number }) {
  if (src) {
    return (
      <img src={src} alt="" className="shrink-0 rounded-lg object-cover bg-white/5"
        style={{ width: size, height: size }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
    );
  }
  return (
    <div className="shrink-0 rounded-lg bg-white/5 flex items-center justify-center" style={{ width: size, height: size }}>
      <User className="h-4 w-4 text-[#A0A0B8]/40" />
    </div>
  );
}

function AvatarSlot({
  label,
  description,
  avatar,
  onChange,
}: {
  label: string;
  description: string;
  avatar: VideoAvatar | null;
  onChange: (avatar: VideoAvatar | null) => void;
}) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [available, setAvailable] = useState<HeyGenAvatarOption[]>([]);
  const [voices, setVoices] = useState<HeyGenVoiceOption[]>([]);
  const [browseError, setBrowseError] = useState<string | null>(null);

  // Two-step browser: pick avatar, then pick voice
  const [pendingAvatar, setPendingAvatar] = useState<{ id: string; name: string; gender: string; previewUrl: string | null } | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");

  // Manual entry
  const [showManual, setShowManual] = useState(false);
  const [manualId, setManualId] = useState("");
  const [manualVoice, setManualVoice] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualGender, setManualGender] = useState("male");
  const [manualError, setManualError] = useState<string | null>(null);

  async function browseAvatars() {
    setBrowsing(true);
    setBrowseError(null);
    try {
      const res = await fetch("/api/admin/adlab/heygen/avatars");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setBrowseError(body.error || `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      setAvailable(data.avatars || []);
      setVoices(data.voices || []);
      setShowBrowser(true);
      setPendingAvatar(null);
      setSelectedVoiceId("");
    } catch {
      setBrowseError("Failed to fetch avatars");
    } finally {
      setBrowsing(false);
    }
  }

  function pickAvatar(opt: HeyGenAvatarOption) {
    setPendingAvatar({
      id: opt.lookId,
      name: `${opt.avatarName} (${opt.lookName})`,
      gender: opt.gender,
      previewUrl: opt.previewUrl,
    });
    const cloned = voices.filter((v) => v.isCloned);
    if (cloned.length === 1) {
      setSelectedVoiceId(cloned[0].voiceId);
    } else {
      setSelectedVoiceId("");
    }
  }

  function confirmAvatarWithVoice() {
    if (!pendingAvatar || !selectedVoiceId) return;
    onChange({
      id: pendingAvatar.id,
      voiceId: selectedVoiceId,
      name: pendingAvatar.name,
      gender: pendingAvatar.gender,
      previewUrl: pendingAvatar.previewUrl,
    });
    setShowBrowser(false);
    setPendingAvatar(null);
    setSelectedVoiceId("");
  }

  function saveManual() {
    if (!manualId.trim()) return;
    if (!manualVoice.trim()) {
      setManualError("Select a voice before saving.");
      return;
    }
    setManualError(null);
    onChange({
      id: manualId.trim(),
      voiceId: manualVoice.trim(),
      name: manualName.trim() || manualId.trim(),
      gender: manualGender,
    });
    setShowManual(false);
    setManualId("");
    setManualVoice("");
    setManualName("");
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#0D0D17] p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-[10px] text-[#A0A0B8]">{description}</p>
      </div>

      {/* Saved avatar display with thumbnail */}
      {avatar ? (
        <div className="flex items-center gap-3 rounded-lg bg-[#1E1E2E] px-3 py-2 border border-white/10">
          <AvatarThumb src={avatar.previewUrl} size={48} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{avatar.name}</p>
            <p className="text-[10px] text-[#A0A0B8] font-mono truncate">
              ID: {avatar.id} | Voice: {avatar.voiceId} | {avatar.gender}
            </p>
          </div>
          <button type="button" onClick={() => onChange(null)}
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-[#A0A0B8] hover:text-red-400 hover:border-red-400/30 transition-colors">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" onClick={browseAvatars} disabled={browsing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#7C5CFC]/30 bg-[#7C5CFC]/10 px-3 py-2 text-xs text-[#7C5CFC] hover:bg-[#7C5CFC]/20 transition disabled:opacity-50">
            {browsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
            Browse HeyGen
          </button>
          <button type="button" onClick={() => { setShowManual(!showManual); setManualError(null); }}
            className="inline-flex items-center gap-1.5 text-xs text-[#A0A0B8] hover:text-white transition">
            <Plus className="h-3 w-3" /> Enter manually
          </button>
          {browseError && <span className="text-xs text-red-400">{browseError}</span>}
        </div>
      )}

      {/* Manual entry */}
      {showManual && !avatar && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="text" value={manualId} onChange={(e) => setManualId(e.target.value)}
              className={inputClass} placeholder="Avatar/Look ID *" />
            <input type="text" value={manualVoice} onChange={(e) => { setManualVoice(e.target.value); setManualError(null); }}
              className={`${inputClass} ${manualError ? "border-red-500/50" : ""}`} placeholder="Voice ID *" />
            <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)}
              className={inputClass} placeholder="Display name" />
            <div className="flex gap-2">
              <select value={manualGender} onChange={(e) => setManualGender(e.target.value)}
                className={inputClass}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <button type="button" onClick={saveManual} disabled={!manualId.trim()}
                className="shrink-0 rounded-lg bg-[#7C5CFC] px-3 py-2 text-xs font-medium text-white hover:bg-[#6B4FE0] transition disabled:opacity-40">
                Set
              </button>
            </div>
          </div>
          {manualError && <p className="text-xs text-red-400">{manualError}</p>}
        </div>
      )}

      {/* Browser panel — step 1: pick avatar with thumbnails */}
      {showBrowser && !pendingAvatar && available.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-[#1E1E2E] max-h-64 overflow-y-auto">
          <div className="sticky top-0 flex items-center justify-between px-3 py-2 bg-[#1E1E2E] border-b border-white/10 z-10">
            <span className="text-xs font-medium text-[#A0A0B8]">Step 1: Select avatar ({available.length})</span>
            <button type="button" onClick={() => setShowBrowser(false)} className="text-[#A0A0B8] hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {available.map((opt) => (
            <button key={opt.lookId} type="button"
              onClick={() => pickAvatar(opt)}
              className="w-full text-left px-3 py-2 border-b border-white/5 last:border-0 transition-colors text-white hover:bg-white/5">
              <div className="flex items-center gap-3">
                <AvatarThumb src={opt.previewUrl} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {opt.isInstantAvatar && (
                      <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">INSTANT</span>
                    )}
                    <span className="text-sm truncate">{opt.avatarName}</span>
                    <span className="text-[10px] text-[#A0A0B8]">({opt.lookName})</span>
                    <span className="text-[10px] text-[#A0A0B8]">{opt.gender}</span>
                  </div>
                  <p className="text-[10px] text-[#A0A0B8] font-mono truncate">ID: {opt.lookId}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: pick voice with play previews */}
      {showBrowser && pendingAvatar && (
        <div className="rounded-lg border border-[#7C5CFC]/30 bg-[#1E1E2E] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AvatarThumb src={pendingAvatar.previewUrl} size={32} />
              <div>
                <span className="text-xs font-medium text-[#A0A0B8]">Step 2: Select voice for </span>
                <span className="text-xs font-medium text-white">{pendingAvatar.name}</span>
              </div>
            </div>
            <button type="button" onClick={() => setPendingAvatar(null)} className="text-[10px] text-[#A0A0B8] hover:text-white">
              &larr; Back
            </button>
          </div>

          {voices.length > 0 ? (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10">
              {voices.map((v) => (
                <button key={v.voiceId} type="button"
                  onClick={() => setSelectedVoiceId(v.voiceId)}
                  className={`w-full text-left px-3 py-2 border-b border-white/5 last:border-0 transition-colors ${
                    selectedVoiceId === v.voiceId
                      ? "bg-[#7C5CFC]/15 text-white"
                      : "text-white hover:bg-white/5"
                  }`}>
                  <div className="flex items-center gap-2">
                    {v.previewAudio && <VoicePreviewButton src={v.previewAudio} />}
                    {v.isCloned && (
                      <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">CLONED</span>
                    )}
                    <span className="text-sm truncate">{v.voiceName}</span>
                    <span className="text-[10px] text-[#A0A0B8]">{v.gender} · {v.language}</span>
                    {selectedVoiceId === v.voiceId && <span className="text-[10px] text-[#7C5CFC]">&#10003;</span>}
                  </div>
                  <p className="text-[10px] text-[#A0A0B8] font-mono truncate mt-0.5">ID: {v.voiceId}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#A0A0B8]">No voices found. Enter a Voice ID manually.</p>
          )}

          {/* Manual voice ID fallback */}
          <div className="flex gap-2">
            <input type="text" value={selectedVoiceId} onChange={(e) => setSelectedVoiceId(e.target.value)}
              className={`${inputClass} flex-1 text-xs`} placeholder="Voice ID (select above or paste)" />
          </div>

          <button type="button" onClick={confirmAvatarWithVoice} disabled={!selectedVoiceId}
            className="w-full rounded-lg bg-[#7C5CFC] px-3 py-2 text-xs font-medium text-white hover:bg-[#6B4FE0] transition disabled:opacity-40">
            {selectedVoiceId ? "Confirm Avatar + Voice" : "Select a voice to continue"}
          </button>
        </div>
      )}
    </div>
  );
}
