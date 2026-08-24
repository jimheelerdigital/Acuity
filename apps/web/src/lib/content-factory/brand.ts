/**
 * Content Factory — brand constants (single source of truth).
 *
 * VISUAL_DNA describes the coral-first palette + aesthetic guardrails
 * for image generation prompts. STYLE_LANES define 7 named visual
 * treatments that keep the carousel feed varied while staying on-brand.
 */

// ─── Visual DNA ────────────────────────────────────────────────────────────────
// Appended to every image-generation prompt so the output is recognizably Ripple.

/**
 * Base visual instructions appended to every image prompt.
 * The color scheme is injected separately per carousel via COLOR_SCHEMES.
 */
export const VISUAL_DNA = [
  "This is a premium social media carousel slide. It should look like it was made by a top-tier creative agency — polished, high-class, editorial quality.",
  "The text and illustration must BLEND together as one seamless composition. Vary the layout creatively every time:",
  "  • Text can flow on the left with illustration on the right, or vice versa",
  "  • Text can wrap around a central illustration",
  "  • Text can be stacked in the upper-middle area with illustration below",
  "  • Text can be integrated throughout the scene with elements weaving between lines",
  "  • Be creative with placement — never feel formulaic or templated",
  "TEXT: Bold, clean sans-serif. Perfectly crisp and readable. Use visual hierarchy — key words or numbers can be larger. Spell every word EXACTLY as provided. No warping or distortion.",
  "SAFE ZONES (hard rule — TikTok's interface covers these areas of the image): keep ALL text out of the top 15%, the bottom 15%, AND the right-most 15% of the frame. Text starts BELOW the top 15% line — never at the very top, never touching or cropped by any edge. If the text won't fit, make the type smaller. Text must NEVER overlap any person's face; keep faces fully unobstructed.",
  "ILLUSTRATION: Rendered strictly in the STYLE LOCK art style stated above — never any other style. Diverse women ~35-50, natural expressions. Rich details — plants, candles, mugs, books, sticky notes, cozy domestic elements. Muted warm tones.",
  "QUALITY: Every slide should feel like a page from a premium wellness magazine. Clean, intentional, sophisticated. Not cluttered, not cheap, not templated.",
  "9:16 portrait format. NO watermarks, NO logos, NO extra text beyond what is specified.",
].join("\n");

/**
 * Text-free variant of VISUAL_DNA for the animated pipeline: the words are
 * composited on afterwards (sharp for the JPEG, ffmpeg for the video), so
 * the image must contain ZERO text. The standard VISUAL_DNA cannot be used
 * because it actively instructs the model to render blended typography.
 */
// 2026-08-24, per Keenan: the old NOTEXT DNA forced "one woman mid-activity"
// on every animated slide, so every clip became a push-in on a woman while
// the static pipeline got rich scene storytelling. This version carries the
// static VISUAL_DNA's detail richness and lets the per-slide scene direction
// (written by the topic model) decide the subject — woman OR object scene.
export const VISUAL_DNA_NOTEXT = [
  "This is a premium editorial illustration for a wellness brand — polished, high-class, magazine quality. A single scene, NOT an infographic, NOT a layout, NOT a poster.",
  "ILLUSTRATION: Rendered strictly in the STYLE LOCK art style stated above — never any other style. Rich, intentional details that tell this scene's story — plants, candles, mugs, books, blank sticky notes, phones, blankets, keys, everyday domestic objects — whatever THIS scene calls for. Muted warm tones.",
  "SUBJECT: Follow the scene direction above exactly. When it centers a woman, she is diverse, ~35-50, natural expression, caught mid-moment. When it centers objects or a symbolic still life, there is NO person in the frame — the objects carry the feeling. Never substitute a generic woman-in-a-room when the scene direction says otherwise.",
  "VARIETY: The scene, setting, subject, camera angle, and supporting props must all be DIFFERENT from any other illustration in the series — make this scene distinctly its own.",
  "COMPOSITION: The visual center of interest — any face, and anything important — sits in the LOWER HALF of the frame, never in the top 45%. The entire top 45% stays visually calm and uncluttered — soft background only (a large multi-line text headline will be overlaid there later, and it must never cover the subject).",
  "QUALITY: Like a full-page illustration from a premium wellness magazine. Clean, intentional, sophisticated. Not cluttered, not cheap, not templated.",
  "9:16 portrait format.",
  "IMPORTANT: This image contains absolutely NO text of any kind. No words, no letters, no numbers, no typography, no captions, no labels, no lists, no logos, no watermarks, no writing on any object. Pure illustration only.",
].join("\n");

