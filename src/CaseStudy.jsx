import React, { useState, useRef, useEffect } from "react";
import { color, type as ds, space, radius, shadow, motion, palette } from "./tokens.js";
import VerdureApp, { lightAt, rgb, celestialRealistic } from "./VerdureApp.jsx";

/* ==========================================================================
   VERDURE — DESIGN CASE STUDY
   A route in the same app (/case-study), built from the same design tokens the
   product uses (./tokens.js). The product is mounted inline — the real
   component, same React tree, driven by its own deep-link routes.
========================================================================== */

/* One content width for the entire page — the width the product's own
   design-system screen already uses, so the two pages line up. */
export const MAXW = 1080;

/* --------------------------------------------------------------------------
   FACTS — measured from this repository, not estimated.
     commits     git rev-list --count HEAD
     components  grep -cE "^function [A-Z]" src/VerdureApp.jsx
     tokens      Object.keys(...) on ./tokens.js
     a11y        axe-core 4.10.2 vs WCAG 2.1 AA on each core screen
-------------------------------------------------------------------------- */
export const FACTS = {
  commits: 19, tags: 0, components: 22, appLines: 4627,
  paletteColors: 64, semanticColors: 28, typeSizes: 12, spaceSteps: 17,
  radii: 8, elevations: 6, easings: 3,
  seededPlants: 7, seededRooms: 4,
  axeVersion: "4.10.2", axeViolations: 0, axeScreens: 4,
  testFiles: 3, assertions: 42, measured: "5 Aug 2026",
};

/* Journeys — one line each. The detail lives in the phone, not the copy. */
export const SCREENS = [
  ["garden", "Garden", "The living home scene, lit by the real hour."],
  ["time-of-day", "Time-of-day engine", "The light model, played fast — dawn to night."],
  ["rooms", "Rooms", "Plants grouped by the light they actually get."],
  ["activity", "Activity", "A diary, not a backlog. Related events collapse."],
  ["detail", "Plant detail", "Care plan, health trend, and a photo journal."],
  ["plants", "All plants", "The garden as a deck, worst-first."],
  ["add", "Add plant", "Two-shot scan: the plant, then the room's light."],
];

/* The hero runs the product's ACTUAL light model rather than an approximation:
   lightAt() interpolates between eight keyframes and celestialPos() sweeps one
   continuous circle, so the sky and the sun/moon move together and never jump. */
const HERO_DAY_SECONDS = 48; // one full 24h cycle

/* Five silhouettes rather than one repeated shape — a broad fan, upright
   blades, a trailing arch, a low rosette and tall fronds. Drawn from the
   ground up (y = 0 is the horizon). */
const HERO_SHAPES = [
  // broad fan
  ["M0 0 C-52 -26 -70 -86 -34 -132 C-2 -96 14 -46 0 0 Z",
   "M0 0 C52 -26 70 -86 34 -132 C2 -96 -14 -46 0 0 Z",
   "M0 0 C-20 -56 -10 -130 2 -170 C16 -120 18 -52 0 0 Z"],
  // upright blades
  ["M-16 0 C-24 -62 -18 -124 -8 -170 C0 -120 -4 -60 -8 0 Z",
   "M2 0 C-4 -74 2 -146 12 -196 C20 -140 14 -68 12 0 Z",
   "M20 0 C16 -52 24 -108 36 -146 C38 -100 30 -50 28 0 Z"],
  // trailing arch
  ["M0 0 C-42 -18 -78 -56 -92 -102 C-54 -82 -20 -46 0 0 Z",
   "M0 0 C42 -18 78 -56 92 -102 C54 -82 20 -46 0 0 Z",
   "M0 0 C-10 -42 -4 -92 4 -124 C12 -88 10 -42 0 0 Z"],
  // low rosette
  ["M0 0 C-50 -12 -80 -38 -86 -70 C-48 -56 -18 -32 0 0 Z",
   "M0 0 C50 -12 80 -38 86 -70 C48 -56 18 -32 0 0 Z",
   "M0 0 C-16 -32 -8 -70 0 -94 C12 -66 12 -30 0 0 Z"],
  // tall fronds
  ["M0 0 C-32 -54 -58 -116 -48 -168 C-18 -126 -6 -60 0 0 Z",
   "M0 0 C32 -54 58 -116 48 -168 C18 -126 6 -60 0 0 Z",
   "M0 0 C-6 -74 0 -158 8 -206 C14 -148 8 -70 0 0 Z"],
];
/* [x, shape, scale, opacity] — irregular spacing so it reads as planting,
   not a pattern. */
const HERO_PLANTS = [
  [60, 0, 0.92, 0.40], [150, 1, 0.74, 0.30], [246, 3, 1.02, 0.44], [330, 2, 0.66, 0.26],
  [438, 4, 0.86, 0.38], [534, 0, 0.70, 0.28], [648, 1, 1.06, 0.46], [742, 3, 0.80, 0.32],
  [852, 2, 0.92, 0.40], [960, 4, 0.72, 0.30], [1066, 0, 1.00, 0.42], [1178, 1, 0.84, 0.34],
  [1286, 3, 0.94, 0.38], [1392, 2, 0.76, 0.28],
];

/* Secondary research: recurring complaints about existing plant-care apps, and
   the design decision each one drove. Sources are linked on the page — these
   are other people's findings, not claims of my own. */
const RESEARCH = [
  {
    finding: "Apps push generic watering reminders",
    detail: "Reviews of the category single out reminders that fire on a fixed interval rather than adapting to the plant, the climate or how the owner actually cares for it.",
    response: "The home screen isn't a reminder queue. State is shown on the plant itself, and Activity records what you did and what the app noticed — a diary rather than a nag.",
    source: "PlantIn UI/UX review",
    href: "https://dev.to/emmaexplores/why-even-the-best-plant-care-app-fails-without-a-thoughtful-uiux-5725",
  },
  {
    finding: "Schedules don't bend to real life",
    detail: "A common complaint: miss a watering and you can't log the day you actually did it, and the schedule won't shift to match.",
    response: "Logging is the primary action, not a correction. Watering a plant updates its record and its next window, so the plan follows the behaviour instead of fighting it.",
    source: "Garden.com, tracking watering schedules",
    href: "https://www.garden.com/tools/how-to-track-watering-schedules-with-plant-care-apps",
  },
  {
    finding: "“Bright, indirect light” means nothing to beginners",
    detail: "It's described as the most common and most confusing instruction in houseplant care — and insufficient light is a leading reason houseplants die indoors.",
    response: "Rooms are defined by the light they actually get, not by a label. Each plant shows how well its room suits it, so “wrong spot” becomes visible rather than inferred.",
    source: "House Plant Journal",
    href: "https://www.houseplantjournal.com/bright-indirect-light-requirements-by-plant/",
  },
  {
    finding: "Light falls off faster than people expect",
    detail: "Every doubling of distance from a window drops light intensity by roughly 75% — so a plant a few steps further in is in a materially different place.",
    response: "Placement is a first-class action. Plants carry a “best spot” or a prompt to move, and moving one is a supported flow rather than an edit buried in settings.",
    source: "JOMO Studio lighting guide",
    href: "https://jomostudio.com/blogs/plant-with-jomo/the-ultimate-houseplant-lighting-guide",
  },
  {
    finding: "Phone light meters oversell their accuracy",
    detail: "Phone-based light measurement is reasonable at the extremes but jumpy and inconsistent in the middle range, where most rooms sit.",
    response: "Measured values are labelled as estimates in the UI rather than presented as fact. The app commits to a plain-language band — bright, medium, low — and marks the number “est.”",
    source: "Are light meters handy or hopeless?",
    href: "https://britbrief.co.uk/environment/agriculture/houseplant-hacks-are-light-meters-handy-or-hopeless.html",
  },
];

/* Phases of the light model, for the diagram. */
const PHASES = [
  ["Night", "#16203A", "22–05"],
  ["Dawn", "#4E5C82", "05–08"], // deepened: the original mid-tone failed AA against both black and white
  ["Midday", "#9BC4E2", "08–16"],
  ["Dusk", "#C08A72", "16–20"],
  ["Night", "#16203A", "20–22"],
];

/* Pick readable text for a given swatch. The sky colours span dark night to
   pale midday, so a fixed white label fails AA on the light end. */
function onSwatch(hex) {
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.28 ? color.ink : "#fff";
}

/* Defined at module scope on purpose: a component declared inside CaseStudy
   would be a new type on every render, remounting this whole subtree (and
   detaching refs) each time a journey is clicked. */
