/**
 * AdLab LOOK LIBRARY (2026-10-05, per Keenan: "we need an overhaul of the
 * creativity of the ad image builder... it spits out virtually the same ad
 * look and feel every time" → "make it even more variable. the more variance
 * the better").
 *
 * Before: 10 slots per lane, each with a FIXED format, one photo style per
 * lane and one design per code-drawn format, so every Sunday produced the
 * same 10 layouts (86 ads, 5 looks; every photo a dim desk with a planner).
 *
 * Now the slot keeps its proven HOOK angle and the LOOK is assigned per ad:
 *   - ~30 looks in five families (phone-native, paper/real-world,
 *     editorial/type, photo, code-drawn);
 *   - no look twice in a batch, looks used in the last 2 weeks avoided,
 *     at most 3 per family and at most 2 photo looks per batch;
 *   - every look is further randomized per ad: palette, type style, CTA
 *     style, and for photos the scene, light and camera.
 * The writer is told each slot's look and which copy fields it needs.
 * formatKey = the look key, so the learning loop can rank looks.
 *
 * Research basis (reports/Subscription app ad creative conversion.md):
 * native, "looks like a real person made it" statics (notes, text walls,
 * infographics, letters, social-post mockups) win for apps; AI is the
 * SETTING, never the subject (no AI faces). Nothing here fabricates
 * third-party proof: no review cards, ratings, press or posts with usernames.
 */

import type { AdImageCopy, BatchGroupKey, GroupConfig } from "./weekly-batch";
import { SAFE_ZONE_RULES } from "./ad-render";

export type LookFamily = "native" | "paper" | "editorial" | "photo" | "code";
/** Copy fields a look needs beyond headline / solutionLine / CTA. */
export type LookNeeds = "none" | "benefits" | "lines" | "said" | "stats";

export interface LookVariant {
  palette: string;
  type: string;
  cta: string;
  light: string;
  camera: string;
  scene: string;
}

export interface AdLook {
  key: string;
  label: string;
  family: LookFamily;
  needs: LookNeeds;
  /** Prompt for the image model (code-drawn looks return a marker instead). */
  build: (c: AdImageCopy, g: GroupConfig, v: LookVariant) => string;
}

// ─── Variation pools ─────────────────────────────────────────────────────

export const PALETTES = [
  "warm cream with a terracotta accent",
  "soft blush pink with deep burgundy",
  "sage green with off-white",
  "bright coral with white",
  "pale sky blue with navy",
  "mustard yellow with charcoal",
  "near-black charcoal with a warm amber accent",
  "bone white with heavy black and one red accent",
  "deep navy with bright orange",
  "olive green with cream",
  "electric blue with white",
  "lilac with deep purple",
  "mint with forest green",
  "tomato red with cream",
  "sand beige with chocolate brown",
  "black with neon lime",
  "butter yellow with cobalt blue",
  "dusty rose with olive",
  "teal with mustard",
  "pure white with one cobalt accent",
  "kraft-paper brown with black",
  "peach with deep teal",
  "graphite grey with hot pink",
  "cream with forest green and gold",
  "powder blue with tomato red",
  "ink black with off-white and a single orange dot",
];

export const TYPE_STYLES = [
  "heavy bold grotesque sans-serif",
  "tall condensed all-caps sans-serif",
  "elegant high-contrast editorial serif",
  "rounded friendly geometric sans-serif",
  "monospace typewriter type",
  "editorial serif with italic accents",
  "chunky retro display type",
  "thick handwritten marker lettering",
  "clean Swiss neo-grotesque, tight tracking",
  "warm humanist sans-serif",
  "bold slab serif",
  "mixed: big serif headline, small sans-serif details",
];

export const CTA_STYLES = [
  "a rounded solid pill button",
  "an outlined pill button",
  "an underlined text link with an arrow, no button",
  "a small sticker-style badge, slightly rotated",
  "a square solid block button",
  "a hand-drawn arrow pointing to the words",
  "no button at all (the platform adds its own); keep the label as a small line of text near the bottom",
];

const LIGHTS = [
  "soft weekday-morning daylight",
  "flat overcast daylight",
  "warm golden-hour light",
  "bright midday sun with hard shadows",
  "cool office fluorescent light",
  "blue-hour light through a window",
  "direct phone-flash snapshot",
  "warm evening kitchen light",
];

