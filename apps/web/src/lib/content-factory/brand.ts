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

// ─── Selfie slideshow (2026-08-25, per Keenan) ────────────────────────────────
// A realistic first-person "this is how i ..." photo slideshow: one
// consistent, believable woman taking mirror selfies. The whole point is
// that it does NOT look AI-generated or branded — it must read like a
// real person's photo dump. Captions are burned on afterwards by
// compose.ts (renderSelfieCaptionOverlay), so images stay text-free.

/**
 * The fixed persona for the selfie avatar. Kept in code (not the topic
 * model) so every post features the same recognizable woman. Slide 1 of
 * the previous selfie post is also passed as an image reference at
 * generation time, which does the heavy lifting for identity — this
 * text is the fallback description and the guardrail.
 */
export const SELFIE_PERSONA =
  "The SAME woman appears in every photo of this series: mid-40s, shoulder-length brown hair with natural greying strands, average realistic body. Her face is NEVER visible — her raised phone completely covers it in every photo, so her identity reads through her hair, build, and everyday clothes (soft sweatshirts, tees, leggings, jeans — nothing styled or aspirational). ONLY her identity repeats across the series — her pose, outfit, framing, room, and lighting are DIFFERENT in every photo, like a real camera roll.";

/**
 * Pose/framing directives rotated across selfie covers (2026-08-28, per
 * Keenan: the phone must COVER her face in every selfie, only ONE
 * selfie per slideshow). Every entry is a mirror selfie with the raised
 * phone hiding her face — identity persists through hair, build, and
 * clothes plus the previous cover's raw as an image reference. Variance
 * lives in framing, posture, room, and light, never in showing her
 * face.
 */
export const SELFIE_POSE_VARIANTS = [
  "FULL-LENGTH from several steps back — whole body and feet visible in a floor mirror, phone raised directly in front of her face and fully covering it, weight on one hip",
  "close waist-up shot, phone held up square over her face so it's completely hidden, elbow out, shoulders relaxed",
  "sitting cross-legged on the floor in front of the mirror, phone raised in one hand covering her whole face, back slightly rounded",
  "leaning a shoulder against the wall next to the mirror, body at a three-quarter angle, phone up over her face hiding it, free hand in a pocket",
  "caught mid-motion fixing her hair with the free hand, phone raised in front of her face and blocking it, slightly imperfect candid framing",
  "dim room with the phone FLASH ON — harsh flash bloom in the mirror washing out the phone that covers her face, cooler color cast",
  "standing off-center with lots of room in frame, phone angled up in front of her face so none of it shows, other hand hanging loose",
  "sitting on the edge of her bed facing the mirror, elbows resting on her knees, phone lifted in both hands directly in front of her face",
  "raising her mug toward the mirror in a small cheers gesture with her free hand, phone held over her face hiding it completely",
  "free hand giving a little shrug — palm turned up, phone raised square in front of her face so it's fully covered",
] as const;

/**
 * How many leading SELFIE_POSE_VARIANTS entries are cover-eligible.
 * Every pose is now a phone-over-face mirror selfie (2026-08-28), so
 * the whole pool qualifies.
 */
export const SELFIE_COVER_POSE_COUNT = SELFIE_POSE_VARIANTS.length;

/**
 * Realism DNA for the selfie slideshow. Everything here fights
 * gpt-image-2's default polish — the output must look like an amateur
 * phone photo, not a portrait session.
 */
export const SELFIE_VISUAL_DNA = [
  "This is a REAL amateur smartphone photo of a real woman — a mirror selfie, an ordinary photo from her own camera roll, posted to her own Instagram. It must be indistinguishable from a genuine phone photo.",
  "PHOTOGRAPHY: shot on a phone camera. Natural imperfect framing, slightly off-center, honest angles. Natural light only — window light, bathroom vanity light, warm lamp — with realistic shadows. Slight sensor grain, mild soft focus, true-to-life colors. Real skin texture with pores and fine lines. NO studio lighting, NO beauty retouching, NO professional composition, NO cinematic color grading, NO shallow-depth-of-field portrait look.",
  "SETTING: her real, lived-in world — a slightly cluttered home (counters, a towel on a hook, cables, door frames, normal furniture). Authentic and unglamorous, never staged or magazine-styled.",
  "THE MIRROR IS A LITTLE DIRTY: light smudges, a few fingerprints, specks of dust, maybe a faint streak catching the light — the way a real, lived-with mirror actually looks. Subtle and realistic, not filthy.",
  "HER FACE IS COVERED: her raised phone is directly in front of her face and completely hides it — no eyes, nose, or mouth visible. Her identity reads through her hair, build, and everyday clothes, never her face.",
  "VARIANCE: real people never take the same selfie twice. This photo must have its own distinct posture, camera distance, angle, outfit, room, and light compared to her other posts.",
  "9:16 vertical portrait, exactly like a phone photo.",
  "IMPORTANT: absolutely NO text anywhere in the image — no words, letters, numbers, phone-screen UI, logos, or watermarks. The phone screen faces away or is dark.",
].join("\n");

/**
 * DNA for the AESTHETIC slides mixed into the selfie slideshow
 * (2026-08-25, per Keenan: "hyper realistic aesthetic images in there
 * as well… super pleasing to the eye"). Still a believable phone photo
 * — but the beautiful kind a real woman would proudly post: golden
 * light, cozy textures, satisfying composition. NO people (the avatar
 * only ever appears in the mirror-selfie slides, so her identity
 * never drifts).
 */
export const SELFIE_AESTHETIC_DNA = [
  "This is a hyper-realistic, beautiful phone photo — the kind of aesthetic shot a real woman posts in a photo dump. Genuinely pleasing to the eye: warm natural light, soft golden tones, cozy real textures, satisfying composition.",
  "PHOTOGRAPHY: shot on a modern phone camera. True-to-life detail and realistic depth — crisp subject, naturally soft background. Golden-hour window light, warm lamplight, or soft morning light. Real materials: steam, linen, wood grain, ceramic, condensation, page texture. It must still read as a photograph, never as a render or illustration.",
  "SUBJECT: first-person / POV or still-life only — her coffee, her journal, her walk, her window, her candle, her unmade bed in morning light. NO people, NO faces, NO mirrors — at most her own hand holding something, photographed from her point of view.",
  "SETTING: her real, lived-in world — same warm home and everyday life as the rest of the series. Beautiful but honest, never staged like a magazine or hotel.",
  "VARIANCE: every aesthetic photo in the series must look different from the others — its own subject, room, time of day, light temperature, camera angle, and distance. Mix it up: some shots are close and intimate (steam curling off a mug, a pen on a page), some are wide (a whole sunlit corner of a room, the view down the hallway), some are looking down at her feet or hands, some are out a window. Never repeat the same composition, surface, or golden-hour treatment twice.",
  "9:16 vertical portrait, exactly like a phone photo.",
  "IMPORTANT: absolutely NO text anywhere in the image — no words, letters, numbers, screens with UI, logos, or watermarks.",
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
