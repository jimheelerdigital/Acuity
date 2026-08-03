/**
 * Content Factory — brand constants (single source of truth).
 *
 * VISUAL_DNA describes the coral-first palette + aesthetic guardrails
 * for image generation prompts. STYLE_LANES define 7 named visual
 * treatments that keep the carousel feed varied while staying on-brand.
 */

// ─── Visual DNA ────────────────────────────────────────────────────────────────
// Appended to every image-generation prompt so the output is recognizably Ripple.

export const VISUAL_DNA = [
  "Color palette — vary across these brand colors, do NOT default to orange every time:",
  "  • Warm coral (#F97E4E) — energetic, signature Ripple accent",
  "  • Soft cream / warm tan (#FBFAF6, #F0E6D6) — grounding, calm, neutral warmth",
  "  • Muted indigo / deep purple (#3D3A50, #5B4A7A) — depth, introspection, evening mood",
  "  • Dusty rose (#D4918A) — softness, femininity, warmth",
  "  • Warm amber (#D4A76A) — golden, nostalgic, comforting",
  "  • Sage green (#8FA88B) — growth, renewal, balance",
  "Mix 2-3 of these colors per image. Alternate the dominant color across slides — some coral-led, some indigo/purple-led, some cream/tan-led, some rose-led.",
  "Mood: gentle, reflective, warm — like golden-hour light through a window.",
  "Lighting: soft diffused or golden-hour. No harsh flash, no clinical white.",
  "Human subjects: diverse women ~35-50, natural expressions, candid not posed.",
  "Composition: clean negative space, editorial simplicity, slightly aspirational.",
  "Absolutely NO text, letters, words, numbers, watermarks, or logos in the image.",
  "No corporate stock-photo energy. No laptop-and-latte clichés.",
].join("\n");

// ─── Style Lanes ───────────────────────────────────────────────────────────────
// Each lane is a prompt prefix that steers the visual treatment. Topics reference
// lanes by key so the feed stays varied across cinematicReal, toon3d, etc.

export const STYLE_LANES = {
  cinematicReal: "Cinematic photorealistic scene, shallow depth of field, film grain, warm color grading.",
  toon3d: "Soft 3D render in the style of Pixar/DreamWorks, rounded shapes, warm subsurface lighting.",
  claymation: "Claymation stop-motion aesthetic, handmade textures, warm studio lighting, soft shadows.",
  stillLife: "Editorial still-life photograph, carefully arranged objects, soft natural light, overhead or 45° angle.",
  flatGraphic: "Flat vector illustration, limited warm color palette, bold simple shapes, editorial magazine style.",
  paperDiorama: "Paper-craft diorama scene, layered cut-paper with soft shadows, handmade craft aesthetic.",
  risograph: "Risograph print aesthetic, halftone dots, limited 3-color palette (coral, indigo, cream), slight misregistration.",
} as const;

export type StyleLane = keyof typeof STYLE_LANES;
