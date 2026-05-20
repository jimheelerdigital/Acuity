/**
 * Minimal ambient declarations for `culori/fn` — the package ships no
 * .d.ts files. We only use a few conversion helpers in
 * `lib/theme/tokens.ts`. If we add more culori calls later, extend
 * this shim accordingly.
 */
declare module "culori/fn" {
  interface OklchColor {
    mode: "oklch";
    l: number;
    c: number;
    h: number;
    alpha?: number;
  }

  interface RgbColor {
    mode: "rgb";
    r: number;
    g: number;
    b: number;
    alpha?: number;
  }

  type ColorLike = OklchColor | RgbColor | string | undefined;

  export function oklch(input: ColorLike): OklchColor | undefined;
  export function rgb(input: ColorLike): RgbColor | undefined;
  export function formatHex(input: ColorLike): string | undefined;
  export function formatHex8(input: ColorLike): string | undefined;
}
