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
  "  • Text can be stacked at the top with illustration below",
  "  • Text can be integrated throughout the scene with elements weaving between lines",
  "  • Be creative with placement — never feel formulaic or templated",
  "TEXT: Bold, clean sans-serif. Perfectly crisp and readable. Use visual hierarchy — key words or numbers can be larger. Spell every word EXACTLY as provided. No warping or distortion.",
  "ILLUSTRATION: Warm editorial illustration, hand-drawn feel. Diverse women ~35-50, natural expressions. Rich details — plants, candles, mugs, books, sticky notes, cozy domestic elements. Muted warm tones.",
  "QUALITY: Every slide should feel like a page from a premium wellness magazine. Clean, intentional, sophisticated. Not cluttered, not cheap, not templated.",
  "9:16 portrait format. NO watermarks, NO logos, NO extra text beyond what is specified.",
].join("\n");

/**
 * Text-free variant of VISUAL_DNA for the animated pipeline: the words are
 * composited on afterwards (sharp for the JPEG, ffmpeg for the video), so
 * the image must contain ZERO text. The standard VISUAL_DNA cannot be used
 * because it actively instructs the model to render blended typography.
 */
export const VISUAL_DNA_NOTEXT = [
  "This is a premium editorial illustration for a wellness brand — polished, high-class, magazine quality. A single scene, NOT an infographic, NOT a layout, NOT a poster.",
  "ILLUSTRATION: Warm editorial illustration, hand-drawn feel. One diverse woman ~35-50, natural expression, mid-activity. Muted warm tones. The scene, setting, activity, camera angle, and supporting props must all be DIFFERENT from any other illustration in the series — make this scene distinctly its own.",
  "COMPOSITION: The subject and detail sit in the middle and lower portions of the frame. The top third stays visually calm and uncluttered — soft background only.",
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
  "Setting: a bathroom self-care moment — bath or mirror, towels, soft steam, calm.",
  "Setting: a living room at dusk — she's curled on the sofa under a throw blanket, one lamp on.",
  "Setting: a laundry or hallway in-between moment — basket on hip, pausing, everyday realness.",
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