/**
 * Rotating scene settings for the text-free (animated) pipeline. One is
 * assigned per slide so a 7-slide carousel never repeats the same room —
 * without these, gpt-image-2 defaults every slide to the same cozy
 * living-room composition (seen live 2026-08-11).
 */
export const SCENE_SETTINGS = [
  "Setting: a sunlit kitchen in the morning — she's at the counter, kettle steaming, window light.",
  "Setting: a porch or balcony with plants — she's seated with a mug, open air, soft daylight.",
  "Setting: a bedroom at lamplight — she's winding down on the edge of the bed, warm evening glow.",
  "Setting: outdoors on a quiet walk — park path, trees, golden-hour light.",
  "Setting: a desk by a rainy window — she's paused mid-thought, notebook closed, rain on the glass.",
  // Never IN the tub/shower — clothed-in-bathtub renders looked absurd and
  // the video model made her stand up out of the water (2026-08-12).
  "Setting: a bathroom self-care moment — seated at the mirror or on the closed edge of the tub, fully clothed, towels, soft steam, calm.",
  "Setting: a living room at dusk — she's curled on the sofa under a throw blanket, one lamp on.",
  "Setting: a laundry or hallway in-between moment — basket on hip, pausing, everyday realness.",
] as const;

// ─── Mood taxonomy ─────────────────────────────────────────────────────────────
// Every slide of an animated post carries a mood so the character's facial
// expression (image) and micro-motion (video) match the emotional weight of
// the slide's text — no more joyous women on dreary posts (2026-08-11).

export const MOODS = ["heavy", "tender", "wry", "frustrated", "hopeful"] as const;
export type Mood = (typeof MOODS)[number];

export function isMood(value: unknown): value is Mood {
  return typeof value === "string" && (MOODS as readonly string[]).includes(value);
}

/**
 * Expression/body-language direction appended to the image prompt so
 * gpt-image-2 renders a face that matches the slide's mood instead of
 * defaulting to a smiling, joyful woman.
 */
export const MOOD_EXPRESSIONS: Record<Mood, string> = {
  heavy:
    "Her expression and body language are visibly weary — tired eyes, no smile, shoulders heavy, running on empty but holding it together.",
  tender:
    "Her expression is soft and vulnerable — unguarded, quietly emotional, eyes distant or glistening, no smile.",
  wry: "Her expression is knowing and self-aware — at most a faint, rueful half-smile, a caught-in-the-act honesty. Not joyful, not laughing.",
  frustrated:
    "Her expression is tense and fed up — jaw set, brow slightly furrowed, exhaling through her nose, definitely not smiling.",
  hopeful:
    "Her expression is quietly relieved — a soft, genuine ease settling over her face, shoulders relaxing. Calm and grounded, not giddy or beaming.",
};

/**
 * Cover treatments — composition variants for the COVER slide only,
 * rotated per post so covers stop all looking like the same medium
 * shot. Each keeps a single woman as the subject (the animation
 * prompts reference her), just framed differently.
 */
export const COVER_TREATMENTS = [
  "Cover composition: intimate close-up — her face and shoulders fill most of the frame, eyes toward camera, raw honest expression, shallow depth of field.",
  "Cover composition: medium shot — she's in the scene mid-thought, caught in a real moment, looking just past the camera.",
  "Cover composition: she's lit by warm window light from the side, half her face in soft shadow, quiet and cinematic.",
  "Cover composition: slightly low, dramatic angle — she stands or sits above the viewer, calm and self-possessed, lots of negative space above her.",
  "Cover composition: over-the-shoulder view — we see the scene from just behind her, her profile visible, as if we're in the moment with her.",
] as const;

