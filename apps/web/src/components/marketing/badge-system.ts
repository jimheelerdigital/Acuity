/**
 * Ripple achievement badge renderer — ported verbatim from the design
 * handoff (`marketing_handoff/badge-system.js`). Pure string-building (no
 * deps, no DOM) → `renderBadge(cfg, state, opts)` returns a 200×200 <svg>
 * string. Used by the Consistency section.
 *
 * DRIFT NOTE (PRODUCT_DRIFT_AUDIT.md): these are elaborate tiered metallic
 * medallions; verify the live app's achievement badges match this design
 * (the Home achievement strip uses simpler icon medals) before relying on
 * them as a literal product promise.
 */

export type BadgeCategory = "consistency" | "reflection" | "moment";

export interface BadgeConfig {
  slug: string;
  tier?: number;
  name: string;
  cat: BadgeCategory;
  emblem: string;
  num?: number;
  desc: string;
  ribbonWord?: string;
}

export type BadgeState = "earned" | "locked";
export interface BadgeOpts {
  colorway?: "gold" | "tiered" | "family" | "brand";
}

type Metal = Record<string, string>;

// ── metals (full ramps) ──────────────────────────────────────────────
const METALS: Record<string, Metal> = {
  bronze: { bodyHi: "#EFC891", bodyMid: "#B9783E", bodyLo: "#5E3217", rimHi: "#F6D9AC", rimLo: "#3C2310", edge: "#3C2310", faceHi: "#D7A063", faceMid: "#A8682F", faceLo: "#693C1B", groove: "#583015", emblem: "#FFF3DE", emblemLo: "#F4DCBE", emblemHi: "#FFE3BE", ribbon: "#7C4A24", ribbonHi: "#A8682F", ribbonText: "#FFF1DD", glow: "#C8843E" },
  silver: { bodyHi: "#E4E8F0", bodyMid: "#969FB2", bodyLo: "#474E60", rimHi: "#F4F6FA", rimLo: "#363C4C", edge: "#363C4C", faceHi: "#CDD3E0", faceMid: "#929BAE", faceLo: "#5A6175", groove: "#474E60", emblem: "#2B3142", emblemLo: "#3A4458", emblemHi: "#FFFFFF", ribbon: "#4E5568", ribbonHi: "#727B90", ribbonText: "#F4F6FA", glow: "#AAB4C6" },
  gold: { bodyHi: "#FFE2A6", bodyMid: "#E88C44", bodyLo: "#8E3A14", rimHi: "#FFF2D2", rimLo: "#5A2710", edge: "#5A2710", faceHi: "#F7BB72", faceMid: "#DD8038", faceLo: "#9A4D1E", groove: "#7A3415", emblem: "#FFF8EC", emblemLo: "#FCEBCF", emblemHi: "#FFFFFF", ribbon: "#B83520", ribbonHi: "#E4583A", ribbonText: "#FFF1DD", glow: "#F4A14E" },
  platinum: { bodyHi: "#FFFFFF", bodyMid: "#D6DEEA", bodyLo: "#7E899C", rimHi: "#FFFFFF", rimLo: "#6A7488", edge: "#69748A", faceHi: "#F4F8FE", faceMid: "#D2DCEA", faceLo: "#94A0B4", groove: "#7E899C", emblem: "#34506B", emblemLo: "#46607A", emblemHi: "#FFFFFF", ribbon: "#7E899C", ribbonHi: "#A6B2C4", ribbonText: "#FFFFFF", glow: "#E2EAF4" },
  diamond: { bodyHi: "#FFFFFF", bodyMid: "#CFEFF6", bodyLo: "#5F9FB2", rimHi: "#FFFFFF", rimLo: "#3E7C8C", edge: "#3E7C8C", faceHi: "#EAFBFF", faceMid: "#BEEAF2", faceLo: "#76B8C8", groove: "#4E92A2", emblem: "#1F5566", emblemLo: "#2E6B7C", emblemHi: "#FFFFFF", ribbon: "#3E7C8C", ribbonHi: "#6FB2C2", ribbonText: "#F2FCFF", glow: "#9EE6F4" },
  rose: { bodyHi: "#FBD6D0", bodyMid: "#D98A86", bodyLo: "#8A463F", rimHi: "#FDE6E2", rimLo: "#5E2C28", edge: "#5E2C28", faceHi: "#F2B6AE", faceMid: "#CE7A74", faceLo: "#92504A", groove: "#763E38", emblem: "#FFF2EE", emblemLo: "#F6DAD4", emblemHi: "#FFFFFF", ribbon: "#9A4F48", ribbonHi: "#CE7A74", ribbonText: "#FFF1ED", glow: "#E29A92" },
  obsidian: { bodyHi: "#4A5066", bodyMid: "#262B3C", bodyLo: "#0E1018", rimHi: "#6A7290", rimLo: "#08090F", edge: "#08090F", faceHi: "#363C50", faceMid: "#202432", faceLo: "#141722", groove: "#0E1018", emblem: "#C2C9DE", emblemLo: "#A2AAC2", emblemHi: "#EAEEF8", ribbon: "#20243A", ribbonHi: "#363C54", ribbonText: "#C2C9DE", glow: "#5A6480" },
  emerald: { bodyHi: "#BCEFD0", bodyMid: "#3FA86E", bodyLo: "#15583A", rimHi: "#DCF6E6", rimLo: "#0E3C28", edge: "#0E3C28", faceHi: "#8AD2A4", faceMid: "#3C9468", faceLo: "#185C3E", groove: "#134A32", emblem: "#F0FBF4", emblemLo: "#D8F1E0", emblemHi: "#FFFFFF", ribbon: "#176344", ribbonHi: "#3C9468", ribbonText: "#EFFBF2", glow: "#52B47E" },
  steel: { bodyHi: "#434A63", bodyMid: "#2C3144", bodyLo: "#171B29", rimHi: "#525A75", rimLo: "#12151F", edge: "#10131C", faceHi: "#373D54", faceMid: "#2A2F42", faceLo: "#1E2333", groove: "#181C28", emblem: "#626A82", emblemLo: "#525978", emblemHi: "#7E869F", ribbon: "#272C3D", ribbonHi: "#343A4F", ribbonText: "#727A93", glow: "transparent" },
};