const CAMERAS = [
  "overhead flat lay, straight down",
  "eye-level candid phone snapshot, slightly imperfect framing",
  "low angle, close to the surface",
  "close-up macro on one object with shallow depth of field",
  "wide shot showing the whole place",
  "shot through a window or doorway",
  "handheld, slightly tilted, like it was taken in a hurry",
];

const SCENES: Record<BatchGroupKey, string[]> = {
  women: [
    "a car at school pickup: dashboard, keys, a half-eaten granola bar, a permission slip on the passenger seat",
    "a kitchen counter at 7am: lunchboxes half packed, a phone, a calendar on the fridge behind",
    "a grocery cart in a supermarket aisle with a crumpled list in the child seat",
    "a home office corner with a laptop, a mug and sticky notes along the monitor edge",
    "a laundry basket on a bed next to a phone showing a calendar",
    "a front hallway: school bags, shoes, a stack of mail on a small table",
    "a soccer field sideline: folding chair, water bottle, a phone on the seat",
    "a pharmacy-free bathroom counter at night: toothbrushes and a phone with reminders",
    "a parked car in a work parking lot, a work badge on the dash",
    "a dining table covered in homework, bills and a laptop",
    "a park bench with a coffee and a phone, autumn leaves",
    "a desk calendar with three things circled on the same day",
    "a dog leash, keys and a phone on a hook by the door",
    "a train or bus window seat with a phone and a tote bag",
    "a waiting-room chair (not medical-looking) with a handbag and a phone",
    "a fridge door covered in magnets, invites and a school schedule",
  ],
  men: [
    "an empty gym bench with chalk and a water bottle",
    "running shoes by an apartment door at dawn",
    "a desk with a laptop, a coffee and a half-crossed list",
    "a car interior in a parking garage before work",
    "a kitchen counter with meal-prep containers and a phone",
    "a bedside table with a phone face up and an alarm screen",
    "a city sidewalk in early morning, a coffee cup on a bench",
    "a garage workbench with tools and a notebook",
    "a basketball court with a ball and a gym bag",
    "a bookshelf with one book pulled halfway out",
    "a minimalist apartment with a pull-up bar in the doorway",
    "a bike leaning on a wall with a helmet on the seat",
    "a coworking desk with headphones and a planner",
    "a sofa with a game controller and a phone glowing",
    "a fridge with a whiteboard plan stuck to it",
    "a rooftop at sunrise with a jump rope and a towel",
  ],
};

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** A fresh random variant for one ad. */
export function randomVariant(groupKey: BatchGroupKey, rng: () => number = Math.random): LookVariant {
  return {
    palette: pick(PALETTES, rng),
    type: pick(TYPE_STYLES, rng),
    cta: pick(CTA_STYLES, rng),
    light: pick(LIGHTS, rng),
    camera: pick(CAMERAS, rng),
    scene: pick(SCENES[groupKey], rng),
  };
}

// ─── Shared prompt pieces ────────────────────────────────────────────────

const ctaText = (c: AdImageCopy) => (c.cta === "LEARN_MORE" ? "Learn more" : "Start free trial");

const textRules = (v: LookVariant) => `TEXT RENDERING RULES (critical):
- Render every quoted string EXACTLY as written: correct spelling, no words added, none dropped.
- Typography: ${v.type}. High contrast, easily legible on a phone.
- No other text anywhere in the image beyond the strings specified (no fake brand names, no extra captions, no usernames, likes, ratings or stars).
- No logos, no watermarks, no identifiable faces. Hands may appear only small and out of focus.
- No medicine, pills, supplements or medical objects (Meta health policy).
- ${SAFE_ZONE_RULES}`;

const ctaLine = (c: AdImageCopy, v: LookVariant) => `- Call to action, styled as ${v.cta}: "${ctaText(c)}"`;
const sub = (c: AdImageCopy) => c.solutionLine ?? c.description;
const three = (c: AdImageCopy, g: GroupConfig) => (c.benefits && c.benefits.length >= 3 ? c.benefits.slice(0, 3) : g.overlayValueProps);
const lns = (c: AdImageCopy) => (c.lines ?? []).slice(0, 6);
const stats = (c: AdImageCopy) => (c.stats ?? []).slice(0, 3);