/**
 * Color schemes — one is picked per carousel so all slides in a carousel
 * share a cohesive palette, but each carousel looks distinct.
 */
export const COLOR_SCHEMES = [
  {
    name: "coral-cream",
    prompt: "Dominant color palette: warm coral (#F97E4E) and soft cream (#FBFAF6). Accents of warm amber. Warm, energetic, inviting.",
    ctaBg: { r: 249, g: 126, b: 78 },
    // Vivid hue for overlay text pops (numbers, badge, underline) — must
    // read loudly against the artwork, so darker schemes borrow their
    // brightest accent instead of the ctaBg color.
    accent: "#F97E4E",
  },
  {
    name: "indigo-cream",
    prompt: "Dominant color palette: muted indigo (#3D3A50) and soft cream (#FBFAF6). Accents of dusty rose. Deep, introspective, evening calm.",
    ctaBg: { r: 61, g: 58, b: 80 },
    accent: "#E8A79E",
  },
  {
    name: "dusty-rose",
    prompt: "Dominant color palette: dusty rose (#D4918A) and warm tan (#F0E6D6). Accents of coral. Soft, feminine, tender warmth.",
    ctaBg: { r: 212, g: 145, b: 138 },
    accent: "#F97E4E",
  },
  {
    name: "amber-tan",
    prompt: "Dominant color palette: warm amber (#D4A76A) and cream (#FBFAF6). Accents of sage green. Golden-hour nostalgia, comforting.",
    ctaBg: { r: 212, g: 167, b: 106 },
    accent: "#E9B45C",
  },
  {
    name: "sage-cream",
    prompt: "Dominant color palette: sage green (#8FA88B) and soft cream (#FBFAF6). Accents of warm amber. Fresh, balanced, renewal.",
    ctaBg: { r: 143, g: 168, b: 139 },
    accent: "#E9B45C",
  },
  {
    name: "deep-purple",
    prompt: "Dominant color palette: deep purple (#5B4A7A) and dusty rose (#D4918A). Accents of cream. Moody, reflective, rich depth.",
    ctaBg: { r: 91, g: 74, b: 122 },
    accent: "#E8A79E",
  },
];

// ─── Style Lanes ───────────────────────────────────────────────────────────────
// Each lane is a prompt prefix that steers the visual treatment. Topics reference
// lanes by key so the feed stays varied across cinematicReal, toon3d, etc.

export const STYLE_LANES = {
  cinematicReal: "Illustrated graphic with soft realistic elements, warm editorial feel, gentle gradients.",
  toon3d: "Soft 3D illustrated graphic, rounded shapes, warm lighting, Pixar-inspired characters and props.",
  claymation: "Illustrated graphic with handmade clay-like textures, soft shadows, tactile warmth.",
  flatGraphic: "Bold flat vector illustration, clean geometric shapes, strong graphic design composition.",
  paperDiorama: "Illustrated graphic with layered paper-craft elements, cut-paper textures, depth through layers.",
} as const;

export type StyleLane = keyof typeof STYLE_LANES;

/**
 * 2026-08-19, per Keenan: the "cartoonish realistic" look (the toon3d
 * lane — Pixar-inspired soft 3D) is outperforming every other format on
 * photos and carousels, so EVERY post renders in it for now. Set to
 * null to restore per-post lane rotation.
 */
export const FORCED_STYLE_LANE: StyleLane | null = "toon3d";

/**
 * Resolve the effective style lane for a post, honoring the override.
 * Use this everywhere a lane is picked or a STYLE_LANES prefix is looked
 * up — stored/seed lanes pass through only when no override is set.
 */
export function resolveStyleLane(lane?: string | null): StyleLane {
  if (FORCED_STYLE_LANE) return FORCED_STYLE_LANE;
  return lane && lane in STYLE_LANES ? (lane as StyleLane) : "cinematicReal";
}
