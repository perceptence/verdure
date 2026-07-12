/* ============================================================================
   VERDURE — Design System Tokens
   Single source of truth for color, type, space, radius, elevation, and motion.

   Structure:
     palette.*   raw color ramps (primitives — don't use directly in UI)
     color.*     semantic tokens (use these: color.surface, color.ink, …)
     type.*      font family, size scale, weights, line-heights
     space.*     spacing scale (px)
     radius.*    corner-radius scale (px)
     shadow.*    elevation scale
     motion.*    durations + easings

   Exact hex values are preserved from the original design so the UI renders
   identically — the system organizes them, it doesn't recolor them.
============================================================================ */

/* ----------------------------- PALETTE (primitives) ----------------------- */
/* Raw ramps. UI code should reference `color.*` semantic tokens, not these. */
export const palette = {
  // Moss — the brand green, darkest → lightest
  moss900: "#16241A", moss850: "#1A2A1C", moss800: "#243A2A", moss750: "#2A3B2C",
  moss700: "#34503A", moss650: "#37543D", moss600: "#3E5C43", moss550: "#456B4A",
  moss500: "#4B5D3F", moss450: "#4C7350", moss400: "#5C8663",
  leaf300: "#7FA968", leaf200: "#A9C88C", leaf150: "#BCD4B4", leaf100: "#CFE0C8",

  // Green-tinted neutrals (ink on light; warm paper surfaces)
  ink900: "#1C241B", ink600: "#5C6657", ink500: "#646E56", ink400: "#858E78",
  paper050: "#FBF9F4", paper100: "#F6F4EE", paper150: "#EFE7D8", paper200: "#E2D6C1",
  bg: "#EDEEE6",

  // Near-black chrome (device frame, immersive dark scenes)
  black900: "#050604", black850: "#0B0C09", black800: "#0B0F0B", black780: "#0B120D",
  black750: "#0F1610", black700: "#16170F", black650: "#16241A", black600: "#1C1E17",
  black550: "#20231C", black500: "#2E2622",
  onDark: "#EAF0E4", onDarkAlt: "#EAF0E6",

  // Amber — "watch / needs an eye on it"
  amber700: "#8A6820", amber500: "#C99A3A", amber400: "#E8B04B", amber300: "#FBBC05",
  amber100: "#FFE9A3",

  // Clay — "needs care / overdue"
  clay700: "#A94E2F", clay600: "#B5602F", clay500: "#BC6E54", clay450: "#C96A44",
  clay400: "#E8875A", clay300: "#E79A7E", clay250: "#DCA983", clay200: "#ECBE9A",
  clay150: "#E3B08A", clay120: "#D9A67E",

  // Water — info / hydration / cool accents
  water600: "#5B7CC2", water400: "#6FA3C4", water300: "#7FB5D6", water150: "#C4C8DA",
  water100: "#E8EAF2",

  // Scene — illustration soil/bark tones
  bark800: "#2E2622", bark700: "#3B2A24", bark600: "#463229", bark500: "#5A4033",

  white: "#FFFFFF",
};

/* Google brand colors — fixed by Google's brand guidelines, not themeable. */
export const google = { blue: "#4285F4", red: "#EA4335", green: "#34A853", yellow: "#FBBC05" };

/* ----------------------------- COLOR (semantic) --------------------------- */
export const color = {
  // Surfaces
  surface: palette.bg,          // app background
  surfaceRaised: palette.paper050, // cards
  surfaceAlt: palette.paper100,    // secondary cards / rows
  surfaceWarm: palette.paper150,   // warm panels
  surfaceWarmDeep: palette.paper200,

  // Text on light
  ink: palette.ink900,          // primary text  (AA: 13.7:1 on card)
  inkSoft: palette.ink600,      // secondary     (AA: 5.7:1 on card)
  inkFaint: palette.ink500,     // tertiary/caption (AA: 5.1:1 on card)

  // Text on dark chrome
  onDark: palette.onDark,
  onDarkSoft: "rgba(234,240,228,0.6)",

  // Brand
  brand: palette.moss700,       // primary green
  brandBright: palette.moss450, // lighter green (buttons, accents)
  brandDeep: palette.moss900,

  // Hairlines / dividers
  line: "rgba(28,36,25,0.10)",
  lineStrong: "rgba(28,36,25,0.16)",

  // Status — plant health & task kinds
  thriving: palette.moss700,
  watch: palette.amber700,      // was the 28×-hardcoded #8A6820
  watchSoft: palette.amber400,
  needsCare: palette.clay600,
  needsCareSoft: palette.clay400,
  water: palette.water400,
  waterSoft: palette.water300,

  // Dark chrome (device frame, nav bar, immersive canvas)
  chrome: palette.black850,
  chromeDeep: palette.black900,
};

/* ----------------------------- TYPE --------------------------------------- */
export const type = {
  family: "'Manrope', sans-serif",
  // Size scale (px) — consolidated from 32 ad-hoc sizes to a coherent ramp.
  size: {
    "2xs": 10, xs: 11, sm: 12, base: 13, md: 14, lg: 15,
    xl: 17, "2xl": 20, "3xl": 24, "4xl": 30, "5xl": 38, "6xl": 46,
  },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
  leading: { tight: 1.05, snug: 1.35, normal: 1.5, relaxed: 1.6 },
  tracking: { tight: "-0.02em", normal: "0", wide: "0.1em", wider: "0.24em" },
};

/* ----------------------------- SPACE -------------------------------------- */
/* Spacing scale (px). Keyed by value for readability at call sites. */
export const space = {
  0: 0, 2: 2, 4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 14: 14,
  16: 16, 18: 18, 20: 20, 24: 24, 28: 28, 32: 32, 40: 40, 48: 48,
};

/* ----------------------------- RADIUS ------------------------------------- */
export const radius = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, "2xl": 28, pill: 100,
  device: 55, // iPhone frame — special, not part of the UI scale
};

/* ----------------------------- SHADOW / ELEVATION ------------------------- */
export const shadow = {
  e1: "0 2px 12px rgba(0,0,0,0.06)",             // resting card
  e2: "0 8px 22px rgba(28,36,25,0.14)",           // raised card / photo
  e3: "0 12px 30px rgba(0,0,0,0.32)",             // floating pill / nav
  e4: "0 12px 34px rgba(0,0,0,0.28)",             // sheet / modal
  e5: "0 40px 80px rgba(0,0,0,0.6)",              // the phone itself
  insetTop: "inset 0 1px 2px rgba(255,255,255,0.9)",
};

/* ----------------------------- MOTION ------------------------------------- */
export const motion = {
  duration: { fast: "150ms", base: "280ms", slow: "400ms", slower: "550ms", ambient: "900ms" },
  easing: {
    standard: "cubic-bezier(.2,.8,.2,1)",
    decel: "cubic-bezier(.2,.8,.3,1)",
    spring: "cubic-bezier(.34,1.5,.5,1)",
  },
};

/* ----------------------------- BACKWARD-COMPAT ---------------------------- */
/* Flat alias matching the original `T` object so existing call sites keep
   working during migration. New code should prefer the structured tokens. */
export const T = {
  bg: color.surface,
  card: color.surfaceRaised,
  ink: color.ink,
  inkSoft: color.inkSoft,
  inkFaint: color.inkFaint,
  moss: color.brand,
  mossBright: color.brandBright,
  clay: color.needsCare,
  line: color.line,
};

export const tokens = { palette, google, color, type, space, radius, shadow, motion };
export default tokens;