// ─── The looks ───────────────────────────────────────────────────────────

const L: AdLook[] = [
  // NATIVE / PHONE
  {
    key: "look-imessage",
    label: "iMessage thread",
    family: "native",
    needs: "lines",
    build: (c, g, v) => `A realistic phone screenshot of a messaging app conversation, vertical 2:3. Light or dark mode to suit ${v.palette}. Chat bubbles alternate between a friend (grey, left) and me (colored, right), one bubble per line below, in this order:
${lns(c).map((l, i) => `- ${i % 2 === 0 ? "Friend" : "Me"}: "${l}"`).join("\n")}
Above the conversation, as a bold caption overlay on a ${v.palette} band: "${c.headline}"
Below the conversation, a small caption: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`,
  },
  {
    key: "look-lockscreen",
    label: "Lock-screen notifications",
    family: "native",
    needs: "benefits",
    build: (c, g, v) => {
      const b = three(c, g);
      return `A realistic smartphone lock screen photographed flat-on, vertical 2:3: a ${v.palette} abstract wallpaper, a big clock, and a stack of three notification cards from the app "Ripple" (generic rounded app icon, no logo):
- "${b[0]}"
- "${b[1]}"
- "${b[2]}"
Bold headline above the clock: "${c.headline}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-voice-memo",
    label: "Voice memo + transcript",
    family: "native",
    needs: "said",
    build: (c, g, v) => `A clean phone screen showing a voice recording in progress, vertical 2:3, ${v.palette} colors: a big audio waveform, a red record dot, and below it a live transcript in a speech-bubble card: "${c.said ?? c.headline}"
Under the transcript, a small card titled "Ripple caught:" with three checked lines: ${(c.caught ?? three(c, g)).slice(0, 3).map((x) => `"${x}"`).join(", ")}
Bold headline at the top: "${c.headline}"
${ctaLine(c, v)}
${textRules(v)}`,
  },
  {
    key: "look-search",
    label: "Search bar + autocomplete",
    family: "native",
    needs: "benefits",
    build: (c, g, v) => {
      const b = three(c, g);
      return `A minimal web search page on a phone, vertical 2:3, ${v.palette} background, a large rounded search bar containing the typed text: "${c.headline}"
Under it, a dropdown of three autocomplete suggestions with small magnifying-glass icons:
- "${b[0]}"
- "${b[1]}"
- "${b[2]}"
A small caption lower down: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-calendar",
    label: "Week calendar filling up",
    family: "native",
    needs: "benefits",
    build: (c, g, v) => {
      const b = three(c, g);
      return `A clean week-view calendar app screenshot, vertical 2:3, ${v.palette} accents. Three event blocks on different days, each labeled:
- "${b[0]}"
- "${b[1]}"
- "${b[2]}"
Bold headline above the calendar: "${c.headline}"
A small line under it: "Said out loud. Put on the calendar."
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-wrapped",
    label: "\"Your week, wrapped\" recap",
    family: "native",
    needs: "stats",
    build: (c, g, v) => {
      const s = stats(c);
      return `A bold, colorful year-in-review-style story card about ONE week, vertical 2:3, big gradient shapes in ${v.palette}. Big title: "${c.headline}"
Three huge stat blocks, each a big number with a small label:
${s.map((x) => `- "${x.value}" / "${x.label}"`).join("\n")}
One line at the bottom: "${c.insight ?? sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-reminders",
    label: "Reminders checklist app",
    family: "native",
    needs: "benefits",
    build: (c, g, v) => {
      const b = three(c, g);
      return `A realistic reminders/checklist app screenshot, vertical 2:3, ${v.palette} theme. List title: "${c.headline}"
Items with round checkboxes (first one checked, others open):
- "${b[0]}"
- "${b[1]}"
- "${b[2]}"
A small footer line: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  // PAPER / REAL WORLD
  {
    key: "look-sticky-note",
    label: "Handwritten sticky note photo",
    family: "paper",
    needs: "none",
    build: (c, g, v) => `A real photo, vertical 2:3: one square sticky note (color to suit ${v.palette}) stuck on ${v.scene}. ${v.light}, ${v.camera}. The note is handwritten in marker: "${c.headline}"
Below the note, as a clean overlay caption in ${v.type}: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`,
  },
  {
    key: "look-notebook",
    label: "Lined notebook page",
    family: "paper",
    needs: "lines",
    build: (c, g, v) => `A real photo of an open lined notebook page, vertical 2:3, ${v.light}, ${v.camera}, a pen beside it. Handwritten in ink, one line each, some crossed out:
Title at top, underlined: "${c.headline}"
${lns(c).map((l) => `- "${l}"`).join("\n")}
A clean printed overlay strip near the bottom in ${v.palette}: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`,
  },
  {
    key: "look-receipt",
    label: "Receipt of the week",
    family: "paper",
    needs: "benefits",
    build: (c, g, v) => {
      const b = three(c, g);
      return `A long thermal paper receipt lying on a ${v.palette} surface, real photo, ${v.light}, vertical 2:3. Printed in receipt type:
Header: "${c.headline}"
Three line items with dotted leaders and a check mark instead of a price:
- "${b[0]}"
- "${b[1]}"
- "${b[2]}"
Footer line: "TOTAL: handled."
Under the receipt, a clean caption: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-whiteboard",
    label: "Whiteboard list",
    family: "paper",
    needs: "benefits",
    build: (c, g, v) => {
      const b = three(c, g);
      return `A real photo of a small whiteboard in ${v.scene.split(":")[0]}, ${v.light}, vertical 2:3, a marker on the tray. Marker writing:
Big title: "${c.headline}"
Three lines with boxes:
- "${b[0]}"
- "${b[1]}"
- "${b[2]}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-bingo",
    label: "Bingo card",
    family: "paper",
    needs: "lines",
    build: (c, g, v) => `A printed bingo card, vertical 2:3, ${v.palette}, flat graphic style. Title above the grid: "${c.headline}"
A 2x3 grid of squares, each with one of these phrases (a few stamped with a circle as if marked):
${lns(c).slice(0, 6).map((l) => `- "${l}"`).join("\n")}
Under the grid: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`,
  },
  {
    key: "look-chalkboard",
    label: "Chalkboard menu",
    family: "paper",
    needs: "benefits",
    build: (c, g, v) => {
      const b = three(c, g);
      return `A café-style chalkboard sign, real photo, ${v.light}, vertical 2:3, chalk lettering with small doodles. Title: "${c.headline}"
Three menu lines:
- "${b[0]}"
- "${b[1]}"
- "${b[2]}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-polaroid",
    label: "Polaroid snapshot",
    family: "paper",
    needs: "none",
    build: (c, g, v) => `A single instant-film photo lying on a ${v.palette} surface, vertical 2:3. The instant photo shows ${v.scene} (${v.light}, no people). Handwritten on the white border below the picture: "${c.headline}"
A clean caption under the photo: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`,
  },
  // EDITORIAL / TYPE
  {
    key: "look-newspaper",
    label: "Newspaper front page",
    family: "editorial",
    needs: "none",
    build: (c, g, v) => `A newspaper front page, vertical 2:3, aged off-white newsprint, classic layout with columns of blurred, unreadable body text. A neutral masthead reading only: "THE WEEKLY"
Huge banner headline: "${c.headline}"
Subhead under it: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`,
  },
  {
    key: "look-magazine",
    label: "Magazine cover",
    family: "editorial",
    needs: "benefits",
    build: (c, g, v) => {
      const b = three(c, g);
      return `A bold magazine cover, vertical 2:3, ${v.palette}, cover photo of ${v.scene} (${v.light}, no people). Masthead: "YOUR WEEK"
Main cover line: "${c.headline}"
Three smaller cover lines down the side:
- "${b[0]}"
- "${b[1]}"
- "${b[2]}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-poster",
    label: "Swiss poster",
    family: "editorial",
    needs: "none",
    build: (c, g, v) => `A graphic design poster, vertical 2:3, ${v.palette}, bold geometric shapes and grid lines, no photo. Huge headline set as the main graphic: "${c.headline}"
Small supporting line: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`,
  },
  {
    key: "look-handwritten",
    label: "Big handwritten card",
    family: "editorial",
    needs: "none",
    build: (c, g, v) => `A real photo of a large paper card on a ${v.palette} background, ${v.light}. The headline is written by hand in thick marker, filling most of the card: "${c.headline}"
A small neat printed line below: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`,
  },
  {
    key: "look-chart",
    label: "Hand-drawn chart",
    family: "editorial",
    needs: "stats",
    build: (c, g, v) => {
      const s = stats(c);
      return `A hand-drawn chart on graph paper, vertical 2:3, ${v.palette} ink, real photo. A simple bar chart with three bars labeled:
${s.map((x) => `- "${x.label}" with the value "${x.value}"`).join("\n")}
Title above: "${c.headline}"
A handwritten note with an arrow pointing at one bar: "${c.insight ?? sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-flowchart",
    label: "Simple flowchart",
    family: "editorial",
    needs: "benefits",
    build: (c, g, v) => {
      const b = three(c, g);
      return `A clean, playful flowchart graphic, vertical 2:3, ${v.palette}, rounded boxes and arrows. Title: "${c.headline}"
Box 1: "You say it out loud" → Box 2: "Ripple" → three output boxes:
- "${b[0]}"
- "${b[1]}"
- "${b[2]}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-split",
    label: "Two-panel split (in your head vs with Ripple)",
    family: "editorial",
    needs: "benefits",
    build: (c, g, v) => {
      const b = three(c, g);
      return `A two-panel split image, vertical 2:3, top panel messy and chaotic (scribbled, overlapping words like "dentist?" "form??" "tomorrow" in grey), bottom panel calm and ordered in ${v.palette}.
Label on top panel: "In your head"
Label on bottom panel: "With Ripple", followed by three neat checked lines:
- "${b[0]}"
- "${b[1]}"
- "${b[2]}"
Headline across the middle seam: "${c.headline}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-facts-label",
    label: "Nutrition-facts style label",
    family: "editorial",
    needs: "stats",
    build: (c, g, v) => {
      const s = stats(c);
      return `A label styled exactly like a food nutrition-facts panel (black rules, bold heavy type), on a ${v.palette} background, vertical 2:3. Panel title: "${c.headline}"
Rows:
${s.map((x) => `- "${x.label}" ............ "${x.value}"`).join("\n")}
Bottom note in the panel: "${c.insight ?? sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-report-card",
    label: "School report card",
    family: "editorial",
    needs: "stats",
    build: (c, g, v) => {
      const s = stats(c);
      return `A printed school report card on paper, vertical 2:3, ${v.palette} accents, real photo, ${v.light}. Title: "${c.headline}"
Rows with a grade-style value:
${s.map((x) => `- "${x.label}": "${x.value}"`).join("\n")}
Teacher's comment line (handwritten): "${c.insight ?? sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  // PHOTO
  {
    key: "look-photo-hook",
    label: "Real-place photo + hook",
    family: "photo",
    needs: "none",
    build: (c, g, v) => `Direct-response social ad, vertical 2:3. Background: a real phone photo of ${c.imageScene && c.imageScene !== "n/a" ? c.imageScene : v.scene}. ${v.light}, ${v.camera}. No people, no faces. It must look like a real photo someone took, not an AI render or stock image. Not dark or moody unless the light calls for it.
Bold headline across the upper third: "${c.headline}"
A line in the lower third: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`,
  },
  {
    key: "look-photo-list",
    label: "Real-place photo + list",
    family: "photo",
    needs: "benefits",
    build: (c, g, v) => {
      const b = three(c, g);
      return `Social ad, vertical 2:3. Background: a real photo of ${v.scene}, ${v.light}, ${v.camera}, no people. A translucent ${v.palette} panel holds:
Headline: "${c.headline}"
Three checked lines:
- "${b[0]}"
- "${b[1]}"
- "${b[2]}"
${ctaLine(c, v)}
${textRules(v)}`;
    },
  },
  {
    key: "look-photo-caption",
    label: "Photo with a social caption bar",
    family: "photo",
    needs: "none",
    build: (c, g, v) => `A vertical 2:3 real photo of ${v.scene}, ${v.light}, ${v.camera}, no people, with a simple white caption bar across the top like a meme-style caption (no usernames, no likes): "${c.headline}"
A small line at the bottom over the photo: "${sub(c)}"
${ctaLine(c, v)}
${textRules(v)}`,
  },
  // Typographic card (the old statement card, now with type + palette variety).
  {
    key: "look-statement",
    label: "Bold statement card",
    family: "editorial",
    needs: "none",
    build: (c, g, v) => `Typographic social ad, vertical 2:3, flat ${v.palette} background, no photo. Huge statement filling most of the frame: "${c.headline}"
Smaller line beneath: "${sub(c)}"
${ctaLine(c, v)}
Tiny brand name in a corner: "Ripple"
${textRules(v)}`,
  },
];

/** Code-drawn looks (ad-render.ts). Prompt = a stored marker only. */
const CODE_LOOKS: AdLook[] = [
  { key: "say-catch", label: "You say it → Ripple catches it", family: "code", needs: "said", build: (c) => `SAY_CATCH (composed in code, no image model): headline "${c.headline}", said "${c.said ?? ""}".` },
  { key: "text-wall", label: "Phone note text wall", family: "code", needs: "lines", build: (c) => `TEXT_WALL (composed in code, no image model): headline "${c.headline}".` },
  { key: "weekly-report", label: "Weekly report infographic", family: "code", needs: "stats", build: (c) => `WEEKLY_REPORT (composed in code, no image model): headline "${c.headline}".` },
  { key: "app-proof", label: "Real app screenshot", family: "code", needs: "none", build: (c) => `APP_PROOF (composed in code, no image model): headline "${c.headline}".` },
];

export const LOOKS: AdLook[] = [...L, ...CODE_LOOKS];
export const LOOK_KEYS = LOOKS.map((l) => l.key);

export function lookByKey(key: string | null | undefined): AdLook | undefined {
  return key ? LOOKS.find((l) => l.key === key) : undefined;
}

/** True when the copy has what the look needs. */
export function copyFitsLook(look: AdLook, c: AdImageCopy): boolean {
  switch (look.needs) {
    case "lines":
      return (c.lines?.length ?? 0) >= 3;
    case "benefits":
      return (c.benefits?.length ?? 0) >= 3;
    case "said":
      return !!c.said && (c.caught?.length ?? 0) >= 1;
    case "stats":
      return (c.stats?.length ?? 0) === 3 && !!c.insight;
    default:
      return true;
  }
}

/** What the writer must fill for a look (shown per slot in the batch prompt). */
export function lookNeedsText(look: AdLook): string {
  switch (look.needs) {
    case "lines":
      return "REQUIRES lines: 4-6 short first-person lines (≤60 chars each) that fit this look";
    case "benefits":
      return "REQUIRES benefits: exactly 3 lines (≤40 chars each) that fit this look";
    case "said":
      return "REQUIRES said + caught";
    case "stats":
      return "REQUIRES stats (exactly 3) + insight";
    default:
      return "headline + solutionLine only";
  }
}

/**
 * Assign one look per slot: no repeats in the batch, looks used in the
 * last two weeks avoided where possible, ≤3 per family, ≤2 photo, ≤2 code.
 */
export function assignLooks(n: number, recentKeys: Set<string>, rng: () => number = Math.random): AdLook[] {
  const caps: Record<LookFamily, number> = { native: 3, paper: 3, editorial: 3, photo: 2, code: 2 };
  const used: Record<LookFamily, number> = { native: 0, paper: 0, editorial: 0, photo: 0, code: 0 };
  const shuffled = [...LOOKS].sort(() => rng() - 0.5);
  const fresh = shuffled.filter((l) => !recentKeys.has(l.key));
  const stale = shuffled.filter((l) => recentKeys.has(l.key));
  const out: AdLook[] = [];
  for (const pool of [fresh, stale]) {
    for (const l of pool) {
      if (out.length >= n) break;
      if (out.includes(l) || used[l.family] >= caps[l.family]) continue;
      out.push(l);
      used[l.family]++;
    }
  }
  // Caps can leave the batch short only if the library is tiny; fill anyway.
  for (const l of shuffled) if (out.length < n && !out.includes(l)) out.push(l);
  return out;
}

/** A look that only needs the headline, unused in this batch (fallback when copy misses fields). */
export function fallbackLook(usedKeys: Set<string>, rng: () => number = Math.random): AdLook {
  const opts = LOOKS.filter((l) => l.needs === "none" && l.family !== "code" && !usedKeys.has(l.key));
  return opts.length ? opts[Math.floor(rng() * opts.length)] : lookByKey("look-statement")!;
}

export function buildLookPrompt(look: AdLook, c: AdImageCopy, g: GroupConfig, v: LookVariant): string {
  return look.build(c, g, v);
}
