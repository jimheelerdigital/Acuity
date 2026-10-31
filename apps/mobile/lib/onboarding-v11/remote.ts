import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  sanitizeOverrides,
  type OnboardingConfigResponse,
  type OnboardingOverrides,
} from "@acuity/shared";

import { api } from "@/lib/api";
import { getInstallId } from "@/lib/install-id";
import { setV10Assignment } from "@/lib/onboarding-v10/analytics";

import { AGE, CARRYING, HOOK, NOT_LAZY, PAYWALL, READY, SOUND, YEAR } from "./copy";
import { setV11Order } from "./flow";

/**
 * Server-controlled onboarding (2026-10-31, per Keenan: "change the
 * onboarding funnel directly within our app WITHOUT ever having to do an app
 * update"). Edited at goripple.io/admin/app-onboarding, served by
 * GET /api/app/onboarding-config, shape in packages/shared/src/app-onboarding.ts.
 *
 * How it applies: the overrides are written INTO the copy objects the
 * screens already import (copy.ts) and the screen order (flow.ts), so the
 * screens need no changes beyond the paywall. That's why it must run before
 * the first question renders: start.tsx calls prepareRemoteOnboarding() on
 * mount, and it locks once the questions begin so nobody sees words change
 * mid-funnel.
 *
 * Can't break onboarding: a slow, failed or garbage response leaves the
 * bundled words in place. The last good response is cached so the next
 * launch has it immediately. Only text and order are editable; ids, icons
 * and screen types stay in the app.
 */

const CACHE_KEY = "ripple.onboarding_remote_v1";
const FETCH_TIMEOUT_MS = 2500;

let applied = false;
let locked = false;

/** Deep copy of the bundled words, taken before anything is applied. */
const BUNDLED = JSON.parse(JSON.stringify({ HOOK, AGE, CARRYING, SOUND, NOT_LAZY, YEAR, READY, PAYWALL }));

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
function m<T>(x: T): Mutable<T> {
  return x as Mutable<T>;
}

/** Put the bundled words back (before applying a different variant). */
function resetToBundled(): void {
  Object.assign(m(HOOK), BUNDLED.HOOK);
  Object.assign(m(AGE), { title: BUNDLED.AGE.title });
  AGE.options.forEach((opt, i) => (m(opt).label = BUNDLED.AGE.options[i].label));
  Object.assign(m(CARRYING), { title: BUNDLED.CARRYING.title, sub: BUNDLED.CARRYING.sub });
  CARRYING.options.forEach((opt, i) => (m(opt).label = BUNDLED.CARRYING.options[i].label));
  Object.assign(m(SOUND), BUNDLED.SOUND);
  Object.assign(m(NOT_LAZY), { ...BUNDLED.NOT_LAZY, things: [...BUNDLED.NOT_LAZY.things] });
  Object.assign(m(YEAR), { eyebrow: BUNDLED.YEAR.eyebrow, cta: BUNDLED.YEAR.cta });
  YEAR.rows.forEach((row, i) => Object.assign(m(row), { title: BUNDLED.YEAR.rows[i].title, text: BUNDLED.YEAR.rows[i].text }));
  Object.assign(m(READY), BUNDLED.READY);
  Object.assign(m(PAYWALL), BUNDLED.PAYWALL);
  setV11Order(null);
}

/** Write overrides into the copy objects. Unknown option ids are ignored. */
export function applyOnboardingOverrides(o: OnboardingOverrides): void {
  resetToBundled();
  if (o.hook) Object.assign(m(HOOK), o.hook);
  if (o.age?.title) m(AGE).title = o.age.title;
  for (const opt of AGE.options) {
    const label = o.age?.options?.[opt.id];
    if (label) m(opt).label = label;
  }
  if (o.carrying?.title) m(CARRYING).title = o.carrying.title;
  if (o.carrying?.sub) m(CARRYING).sub = o.carrying.sub;
  for (const opt of CARRYING.options) {
    const label = o.carrying?.options?.[opt.id];
    if (label) m(opt).label = label;
  }
  if (o.sound) Object.assign(m(SOUND), o.sound);
  if (o.notLazy) {
    const { things, ...text } = o.notLazy;
    Object.assign(m(NOT_LAZY), text);
    if (things && things.length >= 4) m(NOT_LAZY).things = things;
  }
  if (o.year) {
    if (o.year.eyebrow) m(YEAR).eyebrow = o.year.eyebrow;
    if (o.year.cta) m(YEAR).cta = o.year.cta;
    o.year.rows?.forEach((r, i) => {
      if (r && YEAR.rows[i]) Object.assign(m(YEAR.rows[i]), r);
    });
  }
  if (o.ready) Object.assign(m(READY), o.ready);
  if (o.paywall) Object.assign(m(PAYWALL), o.paywall);
  setV11Order(o.order ?? null);
}

function use(resp: OnboardingConfigResponse | null): void {
  if (!resp || locked) return;
  applyOnboardingOverrides(sanitizeOverrides(resp.overrides));
  setV10Assignment(typeof resp.variant === "string" && resp.variant ? resp.variant : "baseline");
  applied = true;
}

/**
 * Apply the cached config at once, then fetch a fresh one (up to 2.5s).
 * Call on the start screen. Never throws.
 */
export async function prepareRemoteOnboarding(): Promise<void> {
  if (locked) return;
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached && !applied) use(JSON.parse(cached) as OnboardingConfigResponse);
  } catch {
    // A bad cache is just ignored.
  }
  try {
    const installId = await getInstallId();
    const fresh = await Promise.race([
      api.get<OnboardingConfigResponse>(`/api/app/onboarding-config?installId=${encodeURIComponent(installId)}`),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
    ]);
    if (fresh && typeof fresh === "object") {
      use(fresh);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
    }
  } catch {
    // Offline or server error: the bundled (or cached) words stay.
  }
}

/** Freeze the words for the rest of this funnel. Called when the first question opens. */
export function lockRemoteOnboarding(): void {
  locked = true;
}
