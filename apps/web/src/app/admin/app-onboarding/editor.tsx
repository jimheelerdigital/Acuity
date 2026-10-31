"use client";

/**
 * App onboarding editor (2026-10-31). Every field starts empty and shows the
 * app's own words as its placeholder: leave it empty to keep them, type to
 * replace them. Variants split new installs by weight; results are tagged
 * with the variant id on every onboarding event.
 */
import { useState } from "react";

import {
  ONBOARDING_SCREENS,
  REQUIRED_ONBOARDING_SCREENS,
  type OnboardingOverrides,
  type OnboardingRemoteConfig,
  type OnboardingScreen,
  type OnboardingVariant,
} from "@acuity/shared";

import type { APP_ONBOARDING_DEFAULTS } from "@/lib/remote-onboarding";

type Defaults = typeof APP_ONBOARDING_DEFAULTS;
type Section = Exclude<keyof OnboardingOverrides, "order">;

const input =
  "w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-orange-400 focus:outline-none";

function Field({
  label,
  value,
  placeholder,
  long,
  onChange,
}: {
  label: string;
  value: string | undefined;
  placeholder: string;
  long?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-white/60">{label}</span>
      {long ? (
        <textarea className={input} rows={3} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={input} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function OnboardingEditor({
  initial,
  defaults,
  screenLabels,
  updatedAt,
}: {
  initial: OnboardingRemoteConfig;
  defaults: Defaults;
  screenLabels: Record<string, string>;
  updatedAt: string | null;
}) {
  const [variants, setVariants] = useState<OnboardingVariant[]>(initial.variants);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<string>(updatedAt ? `Last saved ${new Date(updatedAt).toLocaleString()}` : "Not saved yet: the app uses its own words.");
  const [saving, setSaving] = useState(false);

  const v = variants[active];
  const o = v.overrides;

  const update = (fn: (o: OnboardingOverrides) => OnboardingOverrides) =>
    setVariants((vs) => vs.map((x, i) => (i === active ? { ...x, overrides: fn(x.overrides) } : x)));

  /** Set one text field; empty removes the override. */
  const setText = (section: Section, key: string, value: string) =>
    update((cur) => {
      const sec = { ...((cur[section] as Record<string, unknown> | undefined) ?? {}) };
      if (value.trim()) sec[key] = value;
      else delete sec[key];
      const next = { ...cur } as Record<string, unknown>;
      if (Object.keys(sec).length) next[section] = sec;
      else delete next[section];
      return next as OnboardingOverrides;
    });

  const setOption = (section: "age" | "carrying", id: string, value: string) =>
    update((cur) => {
      const sec = { ...(cur[section] ?? {}) } as { options?: Record<string, string> } & Record<string, unknown>;
      const opts = { ...(sec.options ?? {}) };
      if (value.trim()) opts[id] = value;
      else delete opts[id];
      if (Object.keys(opts).length) sec.options = opts;
      else delete sec.options;
      return { ...cur, [section]: Object.keys(sec).length ? sec : undefined } as OnboardingOverrides;
    });

  const setYearRow = (i: number, key: "title" | "text", value: string) =>
    update((cur) => {
      const rows = [...(cur.year?.rows ?? [null, null, null, null, null])];
      while (rows.length < 5) rows.push(null);
      const row = { ...(rows[i] ?? {}) } as Record<string, string>;
      if (value.trim()) row[key] = value;
      else delete row[key];
      rows[i] = Object.keys(row).length ? row : null;
      const year = { ...(cur.year ?? {}), rows: rows.some(Boolean) ? rows : undefined };
      return { ...cur, year };
    });

  // Screen order: the override, or the app's default order.
  const order: OnboardingScreen[] = o.order ?? [...ONBOARDING_SCREENS];
  const hidden = ONBOARDING_SCREENS.filter((s) => !order.includes(s));
  const setOrder = (next: OnboardingScreen[]) =>
    update((cur) => {
      const withConsent = [...next.filter((s) => s !== "consent"), "consent" as const];
      const isDefault = withConsent.join() === ONBOARDING_SCREENS.join();
      return { ...cur, order: isDefault ? undefined : withConsent };
    });
  const move = (i: number, dir: -1 | 1) => {
    const list = order.filter((s) => s !== "consent");
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setOrder(list);
  };

  const totalWeight = variants.reduce((n, x) => n + x.weight, 0);

  const save = async () => {
    setSaving(true);
    setStatus("Saving…");
    try {
      const res = await fetch("/api/admin/app-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variants }),
      });
      const data = (await res.json()) as { ok?: boolean; config?: OnboardingRemoteConfig; error?: string };
      if (!res.ok || !data.config) throw new Error(data.error ?? `HTTP ${res.status}`);
      setVariants(data.config.variants);
      setActive((a) => Math.min(a, data.config!.variants.length - 1));
      setStatus(`Saved ${new Date().toLocaleTimeString()}. Live for new installs now.`);
    } catch (e) {
      setStatus(`Save failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const d = defaults;
  const s = (section: Section, key: string) => ((o[section] as Record<string, string> | undefined) ?? {})[key];

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 text-white">
      <header>
        <h1 className="text-2xl font-semibold">App onboarding</h1>
        <p className="mt-1 text-sm text-white/60">
          Change the app&apos;s onboarding words and screen order without an app update. Empty fields keep the app&apos;s own words (shown in grey). Changes reach new installs as soon as you save. Prices and the trial length always come from the App Store.
        </p>
      </header>

      {/* Variants */}
      <Card title="Versions (A/B test)">
        <div className="flex flex-wrap gap-2">
          {variants.map((x, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-full px-3 py-1 text-sm ${i === active ? "bg-orange-500 text-white" : "bg-white/10 text-white/80"}`}
            >
              {x.id} · {totalWeight ? Math.round((x.weight / totalWeight) * 100) : 0}%
            </button>
          ))}
          {variants.length < 6 ? (
            <button
              type="button"
              className="rounded-full border border-dashed border-white/30 px-3 py-1 text-sm text-white/70"
              onClick={() => {
                const copy: OnboardingVariant = { id: `version-${variants.length + 1}`, weight: 50, overrides: JSON.parse(JSON.stringify(v.overrides)) };
                setVariants((vs) => [...vs, copy]);
                setActive(variants.length);
              }}
            >
              + Copy this version
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Name" value={v.id} placeholder="control" onChange={(val) => setVariants((vs) => vs.map((x, i) => (i === active ? { ...x, id: val } : x)))} />
          <label className="block">
            <span className="mb-1 block text-xs text-white/60">Weight (0 = paused)</span>
            <input
              className={input}
              type="number"
              min={0}
              max={100}
              value={v.weight}
              onChange={(e) => setVariants((vs) => vs.map((x, i) => (i === active ? { ...x, weight: Number(e.target.value) } : x)))}
            />
          </label>
          <div className="flex items-end">
            {variants.length > 1 ? (
              <button
                type="button"
                className="rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-200"
                onClick={() => {
                  setVariants((vs) => vs.filter((_, i) => i !== active));
                  setActive(0);
                }}
              >
                Delete version
              </button>
            ) : null}
          </div>
        </div>
        <Field label="Note (what this version tests)" value={v.note} placeholder="e.g. pain-first hook" onChange={(val) => setVariants((vs) => vs.map((x, i) => (i === active ? { ...x, note: val || undefined } : x)))} />
      </Card>

      {/* Order */}
      <Card title="Screen order">
        <ol className="space-y-1">
          {order
            .filter((sc) => sc !== "consent")
            .map((sc, i, list) => (
              <li key={sc} className="flex items-center gap-2 rounded-md bg-black/20 px-3 py-2 text-sm">
                <span className="w-6 text-white/40">{i + 1}.</span>
                <span className="flex-1">{screenLabels[sc] ?? sc}</span>
                <button type="button" className="px-2 text-white/60 disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="px-2 text-white/60 disabled:opacity-20" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
                {REQUIRED_ONBOARDING_SCREENS.includes(sc) ? (
                  <span className="w-12 text-right text-xs text-white/30">required</span>
                ) : (
                  <button type="button" className="w-12 text-right text-xs text-white/60" onClick={() => setOrder(order.filter((x) => x !== sc))}>Hide</button>
                )}
              </li>
            ))}
          <li className="flex items-center gap-2 px-3 py-2 text-sm text-white/40">
            <span className="w-6">{order.length}.</span>
            {screenLabels.consent}
          </li>
        </ol>
        {hidden.length ? (
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="text-white/50">Hidden:</span>
            {hidden.map((sc) => (
              <button key={sc} type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => setOrder([...order.filter((x) => x !== "consent"), sc])}>
                + {screenLabels[sc] ?? sc}
              </button>
            ))}
          </div>
        ) : null}
      </Card>

      <Card title="Hook">
        <Field label="Question" value={s("hook", "title")} placeholder={d.hook.title} onChange={(x) => setText("hook", "title", x)} />
        <Field label="Promise line" value={s("hook", "promise")} placeholder={d.hook.promise} onChange={(x) => setText("hook", "promise", x)} />
      </Card>

      <Card title="Age range">
        <Field label="Question" value={s("age", "title")} placeholder={d.age.title} onChange={(x) => setText("age", "title", x)} />
        {Object.entries(d.age.options).map(([id, label]) => (
          <Field key={id} label={`Option: ${label}`} value={o.age?.options?.[id]} placeholder={label} onChange={(x) => setOption("age", id, x)} />
        ))}
      </Card>

      <Card title="What are you carrying?">
        <Field label="Question" value={s("carrying", "title")} placeholder={d.carrying.title} onChange={(x) => setText("carrying", "title", x)} />
        <Field label="Sub line" value={s("carrying", "sub")} placeholder={d.carrying.sub} onChange={(x) => setText("carrying", "sub", x)} />
        {Object.entries(d.carrying.options).map(([id, label]) => (
          <Field key={id} label={`Option: ${label}`} value={o.carrying?.options?.[id]} placeholder={label} onChange={(x) => setOption("carrying", id, x)} />
        ))}
      </Card>

      <Card title="Yes/no: does this sound like you?">
        <Field label="Small label" value={s("sound", "eyebrow")} placeholder={d.sound.eyebrow} onChange={(x) => setText("sound", "eyebrow", x)} />
        <Field label="Question" value={s("sound", "title")} placeholder={d.sound.title} onChange={(x) => setText("sound", "title", x)} />
        <Field label="Statement" value={s("sound", "statement")} placeholder={d.sound.statement} onChange={(x) => setText("sound", "statement", x)} />
      </Card>

      <Card title="You're not lazy">
        <Field label="Headline" value={s("notLazy", "title")} placeholder={d.notLazy.title} onChange={(x) => setText("notLazy", "title", x)} />
        <Field label="Body" long value={s("notLazy", "body")} placeholder={d.notLazy.body} onChange={(x) => setText("notLazy", "body", x)} />
        <Field label="Button" value={s("notLazy", "cta")} placeholder={d.notLazy.cta} onChange={(x) => setText("notLazy", "cta", x)} />
        <Field
          label="Floating to-dos (one per line, 4 to 12)"
          long
          value={o.notLazy?.things?.join("\n")}
          placeholder={d.notLazy.things.join("\n")}
          onChange={(x) =>
            update((cur) => {
              const things = x.split("\n").map((t) => t.trim()).filter(Boolean);
              const nl = { ...(cur.notLazy ?? {}) } as NonNullable<OnboardingOverrides["notLazy"]>;
              if (things.length) nl.things = things;
              else delete nl.things;
              return { ...cur, notLazy: Object.keys(nl).length ? nl : undefined };
            })
          }
        />
      </Card>

      <Card title="Your first year">
        <Field label="Small label" value={s("year", "eyebrow")} placeholder={d.year.eyebrow} onChange={(x) => setText("year", "eyebrow", x)} />
        <Field label="Button" value={s("year", "cta")} placeholder={d.year.cta} onChange={(x) => setText("year", "cta", x)} />
        {d.year.rows.map((r, i) => (
          <div key={r.day} className="grid gap-2 rounded-md bg-black/20 p-3">
            <span className="text-xs text-white/50">{r.day}</span>
            <Field label="Title" value={o.year?.rows?.[i]?.title} placeholder={r.title} onChange={(x) => setYearRow(i, "title", x)} />
            <Field label="Text" long value={o.year?.rows?.[i]?.text} placeholder={r.text} onChange={(x) => setYearRow(i, "text", x)} />
          </div>
        ))}
      </Card>

      <Card title="Ready?">
        <Field label="Question" value={s("ready", "title")} placeholder={d.ready.title} onChange={(x) => setText("ready", "title", x)} />
        <Field label="Sub line" long value={s("ready", "sub")} placeholder={d.ready.sub} onChange={(x) => setText("ready", "sub", x)} />
        <Field label="Yes button" value={s("ready", "yes")} placeholder={d.ready.yes} onChange={(x) => setText("ready", "yes", x)} />
      </Card>

      <Card title="Paywall words ({days} = trial length, {name} = first name)">
        <Field label="Badge" value={s("paywall", "badge")} placeholder={d.paywall.badge} onChange={(x) => setText("paywall", "badge", x)} />
        <Field label="Headline" value={s("paywall", "titleLead")} placeholder={d.paywall.titleLead} onChange={(x) => setText("paywall", "titleLead", x)} />
        <Field label="Headline, coral part" value={s("paywall", "titleAccent")} placeholder={d.paywall.titleAccent} onChange={(x) => setText("paywall", "titleAccent", x)} />
        <Field label="Line under the headline" value={s("paywall", "sub")} placeholder={d.paywall.sub} onChange={(x) => setText("paywall", "sub", x)} />
        <Field label="Features heading" value={s("paywall", "proHeading")} placeholder={d.paywall.proHeading} onChange={(x) => setText("paywall", "proHeading", x)} />
        <Field label="Button" value={s("paywall", "cta")} placeholder={d.paywall.cta} onChange={(x) => setText("paywall", "cta", x)} />
        <Field label="Trust line above the button (empty = none)" value={s("paywall", "trustLine")} placeholder="e.g. No commitment. Cancel anytime." onChange={(x) => setText("paywall", "trustLine", x)} />
      </Card>

      <div className="sticky bottom-0 flex items-center gap-4 border-t border-white/10 bg-[#0b0b0f] py-4">
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save and go live"}
        </button>
        <span className="text-sm text-white/60">{status}</span>
      </div>
    </div>
  );
}