function metalKey(cfg: BadgeConfig, colorway: string): string {
  if (colorway === "gold") return "gold";
  if (colorway === "tiered") {
    const tierMap: Record<number, string> = { 1: "bronze", 2: "silver", 3: "gold", 4: "platinum", 5: "diamond" };
    return tierMap[cfg.tier ?? 0] || "gold";
  }
  if (colorway === "family") return cfg.cat === "consistency" ? "gold" : cfg.cat === "reflection" ? "jade" : "violet";
  if (colorway === "brand") return cfg.cat === "reflection" ? "violet" : "coral";
  return "gold";
}
function paletteFor(cfg: BadgeConfig, state: BadgeState, colorway?: string): Metal {
  return state === "locked" ? METALS.steel : METALS[metalKey(cfg, colorway || "gold")] || METALS.gold;
}

// ── geometry helpers ──────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

function sunburstPath(cx: number, cy: number, outerR: number, innerR: number, points = 16): string {
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const [x, y] = polar(cx, cy, r, (i * 180) / points);
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2) + " ";
  }
  return d + "Z";
}

function octagonPath(cx: number, cy: number, r: number): string {
  let d = "";
  for (let i = 0; i < 8; i++) {
    const [x, y] = polar(cx, cy, r, 22.5 + i * 45);
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2) + " ";
  }
  return d + "Z";
}