const Section = ({ id, kicker, title, lede, children }) => (
  <section id={id} className="cs-section">
    <div className="cs-wrap">
      {kicker && <div className="cs-kicker">{kicker}</div>}
      {title && <h2 className="cs-h2">{title}</h2>}
      {lede && <p className="cs-lede">{lede}</p>}
      {children}
    </div>
  </section>
);

export default function CaseStudy() {
  const [screen, setScreen] = useState("garden");
  const leftColRef = useRef(null);
  const journeysRef = useRef(null);
  const badgeRef = useRef(null);
  const [deviceH, setDeviceH] = useState(null);

  /* Hero day cycle — one continuously advancing hour drives both the sky and the
     sun/moon, exactly as the product does. Honors reduce-motion by parking at
     midday instead of animating. */
  const [hour, setHour] = useState(13);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000; last = now;
      setHour((h) => (h + dt * (24 / HERO_DAY_SECONDS)) % 24);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const L = lightAt(hour);
  /* Two-arc model, same as the product's Garden page: sun and moon BOTH rise
     east (left) and set west (right), each arcing over the top. Whichever is
     below the horizon fades out, so neither resets on screen. */
  const cel = celestialRealistic(hour);
  const fade = (alt) => Math.max(0, Math.min(1, alt / 0.16));

  /* Narrow viewports crop the garden inward instead of scaling the whole
     1440-wide strip down, which made the plants thin and spindly. Each step
     keeps the middle of the planting and drops what's at the edges. */
  const [gardenViewBox, setGardenViewBox] = useState("0 0 1440 220");
  useEffect(() => {
    const pick = () => {
      const w = window.innerWidth;
      setGardenViewBox(
        w >= 1200 ? "0 0 1440 220"
        : w >= 900 ? "150 0 1140 220"
        : w >= 640 ? "330 0 780 220"
        : "470 0 500 220"
      );
    };
    pick();
    window.addEventListener("resize", pick);
    return () => window.removeEventListener("resize", pick);
  }, []);

  /* The bar is part of the hero until you leave it, then it takes on a surface. */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight - 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* The phone spans the left column — section title down to the bottom of the
     last journey card — minus the badge above it.
     Measured as (journeys bottom − column top) rather than the column's own
     height: the grid stretches both columns to match, so reading the column
     box would feed its own result back in and never settle. */
  useEffect(() => {
    const col = leftColRef.current, list = journeysRef.current;
    if (!col || !list) return;
    const sync = () => {
      // the frame spans the journey list exactly: top of the first card to the
      // bottom of the last. The live badge sits above that span.
      setDeviceH(Math.max(320, list.getBoundingClientRect().height));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(col); ro.observe(list);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="cs-root">
      <style>{css}</style>

      <header className={`cs-bar${scrolled ? " solid" : ""}`}>
        <div className="cs-wrap cs-bar-inner">
          <a className="cs-brand" href="/">
            {/* the product's own mark, from the splash screen */}
            <svg className="cs-brand-mark" viewBox="0 0 96 96" fill="none" aria-hidden="true">
              <circle cx="48" cy="48" r="44" stroke="currentColor" strokeOpacity="0.35" strokeWidth="4" />
              <path d="M48 76V44" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
              <path d="M48 52c0-9-5-15-14-17 0 9 5 15 14 17Z" fill={palette.leaf300} />
              <path d="M48 46c0-9 5-15 14-17 0 9-5 15-14 17Z" fill={palette.leaf200} />
              <circle cx="48" cy="78" r="4" fill="currentColor" />
            </svg>
            VERDURE
            <span className="cs-brand-sub">Design case study</span>
          </a>
          <a className="cs-bar-cta" href="/?screen=garden" target="_blank" rel="noreferrer">
            Try it live
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M7 17 17 7M9 7h8v8" /></svg>
          </a>
        </div>
      </header>

      {/* ---------- hero: a full-viewport day, on a loop ---------- */}
      <div className="cs-hero">
        <div className="cs-sky" aria-hidden="true"
          style={{ background: `linear-gradient(180deg, ${rgb(L.top)} 0%, ${rgb(L.bot)} 100%)` }}>
          <div className="cs-stars" style={{ opacity: Math.max(0, 1 - L.warmth * 2.2) }} />
          {/* sun — runs the day arc. rgb() returns "rgb(r,g,b)", so an alpha
              suffix would be invalid CSS; rgba() is built explicitly. */}
          <div className="cs-orb" style={{
            left: `${cel.sun.cx}%`, top: `${cel.sun.cy}%`,
            background: `radial-gradient(circle, ${rgb(L.sun)} 0%, rgba(${L.sun[0]},${L.sun[1]},${L.sun[2]},0.55) 42%, transparent 70%)`,
            opacity: fade(cel.sun.alt),
          }} />
          {/* moon — runs the night arc, same direction, slightly lower peak */}
          <div className="cs-orb cs-orb-moon" style={{
            left: `${cel.moon.cx}%`, top: `${cel.moon.cy}%`,
            opacity: fade(cel.moon.alt) * 0.9,
          }} />
        </div>

        {/* keeps the headline readable at every phase of the cycle */}
        <div className="cs-hero-scrim" aria-hidden="true" />

        {/* the garden, echoing the product's shelf */}
        {/* Proportional, never stretched: preserveAspectRatio keeps the shapes
            true, and the viewBox narrows on small screens so plants are cropped
            from the ends rather than squeezed into skinny slivers. */}
        <svg className="cs-hero-garden" viewBox={gardenViewBox}
          preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          {HERO_PLANTS.map(([x, shape, s, o], i) => (
            <g key={i} transform={`translate(${x} 220) scale(${s})`} opacity={o}>
              {HERO_SHAPES[shape].map((d, j) => (
                <path key={j} d={d} fill={j === 2 ? "#08120C" : "#0A1710"} />
              ))}
            </g>
          ))}
        </svg>

        <div className="cs-wrap cs-hero-inner">
          <div className="cs-kicker cs-kicker-dark">Product design · Design systems · Front-end</div>
          <h1 className="cs-h1">A plant app that<br /><em>knows what time it is.</em></h1>
          <p className="cs-standfirst">
            A houseplant companion that shows you what your garden is doing instead of handing you a
            task list. Plants live in rooms defined by the light they actually get, care follows what
            you really did, and the whole garden reads at a glance.
          </p>
          <dl className="cs-meta">
            <div><dt>Role</dt><dd>Design &amp; build</dd></div>
            <div><dt>Surface</dt><dd>iOS · one canvas, any screen</dd></div>
            <div><dt>Stack</dt><dd>React 18 · Vite</dd></div>
            <div><dt>Deploy</dt><dd>Vercel · one build, two routes</dd></div>
          </dl>
        </div>

        <div className="cs-hero-cue" aria-hidden="true"><span />Scroll</div>
      </div>

      {/* ---------- facts ---------- */}
      <Section id="scale" kicker="At a glance" title="What's actually in the build"
        lede="Not estimates. Each figure is measured from this repository, and the test suite asserts them against the modules they describe — so a number here can't quietly go stale.">
        <div className="cs-facts">
          {[[FACTS.components, "components"], [`${FACTS.paletteColors}/${FACTS.semanticColors}`, "colours"],
            [FACTS.typeSizes, "type steps"], [FACTS.spaceSteps, "spacing steps"],
            [FACTS.assertions, "tests, passing"], [FACTS.axeViolations, "a11y violations"]].map(([n, l]) => (
            <div key={l} className="cs-fact"><div className="cs-fact-n">{n}</div><div className="cs-fact-l">{l}</div></div>
          ))}
        </div>
        <p className="cs-footnote">
          Measured on {FACTS.measured}. Run the suite yourself with <code>npm test</code> — see <a href="#tests">what it covers</a>.
        </p>
      </Section>

      {/* ---------- live product ----------
          The heading lives inside the grid so the phone can span the full
          column — from the section title down to the last journey card. */}
      <section id="live" className="cs-section">
        <div className="cs-wrap">
          <div className="cs-demo">
            <div className="cs-demo-side" ref={leftColRef}>
              <div className="cs-kicker">The product</div>
              <h2 className="cs-h2">It's running right here</h2>
              <p className="cs-lede">
                Not a screenshot — the real component, mounted in this page. Pick a journey; the phone
                reloads into it.
              </p>
              <div className="cs-journeys" ref={journeysRef} role="group" aria-label="Choose a journey">
                {SCREENS.map(([key, label, desc]) => (
                  <button key={key} className={`cs-journey${screen === key ? " on" : ""}`}
                    aria-pressed={screen === key} onClick={() => setScreen(key)}>
                    <span className="cs-journey-name">
                      {label}{screen === key && <span className="cs-journey-now">showing</span>}
                    </span>
                    <span className="cs-journey-desc">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="cs-device-col">
              <div className="cs-live-badge" ref={badgeRef}>
                <span className="cs-live-dot" />Live · running build
              </div>
              {/* real component inline; `key` remounts it per journey */}
              <div className="cs-device" style={deviceH ? { height: deviceH } : undefined}>
                <VerdureApp key={screen} embedded screen={screen} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- motivation ---------- */}
      <Section id="why" kicker="Motivation" title="Why build another plant app"
        lede="People don't stop caring for plants because they forget to water them. They stop because the app tells them what to do without ever telling them what's going on. Five recurring complaints from the category, and what each one changed here.">
        <div className="cs-research">
          {RESEARCH.map((r, i) => (
            <article key={i} className="cs-finding">
              <div className="cs-finding-n">{String(i + 1).padStart(2, "0")}</div>
              <div className="cs-finding-body">
                <h3 className="cs-h3">{r.finding}</h3>
                <p className="cs-body cs-tight">{r.detail}</p>
                <a className="cs-source" href={r.href} target="_blank" rel="noreferrer">{r.source} ↗</a>
              </div>
              <div className="cs-response">
                <div className="cs-response-label">What Verdure does</div>
                <p className="cs-body cs-tight">{r.response}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="cs-footnote">
          Secondary research — published reviews and horticultural guidance, linked above. No original
          user studies were run for this project.
        </p>
      </Section>

      {/* ---------- the light model ---------- */}
      <Section id="idea" kicker="The idea" title="Care is a rhythm"
        lede="One model drives the sky, the plants and the copy. Diagram, not a live render — the phone above plays the real thing.">
        <div className="cs-phases">
          {PHASES.map(([name, hex, range], i) => (
            <div key={i} className="cs-phase" style={{ background: hex, color: onSwatch(hex) }}>
              <span className="cs-phase-name">{name}</span>
              <span className="cs-phase-range">{range}</span>
            </div>
          ))}
        </div>
        <div className="cs-cols">
          <div><h3 className="cs-h3">Read the garden, not a list</h3>
            <p className="cs-body">Urgency is a marker on the plant itself. You learn the state at a glance.</p></div>
          <div><h3 className="cs-h3">Rooms are light, not labels</h3>
            <p className="cs-body">A room is defined by the light it gets, so a bad spot is visible, not inferred.</p></div>
          <div><h3 className="cs-h3">Seeded to show real states</h3>
            <p className="cs-body">{FACTS.seededPlants} plants across {FACTS.seededRooms} rooms in mixed health — thriving, watch and needs-care are all reachable.</p></div>
        </div>
      </Section>

      {/* ---------- design system ---------- */}
      <Section id="system" kicker="The system" title="Tokens, and what they're worth"
        lede="Colour, type, space, radius, elevation and motion in one module. Every specimen below is read from that file at render time, so it can't drift from the app.">
        <div className="cs-tokengrid">
          <div className="cs-token-card cs-span2">
            <div className="cs-token-head">Colour</div>
            <div className="cs-swatches">
              {[["brand", color.brand], ["brandBright", color.brandBright], ["brandDeep", color.brandDeep],
                ["ink", color.ink], ["inkSoft", color.inkSoft], ["inkFaint", color.inkFaint],
                ["thriving", color.thriving], ["watch", color.watch], ["needsCare", color.needsCare], ["water", color.water]].map(([n, hex]) => (
                <div key={n} className="cs-swatch">
                  <span className="cs-swatch-chip" style={{ background: hex }} />
                  <span className="cs-swatch-n">{n}</span>
                  <span className="cs-swatch-hex">{hex}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cs-token-card">
            <div className="cs-token-head">Type · {FACTS.typeSizes} steps</div>
            {Object.entries(ds.size).sort((a, b) => a[1] - b[1]).filter((_, i) => i % 2 === 0).map(([n, px]) => (
              <div key={n} className="cs-type-row">
                <span className="cs-type-spec" style={{ fontSize: Math.min(px, 30) }}>Verdant</span>
                <span className="cs-type-meta">{n} · {px}</span>
              </div>
            ))}
          </div>

          <div className="cs-token-card">
            <div className="cs-token-head">Weight</div>
            <div className="cs-weights">
              {Object.entries(ds.weight).map(([n, w]) => (
                <div key={n} className="cs-weight"><span style={{ fontWeight: w, fontSize: 22 }}>Aa</span><small>{w}</small></div>
              ))}
            </div>
            <div className="cs-token-head" style={{ marginTop: space[18] }}>Radius · {FACTS.radii}</div>
            <div className="cs-radii">
              {Object.entries(radius).filter(([k]) => k !== "device").map(([n, v]) => (
                <div key={n} className="cs-radius"><div className="cs-radius-box" style={{ borderRadius: Math.min(v, 24) }} /><small>{n}</small></div>
              ))}
            </div>
          </div>

          <div className="cs-token-card">
            <div className="cs-token-head">Spacing · {FACTS.spaceSteps} steps</div>
            <div className="cs-spaces">
              {Object.entries(space).filter(([k, v]) => k !== "gutter" && v > 0 && v <= 32).map(([n, v]) => (
                <div key={n} className="cs-space-row"><span>{n}</span><i style={{ width: v }} /></div>
              ))}
            </div>
          </div>

          <div className="cs-token-card">
            <div className="cs-token-head">Elevation · {FACTS.elevations}</div>
            <div className="cs-elevs">
              {[["e1", shadow.e1], ["e2", shadow.e2], ["e3", shadow.e3], ["e4", shadow.e4]].map(([n, sh]) => (
                <div key={n} className="cs-elev"><div className="cs-elev-box" style={{ boxShadow: sh }} /><small>{n}</small></div>
              ))}
            </div>
            <div className="cs-token-head" style={{ marginTop: space[20] }}>Gutter · the one constant</div>
            <div className="cs-gutterdemo">
              <span className="cs-gutterdemo-edge" style={{ width: space.gutter }}>{space.gutter}</span>
              <span className="cs-gutterdemo-body">content</span>
              <span className="cs-gutterdemo-edge" style={{ width: space.gutter }}>{space.gutter}</span>
            </div>
            <p className="cs-body cs-tight">Every screen and sheet holds {space.gutter}px from each edge — 51 places, one token.</p>
          </div>

          <div className="cs-token-card">
            <div className="cs-token-head">Motion · hover a track</div>
            {Object.entries(motion.easing).map(([n, curve]) => (
              <div key={n} className="cs-motion-row">
                <span className="cs-motion-name">{n}</span>
                <div className="cs-track"><span className="cs-dot" style={{ transitionTimingFunction: curve }} /></div>
              </div>
            ))}
          </div>

          <div className="cs-token-card">
            <div className="cs-token-head">Status, in use</div>
            <div className="cs-pills">
              {[["Thriving", color.thriving, color.thrivingText], ["Watch", color.watch, color.watchText],
                ["Needs care", color.needsCare, color.needsCareText], ["Water", color.water, color.waterText]].map(([l, dot, txt]) => (
                <span key={l} className="cs-pill" style={{ background: `${dot}22`, color: txt }}>
                  <span className="cs-pill-dot" style={{ background: dot }} />{l}
                </span>
              ))}
            </div>
            <p className="cs-body cs-tight">Vivid tokens fill; darker text variants keep labels above 4.5:1.</p>
          </div>

          <div className="cs-token-card">
            <div className="cs-token-head">Duration · {Object.keys(motion.duration).length}</div>
            <div className="cs-durations">
              {Object.entries(motion.duration).map(([n, v]) => (
                <div key={n} className="cs-duration">
                  <span className="cs-duration-n">{n}</span>
                  <span className="cs-duration-bar" style={{ width: `${(parseInt(v) / 900) * 100}%` }} />
                  <span className="cs-duration-v">{v}</span>
                </div>
              ))}
            </div>
            <p className="cs-body cs-tight">Named so a transition reads as a decision, not a magic number.</p>
          </div>
        </div>

        <div className="cs-callout">
          <div><b>The gutter is the one true constant.</b> {space.gutter}px from each screen edge, {51} places, one token.</div>
          <a className="cs-inline-cta" href="/?screen=design-system" target="_blank" rel="noreferrer">
            Open the living design system
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M7 17 17 7M9 7h8v8" /></svg>
          </a>
        </div>
      </Section>

      {/* ---------- problems ---------- */}
      <Section id="build" kicker="Where it nearly came apart" title="Five problems that decided the build"
        lede="Each one changed a rule, not just a line. The proof is rendered — what you see is the real before and after.">
        <div className="cs-probs">

          {/* 1 — the revert */}
          <article className="cs-prob">
            <header><span className="cs-tag cs-tag-red">Reverted</span>
              <h3 className="cs-h3">The design system that broke the design</h3></header>
            <div className="cs-prob-body">
              <div className="cs-demo-box">
                <div className="cs-ab">
                  <div className="cs-ab-col">
                    <span className="cs-ab-lbl cs-ab-good">Tuned — shipped</span>
                    <p style={{ fontSize: 11.5, lineHeight: 1.35, margin: 0, color: color.inkSoft }}>Soil staying wet too long — ease off watering</p>
                  </div>
                  <div className="cs-ab-col">
                    <span className="cs-ab-lbl cs-ab-bad">Snapped to scale</span>
                    <p style={{ fontSize: 12, lineHeight: 1.35, margin: 0, color: color.inkSoft }}>Soil staying wet too long — ease off watering</p>
                  </div>
                </div>
                <div className="cs-ab-note">11.5px → 12px. Half a pixel, ×780 values.</div>
              </div>
              <div className="cs-explain">
                <p className="cs-body cs-tight">I rounded every font size and radius onto a clean scale — <b>780 values</b>. It shipped, and the UI visibly loosened: lines re-wrapped, density drifted, rhythm broke. I reverted all of it.</p>
                <p className="cs-why">The rule it set: a token system names what's <i>already</i> true. It doesn't get to impose regularity on a UI that was tuned by eye. Colour migrated cleanly because it was 1:1; dimensions weren't.</p>
              </div>
            </div>
          </article>

          {/* 2 — a11y broke layout */}
          <article className="cs-prob">
            <header><span className="cs-tag">Regression</span>
              <h3 className="cs-h3">The accessibility fix that broke the layout</h3></header>
            <div className="cs-prob-body">
              <div className="cs-demo-box">
                <div className="cs-rowdemo">
                  <span className="cs-ab-lbl cs-ab-bad">&lt;button&gt; — shrink-wraps</span>
                  <div className="cs-fakerow" style={{ width: "auto", display: "inline-flex" }}>Zizi settled into Office</div>
                  <div className="cs-fakerow" style={{ width: "auto", display: "inline-flex" }}>You watered 5 plants and noticed two more</div>
                  <span className="cs-ab-lbl cs-ab-good" style={{ marginTop: space[10] }}>&lt;div role="button"&gt; — fills</span>
                  <div className="cs-fakerow">Zizi settled into Office</div>
                  <div className="cs-fakerow">You watered 5 plants and noticed two more</div>
                </div>
              </div>
              <div className="cs-explain">
                <p className="cs-body cs-tight">Making activity rows keyboard-reachable meant <code>div</code> → <code>button</code>. But a <code>div</code> fills its parent and a <code>button</code> shrink-wraps its text, so every row became as wide as its own sentence.</p>
                <p className="cs-why">Fixed by keeping the <code>div</code> and adding <code>role="button"</code>, <code>tabIndex</code> and an Enter/Space handler — accessibility kept, layout intact. Semantics and layout aren't separable.</p>
              </div>
            </div>
          </article>

          {/* 3 — double scale */}
          <article className="cs-prob">
            <header><span className="cs-tag">Measurement</span>
              <h3 className="cs-h3">The pill that measured itself wrong</h3></header>
            <div className="cs-prob-body">
              <div className="cs-demo-box">
                <div className="cs-navdemo">
                  <span className="cs-ab-lbl cs-ab-bad">rect — scaled twice, label spills</span>
                  <div className="cs-fakenav"><span className="cs-fakepill cs-fakepill-bad" style={{ width: 44 }} /><span className="cs-fakenav-lbl">Profile</span></div>
                  <span className="cs-ab-lbl cs-ab-good" style={{ marginTop: space[10] }}>offsetWidth — pill fits the label</span>
                  <div className="cs-fakenav"><span className="cs-fakepill" style={{ width: 86 }} /><span className="cs-fakenav-lbl">Profile</span></div>
                </div>
              </div>
              <div className="cs-explain">
                <p className="cs-body cs-tight">The preview shrinks the phone to fit your window. The sliding pill measured itself with <code>getBoundingClientRect()</code> — which returns <i>already-shrunk</i> numbers — then those got shrunk again on apply. 6px too narrow; the label spilled out.</p>
                <p className="cs-why">Layout metrics (<code>offsetWidth</code>) ignore transforms. The wider lesson: a device preview is a scaled coordinate space, and every measurement inside it has to declare which space it's in.</p>
              </div>
            </div>
          </article>

          {/* 4 — density */}
          <article className="cs-prob">
            <header><span className="cs-tag">Fidelity</span>
              <h3 className="cs-h3">A newer phone is a layout change</h3></header>
            <div className="cs-prob-body">
              <div className="cs-demo-box">
                {/* fluid: the two bars stay in true 390:402 proportion at any
                    width, so the 3% reads correctly on a phone as well as a desktop */}
                <div className="cs-ab cs-ab-stack">
                  <div className="cs-ab-col">
                    <span className="cs-ab-lbl cs-ab-good">390pt — the canvas it was tuned on</span>
                    <div className="cs-scalebar" style={{ width: `${(390 / 402) * 100}%` }}><span>390</span></div>
                  </div>
                  <div className="cs-ab-col">
                    <span className="cs-ab-lbl cs-ab-bad">402pt — every element gains 3%</span>
                    <div className="cs-scalebar" style={{ width: "100%" }}>
                      <span>390</span>
                      <i className="cs-scalebar-extra" style={{ width: `${(12 / 402) * 100}%` }}>+12</i>
                    </div>
                  </div>
                </div>
              </div>
              <div className="cs-explain">
                <p className="cs-body cs-tight">Moving the frame to an iPhone 17 Pro handed every element ~3% more width. Two-line copy became one line; the whole design read looser and thinner than it was tuned to be.</p>
                <p className="cs-why">Fix: draw the UI on its native 390×844 canvas and scale <i>that</i> to the 402×874 screen. The frame changed; the density didn't.</p>
              </div>
            </div>
          </article>

          {/* 5 — contrast */}
          <article className="cs-prob">
            <header><span className="cs-tag">Accessibility</span>
              <h3 className="cs-h3">One token, twenty failures</h3></header>
            <div className="cs-prob-body">
              <div className="cs-demo-box">
                {/* chips, not low-contrast text: the ratio is stated in readable ink
                    rather than demonstrated with an unreadable sample. */}
                <div className="cs-ratios">
                  <div className="cs-ratio">
                    <span className="cs-ratio-chip" style={{ background: "#858E78" }} />
                    <span className="cs-ratio-hex">#858E78</span>
                    <span className="cs-ratio-val cs-ab-bad">3.25:1 — fails AA</span>
                  </div>
                  <div className="cs-ratio">
                    <span className="cs-ratio-chip" style={{ background: color.inkFaint }} />
                    <span className="cs-ratio-hex">{color.inkFaint}</span>
                    <span className="cs-ratio-val cs-ab-good">5.11:1 — passes</span>
                  </div>
                </div>
              </div>
              <div className="cs-explain">
                <p className="cs-body cs-tight">Every caption, timestamp and helper line drew from one colour that sat at 3.25:1 — below the 4.5:1 AA threshold — failing in roughly twenty places at once.</p>
                <p className="cs-why">One value changed; twenty failures cleared; nothing else in the palette moved. That is the entire argument for tokens, in one edit.</p>
              </div>
            </div>
          </article>
        </div>
      </Section>

      {/* ---------- tests ---------- */}
      <Section id="tests" kicker="Tests" title="What the suite actually guards"
        lede={`${FACTS.assertions} tests across ${FACTS.testFiles} files. They don't chase coverage — each one pins a rule that a real bug broke, so the same mistake can't return quietly.`}>
        <div className="cs-tests">
          {[
            ["Contrast can't regress", "Every ink colour is checked against every surface it sits on, and the status label colours against cards. The original audit found ~20 failures from one token; if a future palette edit drops any text below the 4.5:1 threshold, the build fails instead of shipping."],
            ["Spacing stays on the grid", "Asserts no spacing token is an odd number, and that the screen gutter is a single token set to 20. That's the rule the spacing pass established — this stops it eroding one hand-typed value at a time."],
            ["The embed can't land on splash", "The case study drives the phone by route name. If a journey key and a route key ever drift apart, the embed would silently fall back to the splash screen. A test compares the two lists directly."],
            ["The page can't lie", "Every token count printed on this page is asserted against the module it describes, and the test-file count counts the files on disk. A number here cannot go stale without turning the suite red."],
          ].map(([t, d]) => (
            <div key={t} className="cs-test"><h3 className="cs-h3">{t}</h3><p className="cs-body cs-tight">{d}</p></div>
          ))}
        </div>

        <div className="cs-prob" style={{ marginTop: space[16] }}>
          <header><span className="cs-tag">Example</span><h3 className="cs-h3">The test that keeps this page honest</h3></header>
          <div className="cs-prob-body">
            {/* focusable: it can scroll on narrow screens, and a scrollable
                region has to be reachable by keyboard */}
            <pre className="cs-code" tabIndex={0} aria-label="Example test">
              <code>{`it("testFiles matches disk", () => {
  const found =
    import.meta.glob("./**/*.test.{js,jsx}");

  // glob omits the importing module
  expect(FACTS.testFiles).toBe(
    Object.keys(found).length + 1
  );
});`}</code></pre>
            <div className="cs-explain">
              <div className="cs-explain-label">In plain English</div>
              <p className="cs-body cs-tight">
                This page claims a number of test files. Rather than trusting me to update that number, the
                test asks the build tool to list the test files that actually exist and compares the two. Add
                a test file, or delete one, and forget to update the page — the suite goes red.
              </p>
              <p className="cs-why">
                It's a small thing, but it's the difference between a portfolio number that was true once and
                one that's still true. The same pattern covers the colour, type and spacing counts above.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ---------- accessibility ---------- */}
      <Section id="a11y" kicker="Accessibility" title="Audited, fixed, re-audited">
        <div className="cs-a11y">
          <div className="cs-a11y-score">
            <div className="cs-a11y-n">{FACTS.axeViolations}</div>
            <div className="cs-a11y-l">violations · {FACTS.axeScreens} core screens<br /><span>axe-core {FACTS.axeVersion} · WCAG 2.1 AA</span></div>
          </div>
          <div className="cs-a11y-body">
            <ul className="cs-fixlist">
              <li><b>~20</b> contrast failures — one token</li>
              <li><b>1</b> toggle unreachable by keyboard</li>
              <li><b>4</b> inputs with no accessible name</li>
              <li><b>56</b> animations ignoring reduce-motion</li>
              <li><b>10</b> screen titles that weren't headings</li>
            </ul>
            <p className="cs-body cs-tight">What the zero means: no automated rule fails today. What it doesn't: this hasn't been tested with a real screen reader, or by anyone who relies on one.</p>
          </div>
        </div>
      </Section>

      {/* ---------- what's ahead ---------- */}
      <Section id="next" kicker="What's ahead" title="Where this goes next"
        lede="The light model is the foundation, not the feature. Everything below builds on a garden that already knows what time it is.">
        <div className="cs-next">
          {[
            ["Next", "Light that knows your window",
              "The model runs on the clock today. Feeding it the room's orientation and the local forecast would let the scene reflect this actual Tuesday — overcast, north-facing, shorter days — and move a plant's care window with the season."],
            ["Next", "A garden that persists",
              "Sync turns the seeded demo into a real garden that follows you across devices, and turns the photo journal into a genuine record of a plant over years rather than a session."],
            ["Later", "Identification that earns its confidence",
              "The two-shot scan already asks for the plant and the room. A real vision model could use both — species from the close-up, placement advice from the light — and show its confidence instead of asserting a name."],
            ["Later", "Beyond one screen size",
              "The layout is tuned for a single canvas. A size-class strategy would let the same garden open up on a tablet, where rooms and their plants can sit side by side."],
            ["Exploring", "Care that's shared",
              "Plants in a shared home have more than one carer. Letting a household see the same garden — and who watered last — removes the most common cause of an overwatered plant."],
            ["Exploring", "The scene as a widget",
              "The home screen is already a glanceable state. On a lock screen it would need no interaction at all: you'd learn your garden's condition without opening anything."],
          ].map(([tag, t, d]) => (
            <article key={t} className="cs-next-item">
              <span className={`cs-next-tag cs-next-${tag.toLowerCase()}`}>{tag}</span>
              <h3 className="cs-h3">{t}</h3>
              <p className="cs-body cs-tight">{d}</p>
            </article>
          ))}
        </div>
        <div className="cs-callout" style={{ marginTop: space[16] }}>
          <div>
            <b>Honest footing.</b> This is a working prototype: state lives in the session, identification is
            a faithful mock rather than a vision model, and the {FACTS.assertions} tests cover tokens,
            routing and rendering rather than driving a real browser. Those are the starting conditions for
            the list above, not hidden caveats.
          </div>
        </div>
      </Section>

      <footer className="cs-footer">
        <div className="cs-wrap cs-footer-inner">
          <span>Verdure — design case study</span>
          <span>{FACTS.commits} commits · React &amp; Vite · <a href="/?screen=garden">open the app</a></span>
        </div>
      </footer>
    </div>
  );
}

const css = `
  .cs-root { background: ${color.surface}; color: ${color.ink}; font-family: ${ds.family};
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; min-height: 100vh; }
  .cs-root *, .cs-root *::before, .cs-root *::after { box-sizing: border-box; }
  .cs-root p { margin: 0; }
  .cs-root a { color: inherit; }
  .cs-root button { font-family: inherit; cursor: pointer; }
  .cs-wrap { max-width: ${MAXW}px; margin: 0 auto; padding: 0 ${space[24]}px; }

  .cs-kicker { font-size: ${ds.size.sm}px; font-weight: ${ds.weight.bold};
    letter-spacing: 0.16em; text-transform: uppercase; color: ${color.brandBright}; }
  .cs-kicker-dark { color: ${palette.leaf200}; }
  .cs-h1 { font-size: clamp(46px, 8.2vw, 104px); font-weight: ${ds.weight.extrabold};
    line-height: 0.95; letter-spacing: -0.04em; margin: ${space[20]}px 0 0; }
  .cs-h1 em { font-style: italic; font-weight: ${ds.weight.medium}; color: ${palette.leaf200}; }
  .cs-h2 { font-size: clamp(28px, 3.8vw, 46px); font-weight: ${ds.weight.extrabold};
    letter-spacing: -0.025em; margin: ${space[8]}px 0 0; }
  .cs-h3 { font-size: ${ds.size.xl}px; font-weight: ${ds.weight.bold}; letter-spacing: -0.01em; margin: 0 0 ${space[6]}px; }
  .cs-root .cs-body { font-size: ${ds.size.lg}px; font-weight: ${ds.weight.medium};
    line-height: ${ds.leading.normal}; color: ${color.inkSoft}; margin-top: ${space[12]}px; }
  .cs-root .cs-tight { font-size: ${ds.size.md}px; margin-top: ${space[8]}px; }
  .cs-root .cs-lede { font-size: clamp(16px, 1.7vw, ${ds.size.xl}px); font-weight: ${ds.weight.medium};
    line-height: ${ds.leading.snug}; color: ${color.inkSoft}; max-width: 66ch; margin-top: ${space[14]}px; }
  .cs-root code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em;
    background: ${color.brand}12; color: ${color.brand}; padding: 1px 5px; border-radius: ${radius.xs}px; }

  /* the bar is painted into the hero until you scroll past it */
  .cs-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 20;
    background: transparent; border-bottom: 1px solid transparent; color: ${palette.onDark};
    transition: background ${motion.duration.base} ${motion.easing.standard},
                border-color ${motion.duration.base} ${motion.easing.standard},
                color ${motion.duration.base} ${motion.easing.standard}; }
  .cs-bar.solid { background: ${color.surface}e8; color: ${color.ink};
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-bottom-color: ${color.line}; }
  .cs-bar-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
  .cs-brand { display: flex; align-items: center; gap: ${space[12]}px; text-decoration: none;
    font-weight: ${ds.weight.extrabold}; letter-spacing: 0.09em;
    font-size: clamp(17px, 1.35vw, 20px); }
  .cs-brand-mark { width: 30px; height: 30px; flex-shrink: 0; }
  .cs-brand-sub { font-weight: ${ds.weight.medium}; letter-spacing: 0; font-size: ${ds.size.base}px;
    opacity: 0.62; }
  .cs-bar-cta { display: inline-flex; align-items: center; gap: ${space[6]}px; text-decoration: none;
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.bold}; color: inherit;
    background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.22);
    padding: ${space[8]}px ${space[14]}px; border-radius: ${radius.pill}px;
    white-space: nowrap; flex-shrink: 0;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    transition: background ${motion.duration.fast} ${motion.easing.standard}; }
  .cs-bar-cta:hover { background: rgba(255,255,255,0.24); }
  .cs-bar.solid .cs-bar-cta { color: ${color.brand}; background: ${color.brand}14; border-color: transparent; }
  .cs-bar.solid .cs-bar-cta:hover { background: ${color.brand}22; }

  /* hero — a full-viewport day running on a loop */
  /* exactly one viewport — the bar is painted inside it */
  .cs-hero { position: relative; overflow: hidden; color: ${palette.onDark};
    height: 100svh; min-height: 600px; display: flex; align-items: center;
    padding: 64px 0 0; }
  .cs-sky { position: absolute; inset: 0; transition: background 120ms linear; }
  .cs-stars { position: absolute; inset: 0;
    background-image:
      radial-gradient(1.4px 1.4px at 12% 18%, #fff, transparent),
      radial-gradient(1.2px 1.2px at 28% 34%, #fff, transparent),
      radial-gradient(1.6px 1.6px at 46% 12%, #fff, transparent),
      radial-gradient(1.2px 1.2px at 63% 27%, #fff, transparent),
      radial-gradient(1.5px 1.5px at 78% 15%, #fff, transparent),
      radial-gradient(1.2px 1.2px at 88% 33%, #fff, transparent),
      radial-gradient(1.3px 1.3px at 36% 8%, #fff, transparent),
      radial-gradient(1.1px 1.1px at 71% 6%, #fff, transparent); }
  /* position and colour come from the product's own celestialPos()/lightAt() */
  .cs-orb { position: absolute; width: clamp(90px, 10vw, 150px); aspect-ratio: 1;
    border-radius: 50%; transform: translate(-50%, -50%); filter: blur(1px); }
  .cs-orb-moon { width: clamp(64px, 7vw, 104px);
    background: radial-gradient(circle, #EEF2FA 0%, rgba(226,232,244,0.55) 40%, transparent 70%); }
  /* the headline sits over a constant dark base, so contrast never depends on
     which phase the sky happens to be in */
  .cs-hero-scrim { position: absolute; inset: 0; pointer-events: none;
    background:
      linear-gradient(100deg, rgba(6,10,8,0.92) 0%, rgba(6,10,8,0.78) 30%, rgba(6,10,8,0.34) 60%, rgba(6,10,8,0.04) 100%),
      linear-gradient(180deg, rgba(6,10,8,0.34) 0%, transparent 34%, rgba(6,10,8,0.4) 100%); }
  .cs-hero-garden { position: absolute; left: 0; right: 0; bottom: -1px; width: 100%;
    height: clamp(120px, 22vh, 240px); }
  .cs-hero-inner { position: relative; width: 100%; }
  .cs-hero-cue { position: absolute; left: 50%; bottom: clamp(24px, 4vh, 44px); transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: ${space[8]}px;
    font-size: ${ds.size["2xs"]}px; font-weight: ${ds.weight.extrabold};
    letter-spacing: 0.24em; text-transform: uppercase; color: ${palette.leaf200}; }
  .cs-hero-cue span { width: 1px; height: 34px;
    background: linear-gradient(${palette.leaf200}, transparent); }
  /* kicker gets a rule, so it reads as a label rather than floating text */
  .cs-kicker-dark { display: inline-flex; align-items: center; gap: ${space[12]}px;
    font-size: ${ds.size.xs}px; letter-spacing: 0.22em; color: ${palette.leaf300}; }
  .cs-kicker-dark::before { content: ""; width: 40px; height: 1px; background: ${palette.leaf300}; opacity: 0.6; }
  .cs-root .cs-standfirst { font-size: clamp(16px, 1.5vw, 19px); font-weight: ${ds.weight.medium};
    line-height: 1.62; color: ${palette.leaf100}; max-width: 44ch; margin-top: ${space[24]}px; }
  /* meta sits on a hairline, labels tighter and quieter than the values */
  /* sized to hold all four on one row once the values scale up */
  .cs-meta { display: flex; flex-wrap: wrap; gap: ${space[20]}px clamp(${space[18]}px, 2.4vw, ${space[32]}px);
    margin: clamp(${space[28]}px, 4vh, ${space[40]}px) 0 0; padding-top: ${space[20]}px;
    border-top: 1px solid rgba(255,255,255,0.16); max-width: 900px; }
  .cs-meta div { display: flex; flex-direction: column; gap: ${space[6]}px; }
  .cs-meta dt { font-size: clamp(10px, 0.86vw, 12px); font-weight: ${ds.weight.bold};
    letter-spacing: 0.16em; text-transform: uppercase; color: ${palette.leaf300}; }
  .cs-meta dd { margin: 0; font-size: clamp(15px, 1.35vw, 19px); font-weight: ${ds.weight.semibold};
    color: ${palette.onDark}; letter-spacing: -0.005em; }

  .cs-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: ${space[12]}px; margin-top: ${space[32]}px; }
  .cs-fact { background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.lg}px; padding: ${space[16]}px; box-shadow: ${shadow.e1}; }
  .cs-fact-n { font-size: 32px; font-weight: ${ds.weight.extrabold}; letter-spacing: -0.03em; }
  .cs-fact-l { font-size: ${ds.size.base}px; font-weight: ${ds.weight.semibold}; color: ${color.inkFaint}; margin-top: ${space[2]}px; }
  .cs-root .cs-footnote { font-size: ${ds.size.base}px; font-weight: ${ds.weight.medium};
    color: ${color.inkFaint}; margin-top: ${space[12]}px; }
  .cs-footnote a { color: ${color.brand}; }

  .cs-section { padding: clamp(48px, 6vw, 88px) 0 0; scroll-margin-top: 76px; }

  /* live demo */
  /* 380px so the frame's height, not its width, is what limits the scale —
     otherwise it can't grow tall enough to meet the last journey card */
  .cs-demo { display: grid; grid-template-columns: minmax(0, 1fr) 380px;
    gap: clamp(24px, 4vw, 48px); align-items: stretch; }
  .cs-demo-side { min-width: 0; }
  .cs-journeys { display: flex; flex-direction: column; gap: ${space[10]}px; margin-top: ${space[24]}px; }
  .cs-journey { display: flex; flex-direction: column; gap: ${space[4]}px; text-align: left;
    background: ${color.surfaceRaised}; border: 1px solid ${color.line}; border-radius: ${radius.lg}px;
    padding: ${space[18]}px ${space[20]}px;
    transition: border-color ${motion.duration.fast} ${motion.easing.standard},
                background ${motion.duration.fast} ${motion.easing.standard},
                transform ${motion.duration.fast} ${motion.easing.spring}; }
  .cs-journey:hover { border-color: ${color.brand}55; transform: translateX(2px); }
  .cs-journey.on { border-color: ${color.brand}; background: ${color.brand}0e; }
  .cs-journey-name { display: flex; align-items: center; gap: ${space[8]}px;
    font-size: ${ds.size.lg}px; font-weight: ${ds.weight.bold}; color: ${color.ink}; }
  .cs-journey.on .cs-journey-name { color: ${color.brand}; }
  .cs-journey-now { font-size: ${ds.size["2xs"]}px; font-weight: ${ds.weight.extrabold};
    letter-spacing: 0.1em; text-transform: uppercase; color: #fff; background: ${color.brand};
    padding: ${space[2]}px ${space[6]}px; border-radius: ${radius.xs}px; }
  .cs-journey-desc { font-size: ${ds.size.md}px; font-weight: ${ds.weight.medium};
    line-height: ${ds.leading.snug}; color: ${color.inkSoft}; }
  /* bottom-aligned so the frame finishes level with the last journey card;
     the badge above it lands level with the section title */
  .cs-device-col { display: flex; flex-direction: column; align-items: center;
    justify-content: flex-end; gap: ${space[20]}px; height: 100%; padding-bottom: 0; }
  .cs-device { width: 100%; }
  .cs-live-badge { display: inline-flex; align-items: center; gap: ${space[8]}px;
    font-size: ${ds.size.xs}px; font-weight: ${ds.weight.extrabold}; letter-spacing: 0.1em;
    text-transform: uppercase; color: ${color.brand}; background: ${color.brand}16;
    padding: ${space[6]}px ${space[12]}px; border-radius: ${radius.pill}px; }
  .cs-live-dot { width: 7px; height: 7px; border-radius: 50%; background: ${color.brand}; box-shadow: 0 0 0 3px ${color.brand}33; }
  .cs-inline-cta { display: inline-flex; align-items: center; gap: ${space[6]}px;
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.bold}; color: ${color.brand}; text-decoration: none; }
  .cs-inline-cta:hover { text-decoration: underline; }

  /* research → response */
  .cs-research { display: flex; flex-direction: column; gap: ${space[12]}px; margin-top: ${space[28]}px; }
  .cs-finding { display: grid; grid-template-columns: 62px minmax(0, 1.05fr) minmax(0, 0.95fr);
    gap: ${space[18]}px; align-items: start;
    background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.xl}px; padding: ${space[20]}px; box-shadow: ${shadow.e1}; }
  /* Colour: was brand at 20% alpha — 1.38:1, unreadable. Muted but legible now.
     Alignment: aligning line boxes is NOT aligning ink. At line-height 1 the
     numeral's cap top sits ~7.4px below its box top (46px), the heading's ~4.4px
     (17px) — so the numeral reads low by ~3px and needs pulling up, not down. */
  .cs-finding-n { font-size: 46px; font-weight: ${ds.weight.extrabold};
    color: ${color.inkFaint}; line-height: 1; letter-spacing: -0.04em;
    margin-top: -1px; font-variant-numeric: tabular-nums; }
  .cs-finding-body { min-width: 0; }
  .cs-source { display: inline-block; margin-top: ${space[10]}px;
    font-size: ${ds.size.sm}px; font-weight: ${ds.weight.bold}; color: ${color.brand}; text-decoration: none; }
  .cs-source:hover { text-decoration: underline; }
  .cs-response { min-width: 0; background: ${color.brand}0c; border: 1px solid ${color.brand}22;
    border-radius: ${radius.lg}px; padding: ${space[16]}px; }
  .cs-response-label { font-size: ${ds.size["2xs"]}px; font-weight: ${ds.weight.extrabold};
    letter-spacing: 0.12em; text-transform: uppercase; color: ${color.brandBright}; }
  .cs-root .cs-response .cs-body { margin-top: ${space[6]}px; }

  /* light-model diagram */
  .cs-phases { display: flex; border-radius: ${radius.lg}px; overflow: hidden;
    margin-top: ${space[28]}px; box-shadow: ${shadow.e1}; }
  .cs-phase { flex: 1; padding: ${space[20]}px ${space[14]}px; display: flex; flex-direction: column; gap: ${space[2]}px; }
  /* colour comes from the inline style (onSwatch) so both lines stay above AA */
  .cs-phase-name { font-size: ${ds.size.md}px; font-weight: ${ds.weight.bold}; }
  .cs-phase-range { font-size: ${ds.size.xs}px; font-weight: ${ds.weight.semibold}; }
  .cs-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: clamp(20px, 3vw, 40px); margin-top: ${space[24]}px; }

  /* tokens */
  .cs-tokengrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: ${space[16]}px; margin-top: ${space[28]}px; }
  .cs-span2 { grid-column: span 2; }
  .cs-token-card { background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.xl}px; padding: ${space[20]}px; box-shadow: ${shadow.e1}; }
  .cs-token-head { font-size: ${ds.size.sm}px; font-weight: ${ds.weight.bold}; letter-spacing: 0.1em;
    text-transform: uppercase; color: ${color.inkFaint}; margin-bottom: ${space[14]}px; }
  .cs-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: ${space[10]}px; }
  .cs-swatch { display: flex; flex-direction: column; gap: ${space[2]}px; }
  .cs-swatch-chip { height: 40px; border-radius: ${radius.md}px; border: 1px solid ${color.line}; margin-bottom: ${space[4]}px; }
  .cs-swatch-n { font-size: ${ds.size.base}px; font-weight: ${ds.weight.bold}; }
  .cs-swatch-hex { font-size: ${ds.size.sm}px; font-weight: ${ds.weight.semibold}; color: ${color.inkFaint}; text-transform: uppercase; }
  .cs-type-row { display: flex; align-items: baseline; gap: ${space[12]}px; padding: ${space[6]}px 0;
    border-bottom: 1px solid ${color.line}; }
  .cs-type-row:last-child { border-bottom: none; }
  .cs-type-spec { flex: 1; font-weight: ${ds.weight.bold}; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cs-type-meta { font-size: ${ds.size.sm}px; font-weight: ${ds.weight.semibold}; color: ${color.inkFaint}; flex-shrink: 0; }
  .cs-weights { display: flex; flex-wrap: wrap; gap: ${space[10]}px; }
  .cs-weight { display: flex; flex-direction: column; align-items: center; gap: ${space[2]}px; }
  .cs-weight small, .cs-radius small, .cs-elev small { font-size: ${ds.size.xs}px; font-weight: ${ds.weight.semibold}; color: ${color.inkFaint}; }
  .cs-radii { display: flex; flex-wrap: wrap; gap: ${space[10]}px; }
  .cs-radius { display: flex; flex-direction: column; align-items: center; gap: ${space[2]}px; }
  .cs-radius-box { width: 38px; height: 38px; background: ${color.brand}; }
  .cs-spaces { display: flex; flex-direction: column; gap: ${space[4]}px; }
  .cs-space-row { display: flex; align-items: center; gap: ${space[10]}px;
    font-size: ${ds.size.sm}px; font-weight: ${ds.weight.semibold}; color: ${color.inkFaint}; }
  .cs-space-row span { min-width: 20px; }
  .cs-space-row i { height: 10px; background: ${color.brandBright}; border-radius: ${radius.xs}px; }
  .cs-elevs { display: flex; flex-wrap: wrap; gap: ${space[16]}px; }
  .cs-elev { display: flex; flex-direction: column; align-items: center; gap: ${space[8]}px; }
  .cs-elev-box { width: 60px; height: 40px; background: ${color.surface}; border-radius: ${radius.md}px; }
  .cs-gutterdemo { display: flex; align-items: stretch; height: 46px; border-radius: ${radius.md}px;
    overflow: hidden; border: 1px solid ${color.line}; }
  .cs-gutterdemo-edge { display: grid; place-items: center; background: ${color.brand}22;
    color: ${color.brand}; font-size: 9px; font-weight: ${ds.weight.extrabold}; flex-shrink: 0; }
  .cs-gutterdemo-body { flex: 1; display: grid; place-items: center; background: ${color.surface};
    font-size: ${ds.size.sm}px; font-weight: ${ds.weight.semibold}; color: ${color.inkFaint}; }
  .cs-durations { display: flex; flex-direction: column; gap: ${space[8]}px; }
  .cs-duration { display: flex; align-items: center; gap: ${space[10]}px;
    font-size: ${ds.size.sm}px; font-weight: ${ds.weight.semibold}; color: ${color.inkFaint}; }
  .cs-duration-n { min-width: 52px; color: ${color.inkSoft}; }
  .cs-duration-bar { height: 8px; background: ${color.brandBright}; border-radius: ${radius.xs}px; }
  .cs-duration-v { margin-left: auto; }
  .cs-motion-row { display: flex; align-items: center; gap: ${space[12]}px; padding: ${space[8]}px 0; }
  .cs-motion-name { font-size: ${ds.size.sm}px; font-weight: ${ds.weight.bold}; min-width: 68px; }
  .cs-track { flex: 1; height: 8px; background: ${color.brand}14; border-radius: ${radius.pill}px; position: relative; }
  .cs-dot { position: absolute; top: -4px; left: 0; width: 16px; height: 16px; border-radius: 50%;
    background: ${color.brand}; transition: left .7s; }
  .cs-motion-row:hover .cs-dot { left: calc(100% - 16px); }
  .cs-pills { display: flex; flex-wrap: wrap; gap: ${space[8]}px; }
  .cs-pill { display: inline-flex; align-items: center; gap: ${space[6]}px; height: 28px;
    padding: 0 ${space[12]}px; border-radius: ${radius.pill}px; font-size: ${ds.size.base}px; font-weight: ${ds.weight.bold}; }
  .cs-pill-dot { width: 7px; height: 7px; border-radius: 50%; }
  .cs-callout { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
    gap: ${space[12]}px; margin-top: ${space[16]}px; padding: ${space[18]}px ${space[20]}px;
    background: ${color.brand}0c; border: 1px solid ${color.brand}22; border-radius: ${radius.xl}px;
    font-size: ${ds.size.lg}px; font-weight: ${ds.weight.medium}; color: ${color.inkSoft}; }
  .cs-callout b { color: ${color.ink}; }

  /* problems */
  .cs-probs { display: flex; flex-direction: column; gap: ${space[16]}px; margin-top: ${space[28]}px; }
  .cs-prob { background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.xl}px; padding: ${space[20]}px; box-shadow: ${shadow.e1}; }
  .cs-prob header { display: flex; align-items: center; gap: ${space[12]}px; flex-wrap: wrap; margin-bottom: ${space[16]}px; }
  .cs-prob header .cs-h3 { margin: 0; }
  .cs-tag { font-size: ${ds.size["2xs"]}px; font-weight: ${ds.weight.extrabold}; letter-spacing: 0.1em;
    text-transform: uppercase; color: #fff; background: ${color.brand};
    padding: ${space[4]}px ${space[8]}px; border-radius: ${radius.sm}px; }
  .cs-tag-red { background: ${palette.clay700}; } /* clay600 sat at 4.48:1 — just under AA */
  .cs-prob-body { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: ${space[18]}px; align-items: start; }
  .cs-demo-box { background: ${color.surface}; border: 1px solid ${color.line};
    border-radius: ${radius.lg}px; padding: ${space[16]}px; }
  .cs-ab { display: grid; grid-template-columns: 1fr 1fr; gap: ${space[16]}px; }
  .cs-ab-stack { grid-template-columns: 1fr; gap: ${space[12]}px; }
  .cs-ab-col { display: flex; flex-direction: column; gap: ${space[6]}px; min-width: 0; }
  .cs-ab-lbl { font-size: ${ds.size["2xs"]}px; font-weight: ${ds.weight.extrabold}; letter-spacing: 0.08em;
    text-transform: uppercase; }
  .cs-ab-good { color: ${color.thrivingText}; }
  .cs-ab-bad { color: ${color.needsCareText}; }
  .cs-ab-note { font-size: ${ds.size.sm}px; font-weight: ${ds.weight.semibold}; color: ${color.inkFaint};
    margin-top: ${space[12]}px; padding-top: ${space[10]}px; border-top: 1px solid ${color.line}; }
  .cs-fakerow { background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.md}px; padding: ${space[8]}px ${space[12]}px; margin-bottom: ${space[6]}px;
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.semibold}; color: ${color.inkSoft}; }
  .cs-rowdemo, .cs-navdemo { display: flex; flex-direction: column; gap: ${space[4]}px; }
  .cs-fakenav { position: relative; display: flex; align-items: center; justify-content: center;
    height: 40px; border-radius: ${radius.pill}px; background: ${palette.black600}; }
  .cs-fakepill { position: absolute; height: 30px; border-radius: ${radius.pill}px; background: ${color.surfaceAlt}; }
  .cs-fakenav-lbl { position: relative; font-size: ${ds.size.md}px; font-weight: ${ds.weight.bold}; color: ${palette.black600}; }
  /* the label overflowing its too-small pill onto the dark bar — the actual bug */
  .cs-fakepill-bad { box-shadow: 0 0 0 2px ${color.needsCare}; }
  .cs-scalebar { position: relative; display: flex; align-items: center; height: 34px;
    border-radius: ${radius.sm}px; background: ${color.brand}; color: #fff;
    font-size: ${ds.size.sm}px; font-weight: ${ds.weight.extrabold}; padding-left: ${space[10]}px; }
  .cs-scalebar-extra { position: absolute; right: 0; top: 0; height: 100%;
    background: ${color.needsCare}; border-radius: 0 ${radius.sm}px ${radius.sm}px 0;
    display: flex; align-items: center; justify-content: center; overflow: visible;
    font-size: ${ds.size["2xs"]}px; font-style: normal; white-space: nowrap; }
  .cs-widthbox { background: ${color.surfaceRaised}; border: 1px solid ${color.line}; border-radius: ${radius.md}px;
    padding: ${space[8]}px ${space[10]}px; font-size: 11.5px; line-height: 1.35; color: ${color.inkSoft}; }
  .cs-ratios { display: flex; flex-direction: column; gap: ${space[10]}px; }
  .cs-ratio { display: flex; align-items: center; gap: ${space[10]}px; }
  .cs-ratio-chip { width: 40px; height: 40px; border-radius: ${radius.md}px; border: 1px solid ${color.line}; flex-shrink: 0; }
  .cs-ratio-hex { font-size: ${ds.size.base}px; font-weight: ${ds.weight.bold}; min-width: 68px; }
  .cs-ratio-val { font-size: ${ds.size["2xs"]}px; font-weight: ${ds.weight.extrabold};
    letter-spacing: 0.06em; text-transform: uppercase; }
  .cs-tests { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: ${space[16]}px; margin-top: ${space[28]}px; }
  .cs-test { background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.lg}px; padding: ${space[18]}px; }
  .cs-code { margin: 0; padding: ${space[16]}px; overflow-x: auto;
    background: ${color.brandDeep}; border-radius: ${radius.lg}px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: ${ds.size.base}px; line-height: 1.6; color: ${palette.leaf100}; }
  .cs-code code { background: none; color: inherit; padding: 0; font-size: inherit; }
  .cs-explain { min-width: 0; }
  .cs-explain-label { font-size: ${ds.size["2xs"]}px; font-weight: ${ds.weight.extrabold};
    letter-spacing: 0.12em; text-transform: uppercase; color: ${color.brandBright}; }
  .cs-why { font-size: ${ds.size.md}px; font-weight: ${ds.weight.medium}; font-style: italic;
    line-height: ${ds.leading.snug}; color: ${color.inkFaint}; margin-top: ${space[12]}px;
    padding-top: ${space[12]}px; border-top: 1px solid ${color.line}; }

  /* a11y */
  .cs-a11y { display: grid; grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
    gap: clamp(20px, 3vw, 40px); align-items: start; margin-top: ${space[28]}px; }
  .cs-a11y-score { background: ${color.brand}; color: #fff; border-radius: ${radius.xl}px;
    padding: ${space[24]}px; box-shadow: ${shadow.e2}; }
  .cs-a11y-n { font-size: 72px; font-weight: ${ds.weight.extrabold}; line-height: 1; letter-spacing: -0.04em; }
  .cs-a11y-l { font-size: ${ds.size.md}px; font-weight: ${ds.weight.semibold}; line-height: ${ds.leading.snug};
    margin-top: ${space[10]}px; color: ${palette.leaf100}; }
  .cs-a11y-l span { font-weight: ${ds.weight.medium}; }
  .cs-fixlist { list-style: none; margin: 0; padding: 0; display: grid; gap: ${space[6]}px; }
  .cs-fixlist li { font-size: ${ds.size.lg}px; font-weight: ${ds.weight.medium}; color: ${color.inkSoft};
    padding-left: ${space[18]}px; position: relative; }
  .cs-fixlist li::before { content: "✓"; position: absolute; left: 0; color: ${color.thrivingText}; font-weight: ${ds.weight.extrabold}; }
  .cs-fixlist b { color: ${color.ink}; font-weight: ${ds.weight.extrabold}; }

  .cs-next { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: ${space[16]}px; margin-top: ${space[28]}px; }
  .cs-next-item { background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.lg}px; padding: ${space[20]}px; }
  .cs-next-item .cs-h3 { margin-top: ${space[10]}px; }
  .cs-next-tag { display: inline-block; font-size: ${ds.size["2xs"]}px; font-weight: ${ds.weight.extrabold};
    letter-spacing: 0.1em; text-transform: uppercase; padding: ${space[4]}px ${space[8]}px;
    border-radius: ${radius.sm}px; }
  .cs-next-next { background: ${color.brand}; color: #fff; }
  .cs-next-later { background: ${color.brand}1e; color: ${color.brand}; }
  .cs-next-exploring { background: ${color.line}; color: ${color.inkSoft}; }

  .cs-footer { margin-top: clamp(56px, 7vw, 96px); border-top: 1px solid ${color.line};
    padding: ${space[24]}px 0 ${space[40]}px; }
  .cs-footer-inner { display: flex; justify-content: space-between; flex-wrap: wrap; gap: ${space[10]}px;
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.semibold}; color: ${color.inkFaint}; }
  .cs-footer a { color: ${color.brand}; }

  @media (max-width: 900px) {
    .cs-span2 { grid-column: span 1; }
    .cs-prob-body { grid-template-columns: 1fr; }
  }
  @media (max-width: 560px) {
    .cs-brand-sub { display: none; }          /* was wrapping to a second line */
    .cs-kicker-dark::before { display: none; } /* rule crowds the label on narrow screens */
    .cs-finding { grid-template-columns: 1fr; gap: ${space[14]}px; }
    .cs-finding-n { font-size: ${ds.size.lg}px; }
  }
  @media (max-width: 860px) {
    .cs-demo { grid-template-columns: 1fr; }
    .cs-finding { grid-template-columns: 36px minmax(0, 1fr); }
    .cs-finding .cs-response { grid-column: 1 / -1; }
    .cs-device-col { position: static; order: -1; }
    .cs-device { max-width: 300px; margin: 0 auto; }
    .cs-a11y { grid-template-columns: 1fr; }
    .cs-phases { flex-direction: column; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cs-root *, .cs-root *::before, .cs-root *::after {
      animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
`;
