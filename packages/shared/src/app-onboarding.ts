/**
 * Server-controlled app onboarding (2026-10-31, per Keenan: "change the
 * onboarding funnel directly within our app WITHOUT ever having to do an app
 * update").
 *
 * The admin (/admin/app-onboarding) saves an OnboardingRemoteConfig: one or
 * more variants, each with a weight and a set of overrides for the v11
 * onboarding's words and screen order. GET /api/app/onboarding-config picks a
 * variant per install and returns its overrides; the app applies them over
 * its bundled copy (apps/mobile/lib/onboarding-v11/remote.ts).
 *
 * Shared by web and mobile so both sides accept exactly the same shape.
 * Everything is optional: an empty override changes nothing, and anything
 * this file doesn't recognize is dropped, so a bad save can never put
 * unknown data in front of the app.
 *
 * Editable: text only, plus the order of the question screens. Option ids,
 * icons and screen types stay in the app, because analytics, habit
 * suggestions and the persona name key off them. New screen TYPES still
 * need an app release.
 */

/** The v11 question screens that can be reordered or hidden. "consent" always stays last. */
export const ONBOARDING_SCREENS = ["hook", "age", "carrying", "sound", "notlazy", "name", "year", "ready", "consent"] as const;
export type OnboardingScreen = (typeof ONBOARDING_SCREENS)[number];
/** Screens that can't be hidden: consent gates recording, name feeds the paywall and results. */
export const REQUIRED_ONBOARDING_SCREENS: OnboardingScreen[] = ["name", "consent"];

export interface OnboardingOverrides {
  /** Question screen order. Must end with "consent" and include every required screen. */
  order?: OnboardingScreen[];
  hook?: { title?: string; promise?: string };
  /** options: option id → new label. */
  age?: { title?: string; options?: Record<string, string> };
  carrying?: { title?: string; sub?: string; options?: Record<string, string> };
  sound?: { eyebrow?: string; title?: string; statement?: string };
  notLazy?: { title?: string; body?: string; cta?: string; things?: string[] };
  /** rows: by position (0 = Day 1 … 4 = Day 365); null keeps that row. */
  year?: { eyebrow?: string; cta?: string; rows?: ({ title?: string; text?: string } | null)[] };
  ready?: { title?: string; sub?: string; yes?: string };
  /**
   * Paywall words. Prices and trial length always come from the store.
   * {days} → trial length, {name} → first name. trustLine is shown above the
   * button only when set.
   */
  paywall?: {
    badge?: string;
    titleLead?: string;
    titleAccent?: string;
    sub?: string;
    proHeading?: string;
    cta?: string;
    trustLine?: string;
  };
}

export interface OnboardingVariant {
  /** Short id, e.g. "control", "planner-hook". Tagged on every onboarding event. */
  id: string;
  /** Share of new installs, relative to the other variants' weights. 0 = paused. */
  weight: number;
  /** Plain-English note for the admin ("tests a pain-first hook"). */
  note?: string;
  overrides: OnboardingOverrides;
}

export interface OnboardingRemoteConfig {
  variants: OnboardingVariant[];
}

/** What GET /api/app/onboarding-config returns. */
export interface OnboardingConfigResponse {
  variant: string;
  overrides: OnboardingOverrides;
}

export const DEFAULT_ONBOARDING_CONFIG: OnboardingRemoteConfig = {
  variants: [{ id: "control", weight: 100, overrides: {} }],
};

const SHORT = 160;
const LONG = 400;

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Keep only the listed string fields, trimmed and length-capped. Undefined when nothing is left. */
function fields<K extends string>(v: unknown, spec: Record<K, number>): Partial<Record<K, string>> | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const out: Partial<Record<K, string>> = {};
  for (const k of Object.keys(spec) as K[]) {
    const s = str(o[k], spec[k]);
    if (s) out[k] = s;
  }
  return Object.keys(out).length ? out : undefined;
}