// ── emblem library ────────────────────────────────────────────────────
const EMBLEMS: Record<string, (cfg: BadgeConfig, c: string, cl: string) => string> = {
  numeral: (cfg, c) => {
    const big = String(cfg.num);
    const fs = big.length >= 3 ? 46 : big.length === 2 ? 58 : 66;
    return `<text x="100" y="98" text-anchor="middle" dominant-baseline="central" font-family="'Manrope', system-ui, sans-serif" font-weight="800" font-size="${fs}" letter-spacing="-2" fill="${c}">${big}</text>`;
  },
  sprout: (cfg, c, cl) => `<path d="M100 116 V86" stroke="${c}" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M100 92 C100 78 88 70 76 70 C76 84 86 92 100 92 Z" fill="${c}"/><path d="M100 86 C100 72 112 64 124 64 C124 78 114 86 100 86 Z" fill="${cl}"/>`,
  hourglass: (cfg, c, cl) => `<path d="M78 68 H122 L100 96 Z" fill="${c}"/><path d="M78 124 H122 L100 96 Z" fill="${cl}"/><rect x="74" y="63" width="52" height="6" rx="3" fill="${c}"/><rect x="74" y="123" width="52" height="6" rx="3" fill="${c}"/>`,
  prism: (cfg, c, cl) => `<path d="M100 64 L126 116 H74 Z" fill="none" stroke="${c}" stroke-width="5" stroke-linejoin="round"/><path d="M100 90 L138 78" stroke="${cl}" stroke-width="3.5" stroke-linecap="round"/><path d="M100 96 L140 96" stroke="${cl}" stroke-width="3.5" stroke-linecap="round"/><path d="M100 102 L138 114" stroke="${cl}" stroke-width="3.5" stroke-linecap="round"/>`,
  bloom: (cfg, c, cl) => {
    let pts = "";
    for (let i = 0; i < 12; i++) {
      const [x, y] = polar(100, 96, 30, (i * 360) / 12);
      pts += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${i % 2 ? cl : c}"/>`;
    }
    return pts + `<circle cx="100" cy="96" r="8" fill="${c}"/>`;
  },
  flag: (cfg, c, cl) => `<path d="M82 124 V66" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M82 68 H120 L111 80 L120 92 H82 Z" fill="${c}"/><path d="M90 76 H110" stroke="${cl}" stroke-width="3" stroke-linecap="round"/><path d="M72 124 H96" stroke="${cl}" stroke-width="4" stroke-linecap="round"/>`,
  trophy: (cfg, c, cl) => `<path d="M68 122 L92 78 L106 102 L116 86 L132 122 Z" fill="${c}"/><path d="M92 78 L83 94 L98 94 Z" fill="${cl}"/><path d="M116 86 L110 96 L122 96 Z" fill="${cl}"/><path d="M106 72 V58" stroke="${c}" stroke-width="4" stroke-linecap="round"/><path d="M106 58 H126 L120 65 L126 72 H106 Z" fill="${c}"/>`,
  moon: (cfg, c, cl) => `<path d="M112 70 A30 30 0 1 0 112 122 A24 24 0 1 1 112 70 Z" fill="${c}"/><circle cx="124" cy="74" r="3" fill="${cl}"/><circle cx="132" cy="92" r="2.2" fill="${cl}"/><circle cx="120" cy="108" r="2.6" fill="${cl}"/>`,
  sunrise: (cfg, c, cl) => `<path d="M68 112 H132" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M82 112 A18 18 0 0 1 118 112 Z" fill="${c}"/>${[-50, -25, 0, 25, 50].map((a) => { const [x1, y1] = polar(100, 112, 24, a); const [x2, y2] = polar(100, 112, 33, a); return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${cl}" stroke-width="3.5" stroke-linecap="round"/>`; }).join("")}`,
  comeback: (cfg, c) => `<path d="M124 96 A24 24 0 1 1 116 78" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M116 70 L120 80 L109 81 Z" fill="${c}"/>`,
  firework: (cfg, c, cl) => {
    let rays = "";
    for (let i = 0; i < 12; i++) {
      const [x1, y1] = polar(100, 96, 12, (i * 360) / 12);
      const [x2, y2] = polar(100, 96, 30, (i * 360) / 12);
      rays += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${i % 2 ? cl : c}" stroke-width="3.4" stroke-linecap="round"/>`;
      const [dx, dy] = polar(100, 96, 36, (i * 360) / 12);
      if (i % 2 === 0) rays += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="2.4" fill="${c}"/>`;
    }
    return rays + `<circle cx="100" cy="96" r="6" fill="${c}"/>`;
  },
  calendar: (cfg, c, cl) => `<rect x="72" y="72" width="56" height="50" rx="7" fill="none" stroke="${c}" stroke-width="5"/><path d="M72 86 H128" stroke="${c}" stroke-width="5"/><rect x="84" y="64" width="5" height="14" rx="2.5" fill="${c}"/><rect x="111" y="64" width="5" height="14" rx="2.5" fill="${c}"/><path d="M88 104 L97 112 L113 95" stroke="${cl}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  check: (cfg, c) => `<path d="M72 98 L91 117 L130 76" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  orbit: (cfg, c, cl) => `<ellipse cx="100" cy="96" rx="34" ry="13" fill="none" stroke="${c}" stroke-width="4"/><ellipse cx="100" cy="96" rx="13" ry="34" fill="none" stroke="${cl}" stroke-width="3" opacity="0.8"/><circle cx="100" cy="96" r="8" fill="${c}"/><circle cx="134" cy="96" r="4.5" fill="${cl}"/>`,
  trend: (cfg, c) => `<path d="M72 116 L91 95 L105 106 L128 78" stroke="${c}" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M116 78 H128 V90" stroke="${c}" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  wave: (cfg, c, cl) => {
    const hs = [22, 40, 30, 50, 34, 24];
    return hs.map((h, i) => `<rect x="${72 + i * 11}" y="${96 - h / 2}" width="6.5" height="${h}" rx="3.25" fill="${i % 2 ? cl : c}"/>`).join("");
  },
  spark: (cfg, c, cl) => `<path d="M100 64 C100 85 86 96 70 96 C86 96 100 107 100 128 C100 107 114 96 130 96 C114 96 100 85 100 64 Z" fill="${c}"/><circle cx="128" cy="72" r="3" fill="${cl}"/>`,
  seasons: (cfg, c, cl) => `<circle cx="100" cy="96" r="28" fill="none" stroke="${c}" stroke-width="3.5"/><circle cx="100" cy="72" r="5" fill="${c}"/><circle cx="124" cy="96" r="5" fill="${cl}"/><circle cx="100" cy="120" r="5" fill="${c}"/><circle cx="76" cy="96" r="5" fill="${cl}"/>`,
};

// ── badge configs ─────────────────────────────────────────────────────
export const BADGES: BadgeConfig[] = [
  { slug: "first_night", tier: 1, name: "First Night", cat: "consistency", emblem: "numeral", num: 1, desc: "Recorded your very first entry." },
  { slug: "week_one", tier: 2, name: "Week One", cat: "consistency", emblem: "numeral", num: 7, desc: "Seven nights in a row." },
  { slug: "fortnight", tier: 2, name: "Fortnight", cat: "consistency", emblem: "numeral", num: 14, desc: "Fourteen-night streak." },
  { slug: "month", tier: 3, name: "Full Month", cat: "consistency", emblem: "numeral", num: 30, desc: "Thirty nights of showing up." },
  { slug: "hundred", tier: 4, name: "The Hundred", cat: "consistency", emblem: "numeral", num: 100, desc: "One hundred entries logged." },
  { slug: "year_one", tier: 5, name: "One Year", cat: "consistency", emblem: "numeral", num: 365, desc: "A full year of nights." },
  { slug: "first_theme", tier: 1, name: "First Theme", cat: "reflection", emblem: "sprout", desc: "A theme emerged from your words." },
  { slug: "deep_diver", tier: 2, name: "Deep Diver", cat: "reflection", emblem: "hourglass", desc: "Recorded an entry over three minutes." },
  { slug: "pattern_seeker", tier: 3, name: "Pattern Seeker", cat: "reflection", emblem: "prism", desc: "Opened your first weekly insight." },
  { slug: "full_matrix", tier: 4, name: "Full Matrix", cat: "reflection", emblem: "bloom", desc: "Scored all your life areas." },
  { slug: "goal_setter", tier: 2, name: "Goal Setter", cat: "reflection", emblem: "flag", desc: "Planted your first goal." },
  { slug: "goal_crusher", tier: 5, name: "Goal Crusher", cat: "reflection", emblem: "trophy", desc: "Completed a long-term goal." },
  { slug: "night_owl", tier: 2, name: "Night Owl", cat: "moment", emblem: "moon", desc: "Recorded after midnight." },
  { slug: "early_bird", tier: 2, name: "Early Bird", cat: "moment", emblem: "sunrise", desc: "Recorded at dawn." },
  { slug: "comeback", tier: 1, name: "The Comeback", cat: "moment", emblem: "comeback", desc: "Returned after time away." },
  { slug: "clean_sweep", tier: 3, name: "Clean Sweep", cat: "moment", emblem: "firework", desc: "Checked off every task in a day." },
  { slug: "new_year", tier: 4, name: "New Year", cat: "moment", emblem: "calendar", desc: "Reflected on the first of the year." },
  { slug: "anniversary", tier: 5, name: "Anniversary", cat: "moment", emblem: "firework", desc: "One year since your first entry." },
  { slug: "half_century", name: "Half Century", cat: "consistency", emblem: "numeral", num: 50, tier: 3, desc: "Fifty entries logged." },
  { slug: "perfect_week", name: "Perfect Week", cat: "consistency", emblem: "check", tier: 4, ribbonWord: "PERFECT", desc: "A full week recorded with every task cleared." },
  { slug: "theme_map", name: "Theme Map", cat: "reflection", emblem: "orbit", tier: 2, desc: "Reached ten entries — your Theme Map opened." },
  { slug: "mover", name: "Mover", cat: "reflection", emblem: "trend", tier: 3, desc: "Lifted a life area by fifteen in a month." },
  { slug: "wordsmith", name: "Wordsmith", cat: "reflection", emblem: "wave", tier: 3, desc: "Five hundred minutes spoken." },
  { slug: "insight_faithful", name: "Faithful", cat: "reflection", emblem: "spark", tier: 4, desc: "Opened four weekly insights in a row." },
  { slug: "four_seasons", name: "Four Seasons", cat: "moment", emblem: "seasons", tier: 4, desc: "Reflected through all four seasons." },
  { slug: "full_bloom", name: "Full Bloom", cat: "moment", emblem: "bloom", tier: 5, desc: "Every life area above sixty at once." },
];

// ── frame renderer ────────────────────────────────────────────────────
function frameMarkup(cat: BadgeCategory, P: Metal, idp: string): { frame: string; clip: string } {
  const cx = 100, cy = 100;
  if (cat === "consistency") {
    let ticks = "";
    for (let i = 0; i < 8; i++) {
      const [x1, y1] = polar(cx, cy, 74, i * 45);
      const [x2, y2] = polar(cx, cy, 80, i * 45);
      ticks += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="url(#${idp}_rim)" stroke-width="1.4" opacity="0.7"/>`;
    }
    const frame = `<path d="${octagonPath(cx, cy, 95)}" fill="${P.edge}"/><path d="${octagonPath(cx, cy, 92)}" fill="url(#${idp}_body)"/><path d="${octagonPath(cx, cy, 80)}" fill="none" stroke="url(#${idp}_rim)" stroke-width="3.5"/><path d="${octagonPath(cx, cy, 77)}" fill="${P.groove}"/><path d="${octagonPath(cx, cy, 74)}" fill="url(#${idp}_face)"/>${ticks}`;
    return { frame, clip: `<path d="${octagonPath(cx, cy, 74)}"/>` };
  }
  if (cat === "reflection") {
    const rr = (sz: number, rx: number, fill: string | null, stroke?: string, sw?: number) => {
      const xy = (200 - sz) / 2;
      return `<rect x="${xy}" y="${xy}" width="${sz}" height="${sz}" rx="${rx}" ${fill ? `fill="${fill}"` : 'fill="none"'} ${stroke ? `stroke="${stroke}" stroke-width="${sw}"` : ""}/>`;
    };
    const frame = `${rr(186, 52, P.edge)}${rr(180, 50, `url(#${idp}_body)`)}${rr(156, 42, null, `url(#${idp}_rim)`, 3.5)}${rr(150, 40, P.groove)}${rr(144, 38, `url(#${idp}_face)`)}`;
    return { frame, clip: `<rect x="28" y="28" width="144" height="144" rx="38"/>` };
  }
  const frame = `<circle cx="${cx}" cy="${cy}" r="78" fill="${P.edge}"/><path d="${sunburstPath(cx, cy, 95, 74, 16)}" fill="url(#${idp}_body)"/><circle cx="${cx}" cy="${cy}" r="74" fill="url(#${idp}_body)"/><circle cx="${cx}" cy="${cy}" r="71" fill="none" stroke="url(#${idp}_rim)" stroke-width="3.5"/><circle cx="${cx}" cy="${cy}" r="68" fill="${P.groove}"/><circle cx="${cx}" cy="${cy}" r="65" fill="url(#${idp}_face)"/>`;
  return { frame, clip: `<circle cx="${cx}" cy="${cy}" r="65"/>` };
}

