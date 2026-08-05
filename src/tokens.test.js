import { describe, it, expect } from "vitest";
import { color, type as ds, space, radius, palette } from "./tokens.js";

/* WCAG relative luminance + contrast ratio. */
const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const luminance = (hex) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};
const AA = 4.5;

/* The audit found ~20 contrast failures traceable to a single token. These lock
   that fix in: any future palette edit that drops text below AA fails the build. */
describe("colour meets WCAG 2.1 AA", () => {
  const surfaces = [
    ["surface", color.surface],
    ["surfaceRaised", color.surfaceRaised],
    ["surfaceAlt", color.surfaceAlt],
  ];
  const inks = ["ink", "inkSoft", "inkFaint"];

  for (const [sName, bg] of surfaces) {
    for (const ink of inks) {
      it(`${ink} on ${sName}`, () => {
        expect(contrast(color[ink], bg)).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it("inkFaint is no longer the pre-audit value that failed at 3.25:1", () => {
    expect(color.inkFaint.toUpperCase()).not.toBe("#858E78");
  });

  /* Status colours are tuned for fills/dots; the *Text variants are the ones
     allowed on light surfaces. This is the distinction the audit forced. */
  for (const t of ["thrivingText", "watchText", "needsCareText", "waterText"]) {
    it(`${t} on a card`, () => {
      expect(contrast(color[t], color.surfaceRaised)).toBeGreaterThanOrEqual(AA);
    });
  }
});

/* Phase 2 of the spacing pass put every padding/margin/gap on a 2px grid and
   made the screen gutter a single token. */
describe("spacing scale", () => {
  it("has no odd steps", () => {
    const odd = Object.entries(space).filter(([, v]) => v > 0 && v % 2 !== 0);
    expect(odd).toEqual([]);
  });

  it("exposes the screen gutter as one token", () => {
    expect(space.gutter).toBe(20);
  });
});

describe("type scale", () => {
  it("is unique and ascending", () => {
    const v = Object.values(ds.size);
    expect(new Set(v).size).toBe(v.length);
    expect([...v].sort((a, b) => a - b)).toEqual(v);
  });

  it("keeps the five weights the UI relies on", () => {
    expect(Object.values(ds.weight)).toEqual([400, 500, 600, 700, 800]);
  });
});

describe("radius scale", () => {
  it("ascends through the UI steps", () => {
    const ui = ["xs", "sm", "md", "lg", "xl", "2xl"].map((k) => radius[k]);
    expect([...ui].sort((a, b) => a - b)).toEqual(ui);
  });

  /* A migration once emitted `border-radius: 55` with no unit, which browsers
     drop — the phone frame silently rendered square. Keep it a bare number so
     call sites must append px, and assert the device value itself. */
  it("device radius is a unitless number", () => {
    expect(typeof radius.device).toBe("number");
    expect(radius.device).toBe(55);
  });
});

describe("palette", () => {
  it("only contains 6-digit hex", () => {
    const bad = Object.entries(palette).filter(([, v]) => !/^#[0-9A-Fa-f]{6}$/.test(v));
    expect(bad).toEqual([]);
  });
});
