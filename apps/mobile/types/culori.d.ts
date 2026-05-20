/**
 * Minimal ambient declarations for `culori/fn` — the package ships no
 * .d.ts files. We only use a small surface from the tree-shakable
 * entry; extend this shim if more functions are needed later.
 *
 * Important: `culori/fn` does NOT export top-level converters like
 * `rgb` or `oklch` as functions. The pattern is:
 *
 *   import { converter, useMode, modeRgb, modeOklch } from "culori/fn";
 *   useMode(modeRgb);
 *   useMode(modeOklch);
 *   const toRgb = converter("rgb");
 *   const out = toRgb({ mode: "oklch", l, c, h });
 *
 * The previous shim declared `rgb` and `oklch` as direct exports,
 * which TypeScript happily accepted but failed at runtime with
 * `_culoriFn.rgb is not a function`. Q1 bugfix on 2026-05-20.
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

  type ColorObj = OklchColor | RgbColor;
  type ColorLike = ColorObj | string | undefined;

  /** Mode definition. Opaque — pass to `useMode` to register. */
  interface ModeDefinition {
    mode: string;
  }

  /** Built-in mode definitions used by Acuity. */
  export const modeRgb: ModeDefinition;
  export const modeOklch: ModeDefinition;

  /** Register a mode so converters and parsers can resolve it. */
  export function useMode(mode: ModeDefinition): void;

  /**
   * Factory — returns a converter function from any registered mode
   * to the target. The returned converter accepts color objects
   * (`{ mode: 'oklch', l, c, h }`) or CSS color strings.
   */
  export function converter(target: "rgb"): (input: ColorLike) => RgbColor | undefined;

  export function formatHex(input: ColorLike): string | undefined;
  export function formatHex8(input: ColorLike): string | undefined;
}