// ── badge SVG renderer ────────────────────────────────────────────────
export function renderBadge(cfg: BadgeConfig, state: BadgeState = "earned", opts: BadgeOpts = {}): string {
  const colorway = opts.colorway || "gold";
  const P = paletteFor(cfg, state, colorway);
  const idp = `${cfg.slug}_${state}_${colorway}`;
  const dim = state === "locked";
  const emblemFn = EMBLEMS[cfg.emblem] || EMBLEMS.numeral;
  const emblem = emblemFn(cfg, P.emblem, P.emblemLo);
  const { frame, clip } = frameMarkup(cfg.cat, P, idp);

  const ribbon = cfg.cat === "consistency"
    ? `<g filter="url(#${idp}_ds2)"><path d="M54 132 H146 L138 151 H62 Z" fill="url(#${idp}_rib)"/><path d="M54 132 H146 L143.5 138 H56.5 Z" fill="#FFFFFF" opacity="0.18"/><text x="100" y="143.5" text-anchor="middle" dominant-baseline="central" font-family="'Geist Mono', monospace" font-weight="600" font-size="10" letter-spacing="1.5" fill="${P.ribbonText}">${cfg.ribbonWord || ((cfg.num ?? 0) >= 100 ? "ENTRIES" : "NIGHTS")}</text></g>`
    : "";

  const specOp = dim ? 0.16 : 0.5;
  const METAL_NAMES: Record<string, string> = { bronze: "BRONZE", silver: "SILVER", gold: "GOLD", platinum: "PLATINUM", diamond: "DIAMOND", rose: "ROSE GOLD", obsidian: "OBSIDIAN", emerald: "EMERALD" };
  const mKey = metalKey(cfg, colorway);
  const mName = dim ? "LOCKED" : METAL_NAMES[mKey] || "";
  const labelY = cfg.cat === "consistency" ? 164 : cfg.cat === "reflection" ? 150 : 149;
  const etched = mName
    ? `<g opacity="${dim ? 0.5 : 0.9}"><text x="100" y="${labelY + 0.7}" text-anchor="middle" dominant-baseline="central" font-family="'Geist Mono', monospace" font-weight="600" font-size="7" letter-spacing="2.6" fill="${P.emblemHi}" opacity="0.22">${mName}</text><text x="100" y="${labelY}" text-anchor="middle" dominant-baseline="central" font-family="'Geist Mono', monospace" font-weight="600" font-size="7" letter-spacing="2.6" fill="${P.groove}">${mName}</text></g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="${cfg.name} badge, ${state}"><defs><radialGradient id="${idp}_body" cx="36%" cy="26%" r="84%"><stop offset="0%" stop-color="${P.bodyHi}"/><stop offset="52%" stop-color="${P.bodyMid}"/><stop offset="100%" stop-color="${P.bodyLo}"/></radialGradient><radialGradient id="${idp}_face" cx="42%" cy="30%" r="80%"><stop offset="0%" stop-color="${P.faceHi}"/><stop offset="58%" stop-color="${P.faceMid}"/><stop offset="100%" stop-color="${P.faceLo}"/></radialGradient><linearGradient id="${idp}_rim" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0%" stop-color="${P.rimHi}"/><stop offset="48%" stop-color="${P.rimLo}"/><stop offset="72%" stop-color="${P.rimHi}"/><stop offset="100%" stop-color="${P.rimLo}"/></linearGradient><linearGradient id="${idp}_rib" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${P.ribbonHi}"/><stop offset="100%" stop-color="${P.ribbon}"/></linearGradient><linearGradient id="${idp}_shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9"/><stop offset="45%" stop-color="#FFFFFF" stop-opacity="0.12"/><stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient><filter id="${idp}_raise" x="-40%" y="-40%" width="180%" height="180%"><feOffset in="SourceAlpha" dx="0" dy="-1.1" result="up"/><feFlood flood-color="${P.emblemHi}" flood-opacity="${dim ? 0.4 : 0.9}"/><feComposite in2="up" operator="in" result="hl"/><feOffset in="SourceAlpha" dx="0" dy="1.6" result="dn"/><feFlood flood-color="#000000" flood-opacity="${dim ? 0.35 : 0.5}"/><feComposite in2="dn" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="hl"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="${idp}_ds" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#05060C" flood-opacity="${dim ? 0.3 : 0.42}"/></filter><filter id="${idp}_ds2" x="-30%" y="-30%" width="160%" height="200%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.4"/></filter></defs><g opacity="${dim ? 0.66 : 1}" filter="url(#${idp}_ds)"><g>${frame}<g fill="url(#${idp}_shine)" opacity="${specOp}">${clip}</g><g filter="url(#${idp}_raise)">${emblem}</g>${ribbon}${etched}</g></g></svg>`;
}
