/**
 * Android widget palette (2026-10-28): same wash + readability guard as the
 * iOS widget (targets/widget/index.swift).
 */
import { describe, expect, it } from "vitest";

import { luminance, parseHex, widgetColors } from "../../../../mobile/lib/android-widget/theme";

const L = (hex: string) => luminance(parseHex(hex)!);

describe("Android widget colors", () => {
  it("falls back to coral and washes it lightly", () => {
    const c = widgetColors(null, false);
    expect(c.accent).toBe("#FF8A65");
    expect(c.bg).not.toBe("#FFFFFF");
    expect(L(c.bg)).toBeGreaterThan(0.8);
  });

  it("built-in palettes keep their accent; only citrus text is darkened", () => {
    for (const hex of ["#FF8A65", "#FE7780", "#3792FD"]) {
      const c = widgetColors(hex, false);
      expect(c.accent).toBe(hex.toUpperCase());
      expect(c.accentInk).toBe(hex.toUpperCase());
    }
    const citrus = widgetColors("#FCAA38", false);
    expect(citrus.accent).toBe("#FCAA38");
    expect(L(citrus.accentInk)).toBeLessThanOrEqual(0.3);
  });

  it("guards extreme custom colors", () => {
    const pale = widgetColors("#FFF4A0", false);
    expect(L(pale.accent)).toBeLessThanOrEqual(0.6);
    expect(L(pale.accentInk)).toBeLessThanOrEqual(0.3);
    const navy = widgetColors("#0A1030", true);
    expect(L(navy.accent)).toBeGreaterThanOrEqual(0.1);
    expect(L(navy.accentInk)).toBeGreaterThanOrEqual(0.35);
  });

  it("ignores junk input", () => {
    expect(widgetColors("not a color", false).accent).toBe("#FF8A65");
  });
});