function labelMap(v: unknown): Record<string, string> | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(o)) {
    const s = str(val, 80);
    if (/^[a-z0-9_-]{1,40}$/i.test(k) && s) out[k] = s;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A valid order, or undefined (keep the app's own). */
export function sanitizeOrder(v: unknown): OnboardingScreen[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<OnboardingScreen>();
  for (const s of v) {
    if ((ONBOARDING_SCREENS as readonly string[]).includes(s as string)) seen.add(s as OnboardingScreen);
  }
  const order = [...seen].filter((s) => s !== "consent");
  if (!REQUIRED_ONBOARDING_SCREENS.every((r) => r === "consent" || order.includes(r))) return undefined;
  if (!order.length) return undefined;
  return [...order, "consent"];
}

/** Drop anything unrecognized. Safe to call on untrusted JSON. */
export function sanitizeOverrides(v: unknown): OnboardingOverrides {
  const o = obj(v) ?? {};
  const out: OnboardingOverrides = {};

  const order = sanitizeOrder(o.order);
  if (order) out.order = order;

  const hook = fields(o.hook, { title: SHORT, promise: SHORT });
  if (hook) out.hook = hook;

  const ageO = obj(o.age);
  const age = { ...fields(ageO, { title: SHORT }), ...(labelMap(ageO?.options) ? { options: labelMap(ageO?.options) } : {}) };
  if (Object.keys(age).length) out.age = age;

  const carO = obj(o.carrying);
  const carrying = { ...fields(carO, { title: SHORT, sub: SHORT }), ...(labelMap(carO?.options) ? { options: labelMap(carO?.options) } : {}) };
  if (Object.keys(carrying).length) out.carrying = carrying;

  const sound = fields(o.sound, { eyebrow: 60, title: SHORT, statement: SHORT });
  if (sound) out.sound = sound;

  const nlO = obj(o.notLazy);
  const things = Array.isArray(nlO?.things)
    ? (nlO!.things as unknown[]).map((t) => str(t, 40)).filter((t): t is string => !!t).slice(0, 12)
    : [];
  const notLazy = { ...fields(nlO, { title: SHORT, body: LONG, cta: 60 }), ...(things.length >= 4 ? { things } : {}) };
  if (Object.keys(notLazy).length) out.notLazy = notLazy;

  const yO = obj(o.year);
  const rows = Array.isArray(yO?.rows)
    ? (yO!.rows as unknown[]).slice(0, 5).map((r) => fields(r, { title: 80, text: LONG }) ?? null)
    : [];
  const year = { ...fields(yO, { eyebrow: 60, cta: 60 }), ...(rows.some(Boolean) ? { rows } : {}) };
  if (Object.keys(year).length) out.year = year;

  const ready = fields(o.ready, { title: SHORT, sub: LONG, yes: 60 });
  if (ready) out.ready = ready;

  const paywall = fields(o.paywall, {
    badge: 60,
    titleLead: 60,
    titleAccent: 60,
    sub: SHORT,
    proHeading: 60,
    cta: 60,
    trustLine: 80,
  });
  if (paywall) out.paywall = paywall;

  return out;
}

/** Validate a whole config. Falls back to DEFAULT_ONBOARDING_CONFIG when nothing usable is left. */
export function sanitizeRemoteConfig(v: unknown): OnboardingRemoteConfig {
  const o = obj(v);
  const raw = Array.isArray(o?.variants) ? (o!.variants as unknown[]) : [];
  const ids = new Set<string>();
  const variants: OnboardingVariant[] = [];
  for (const r of raw.slice(0, 6)) {
    const ro = obj(r);
    const id = str(ro?.id, 40)?.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    if (!ro || !id || ids.has(id)) continue;
    ids.add(id);
    const weight = Math.max(0, Math.min(100, Math.round(Number(ro.weight) || 0)));
    const note = str(ro.note, 200);
    variants.push({ id, weight, ...(note ? { note } : {}), overrides: sanitizeOverrides(ro.overrides) });
  }
  if (!variants.some((x) => x.weight > 0)) return DEFAULT_ONBOARDING_CONFIG;
  return { variants };
}

/** FNV-1a, so the same install always lands in the same variant. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The variant for this install. Sticky while variant ids and weights stay the
 * same; changing weights reshuffles some installs, which is fine because
 * each install only sees onboarding once.
 */
export function pickOnboardingVariant(config: OnboardingRemoteConfig, installId: string): OnboardingVariant {
  const live = config.variants.filter((v) => v.weight > 0);
  if (!live.length) return DEFAULT_ONBOARDING_CONFIG.variants[0];
  const total = live.reduce((n, v) => n + v.weight, 0);
  let point = hash(`${installId}:app-onboarding`) % total;
  for (const v of live) {
    if (point < v.weight) return v;
    point -= v.weight;
  }
  return live[live.length - 1];
}

/** Fill {days} and {name}; drops a dangling ", " when the name is empty. */
export function fillOnboardingTemplate(text: string, vars: { days?: number | null; name?: string | null }): string {
  return text
    .replace(/\{days\}/g, vars.days ? String(vars.days) : "7")
    .replace(/,?\s*\{name\}/g, (m) => (vars.name ? m.replace("{name}", vars.name) : ""))
    .trim();
}
