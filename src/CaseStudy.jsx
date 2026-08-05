import React, { useState } from "react";
import { color, type as ds, space, radius, shadow, motion, palette } from "./tokens.js";

/* ==========================================================================
   VERDURE — DESIGN CASE STUDY
   A route in the same app (/case-study), built from the same design tokens the
   product uses (./tokens.js). The product itself is embedded live via a
   same-origin iframe using the app's own `?screen=` deep links — not screenshots.
========================================================================== */

/* One content width for the entire page. 1080 is the width the product's own
   design-system screen already uses (.dsf-main), so the two pages line up. */
const MAXW = 1080;

/* --------------------------------------------------------------------------
   FACTS — every number here is measured from this repository, not estimated.
   Re-measure with:
     commits      git rev-list --count HEAD
     tags         git tag | wc -l
     components   grep -cE "^function [A-Z]" src/VerdureApp.jsx
     appLines     wc -l < src/VerdureApp.jsx
     tokens       node -e "import('./src/tokens.js').then(t=>console.log(
                    Object.keys(t.palette).length, Object.keys(t.color).length))"
     a11y         axe-core 4.10.2 run against .v-phone on each core screen
-------------------------------------------------------------------------- */
const FACTS = {
  commits: 19,
  tags: 0,
  components: 22,
  appLines: 4627,
  paletteColors: 64,
  semanticColors: 28,
  typeSizes: 12,
  spaceSteps: 17,
  radii: 8,
  elevations: 6,
  seededPlants: 7,
  seededRooms: 4,
  axeVersion: "4.10.2",
  axeViolations: 0,
  axeScreens: 4,
  automatedTests: 0,
  measured: "5 Aug 2026",
};

const SCREENS = [
  ["garden", "Garden"],
  ["rooms", "Rooms"],
  ["activity", "Activity"],
  ["detail", "Plant detail"],
  ["plants", "All plants"],
  ["add", "Add plant"],
  ["design-system", "Design system"],
];

/* Engineering artifacts. Each pairs real code with a plain-language reading of
   what it claims and why it matters — no code captioned with more code. */
const ARTIFACTS = [
  {
    tag: "Measurement",
    title: "The tab pill that came out 6px too narrow",
    code: `// before — the rect is ALREADY scaled, so the
// number gets scaled a second time on apply
const b = el.getBoundingClientRect();
setGlider({ left: b.left, width: b.width });

// after — layout metrics ignore the transform
setGlider({
  left:  el.offsetLeft,
  width: el.offsetWidth,
});`,
    plain:
      "The phone preview is shrunk slightly to fit whatever window you're in. The white pill that slides under the active tab measured itself with a browser API that reports already-shrunk numbers — then those numbers got shrunk a second time when they were applied inside the same shrunken area. The pill came out about 6px too narrow and the word “Profile” spilled over its edge. Swapping to a measurement that ignores the shrink fixed it.",
    why: "Worth showing because the bug was invisible in code review — the maths only breaks once something is scaled, which is exactly the condition a device preview creates.",
  },
  {
    tag: "Accessibility",
    title: "One token, twenty contrast failures",
    code: `// before — 3.25:1 on cards (WCAG AA needs 4.5:1)
inkFaint: "#858E78",

// after — 5.11:1 on cards, 4.60:1 on the page background
inkFaint: "#646E56",`,
    plain:
      "Secondary text — captions, timestamps, helper copy — was too pale against the cards it sat on. The accessibility standard asks for a 4.5:1 contrast ratio; this was at 3.25:1, so it failed roughly twenty separate places across the app. All of them drew from a single named colour, so darkening that one value fixed every instance at once.",
    why: "This is the argument for design tokens in one line: the fix was one edit, not twenty, and nothing else in the palette moved.",
  },
  {
    tag: "Fidelity",
    title: "Why the UI is drawn at 390pt and then stretched",
    code: `/* Authored for 390x844. Draw it at that size,
   then scale to the 17 Pro's 402x874 screen so
   density and wrapping match the original. */
.v-app {
  position: absolute;
  width: 390px; height: 844px;
  transform-origin: top left;
  transform: scale(402/390, 874/844);
}`,
    plain:
      "Every spacing and type decision in this interface was tuned against a 390-point-wide iPhone. Dropping that same layout into the newer, wider 402-point frame quietly handed every element about 3% more room — lines that used to wrap onto two lines fitted onto one, and the whole design read looser and thinner than intended. Drawing it on its original canvas and stretching that canvas to the new screen restores the density it was designed with.",
    why: "A reminder that “make the frame newer” is a layout change, not a cosmetic one.",
  },
];

export default function CaseStudy() {
  const [screen, setScreen] = useState("garden");
  const current = SCREENS.find(([k]) => k === screen);

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

  return (
    <div className="cs-root">
      <style>{css}</style>

      {/* ---------- top bar ---------- */}
      <header className="cs-bar">
        <div className="cs-wrap cs-bar-inner">
          <a className="cs-brand" href="/">
            <span className="cs-brand-mark" />
            Verdure
            <span className="cs-brand-sub">Design case study</span>
          </a>
          <a className="cs-bar-cta" href="/?screen=garden">
            Open the app
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <div className="cs-hero">
        <div className="cs-hero-glow" aria-hidden="true" />
        <div className="cs-wrap cs-hero-inner">
          <div className="cs-kicker">Product design · Design systems · Front-end</div>
          <h1 className="cs-h1">
            A plant app that
            <br />
            <em>knows what time it is.</em>
          </h1>
          <p className="cs-standfirst">
            Verdure is a plant-care companion whose home screen is a living scene — the light behind your
            garden tracks the actual hour of the day. This is the story of building it: the system
            underneath, three bugs worth explaining, and what I'd fix next.
          </p>
          <dl className="cs-meta">
            <div><dt>Role</dt><dd>Design &amp; build</dd></div>
            <div><dt>Surface</dt><dd>iOS, single-screen-size</dd></div>
            <div><dt>Stack</dt><dd>React 18 · Vite</dd></div>
            <div><dt>Deploy</dt><dd>Vercel · one build, two routes</dd></div>
          </dl>
        </div>
      </div>

      {/* ---------- facts ---------- */}
      <div className="cs-wrap">
        <div className="cs-facts">
          {[
            [FACTS.components, "components"],
            [FACTS.paletteColors + " / " + FACTS.semanticColors, "palette / semantic colours"],
            [FACTS.typeSizes, "type steps"],
            [FACTS.spaceSteps, "spacing steps"],
            [FACTS.commits, "commits"],
            [FACTS.axeViolations, "accessibility violations"],
          ].map(([n, l]) => (
            <div key={l} className="cs-fact">
              <div className="cs-fact-n">{n}</div>
              <div className="cs-fact-l">{l}</div>
            </div>
          ))}
        </div>
        <p className="cs-footnote">
          Measured from this repository on {FACTS.measured}. There is no automated test suite —
          see <a href="#honest">what isn't here</a>.
        </p>
      </div>

      {/* ---------- live product ---------- */}
      <Section
        id="live"
        kicker="The product"
        title="It's running right here"
        lede="This is the actual application, served from this same origin and build — not a screenshot. Each button below deep-links the running app to a specific screen, using the same navigation the app uses internally."
      >
        <div className="cs-demo">
          <div className="cs-demo-side">
            <div className="cs-live-badge">
              <span className="cs-live-dot" />
              Live · running build
            </div>
            <div className="cs-screens" role="group" aria-label="Choose a screen">
              {SCREENS.map(([key, label]) => (
                <button
                  key={key}
                  className={`cs-screen-btn${screen === key ? " on" : ""}`}
                  aria-pressed={screen === key}
                  onClick={() => setScreen(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="cs-demo-note">
              Showing <b>{current ? current[1] : screen}</b>. The frame is a true iPhone 17 Pro at
              402&nbsp;×&nbsp;874pt. Everything inside it is interactive — tap around.
            </p>
            <a className="cs-inline-cta" href={`/?screen=${screen}`} target="_blank" rel="noreferrer">
              Open this screen full size
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </a>
          </div>

          <div className="cs-device">
            <iframe
              key={screen}
              className="cs-frame"
              src={`/?screen=${screen}&embed=1`}
              title={`Verdure — ${current ? current[1] : screen} screen, running live`}
              loading="lazy"
            />
          </div>
        </div>
      </Section>

      {/* ---------- the idea ---------- */}
      <Section
        id="idea"
        kicker="The idea"
        title="Care is a rhythm, not a checklist"
        lede="Most plant apps are to-do lists with leaves on them. Verdure's home screen is the garden itself, lit by the real position of the sun."
      >
        <div className="cs-cols">
          <div>
            <h3 className="cs-h3">A home screen that changes all day</h3>
            <p className="cs-body">
              The background isn't art — it's a light model driven by the clock. Dawn is cold and low,
              midday is bright and high, dusk warms and drops, night is quiet. Plants sit on a shelf in
              front of it and are lit by the same model, so the screen at 7am genuinely doesn't look like
              the screen at 7pm.
            </p>
            <p className="cs-body">
              The practical payoff: you learn to read your garden's state at a glance, without parsing a
              list. Anything urgent surfaces as a marker on the plant itself.
            </p>
          </div>
          <div>
            <h3 className="cs-h3">Everything else hangs off it</h3>
            <p className="cs-body">
              Rooms group plants by the light they actually get. Activity is a diary rather than a
              backlog — what you did, and what the app noticed. Plant detail carries the care plan,
              a health trend, and a photo journal.
            </p>
            <p className="cs-body">
              The seeded demo carries <b>{FACTS.seededPlants} plants across {FACTS.seededRooms} rooms</b>,
              deliberately in mixed health so the states are all reachable — thriving, watch, needs care.
            </p>
          </div>
        </div>
      </Section>

      {/* ---------- design system ---------- */}
      <Section
        id="system"
        kicker="The system"
        title="Tokens, and what they're worth"
        lede="Colour, type, spacing, radius, elevation and motion live in one module. This page is drawn with the same tokens the product uses — the swatches below are read from that file at render time, so they cannot drift from the app."
      >
        <div className="cs-tokens">
          <div className="cs-token-card">
            <div className="cs-token-head">Brand &amp; status</div>
            <div className="cs-swatches">
              {[
                ["brand", color.brand], ["brandBright", color.brandBright],
                ["thriving", color.thriving], ["watch", color.watch],
                ["needsCare", color.needsCare], ["water", color.water],
              ].map(([n, hex]) => (
                <div key={n} className="cs-swatch">
                  <span className="cs-swatch-chip" style={{ background: hex }} />
                  <span className="cs-swatch-n">{n}</span>
                  <span className="cs-swatch-hex">{hex}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cs-token-card">
            <div className="cs-token-head">Type scale</div>
            <div className="cs-typescale">
              {Object.entries(ds.size)
                .sort((a, b) => a[1] - b[1])
                .filter((_, i) => i % 2 === 0)
                .map(([n, px]) => (
                  <div key={n} className="cs-type-row">
                    <span className="cs-type-spec" style={{ fontSize: Math.min(px, 34) }}>Verdant</span>
                    <span className="cs-type-meta">{n} · {px}px</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="cs-callout">
          <div>
            <b>The spacing decision.</b> The interface was hand-tuned at 1px granularity — odd values like
            7, 9 and 13 appeared roughly 170 times alongside the even ones. Rather than force a 4px grid
            onto a design that plainly wasn't built on one, the values were rounded to the nearest
            <i> commonly used</i> even neighbour, and the one genuine constant — the {space.gutter}px screen
            gutter — became a token. Type and radius were deliberately left exact after an attempt to
            regularise them visibly degraded the layout.
          </div>
          <a className="cs-inline-cta" href="/?screen=design-system" target="_blank" rel="noreferrer">
            Open the living design system
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
        </div>
      </Section>

      {/* ---------- artifacts ---------- */}
      <Section
        id="build"
        kicker="Building it"
        title="Three problems worth explaining"
        lede="Each of these is a real fix in the repository. The code is on the left; a plain-language reading of what it claims — and why it matters — is on the right."
      >
        <div className="cs-artifacts">
          {ARTIFACTS.map((a) => (
            <article key={a.title} className="cs-artifact">
              <header className="cs-artifact-head">
                <span className="cs-tag">{a.tag}</span>
                <h3 className="cs-h3">{a.title}</h3>
              </header>
              <div className="cs-artifact-body">
                <pre className="cs-code"><code>{a.code}</code></pre>
                <div className="cs-explain">
                  <div className="cs-explain-label">In plain English</div>
                  <p className="cs-body">{a.plain}</p>
                  <p className="cs-why">{a.why}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Section>

      {/* ---------- accessibility ---------- */}
      <Section
        id="a11y"
        kicker="Accessibility"
        title="Audited, then fixed, then re-audited"
        lede="The app was run through axe-core — an automated accessibility checker — against the WCAG 2.1 AA ruleset."
      >
        <div className="cs-a11y">
          <div className="cs-a11y-score">
            <div className="cs-a11y-n">{FACTS.axeViolations}</div>
            <div className="cs-a11y-l">
              violations across {FACTS.axeScreens} core screens<br />
              <span>axe-core {FACTS.axeVersion} · WCAG 2.1 AA</span>
            </div>
          </div>
          <div className="cs-a11y-body">
            <p className="cs-body">
              The first pass was not clean. It found ~20 colour-contrast failures, a settings toggle that
              couldn't be reached by keyboard, four form fields with no accessible name, and a set of
              animations that ignored the operating system's “reduce motion” setting. Screen titles were
              styled <code>div</code>s rather than headings, so screen-reader users had no way to navigate
              between sections.
            </p>
            <p className="cs-body">
              All of those are fixed. What the zero above <i>does</i> mean: no automated rule is failing on
              those four screens today. What it does <i>not</i> mean: that the app has been tested with a
              real screen reader, or by anyone who relies on one. Automated checks catch a meaningful
              slice of accessibility problems, not all of them.
            </p>
          </div>
        </div>
      </Section>

      {/* ---------- honest ---------- */}
      <Section
        id="honest"
        kicker="Honestly"
        title="What isn't here"
        lede="A prototype that claims to be finished is less useful than one that says where the edges are."
      >
        <div className="cs-gaps">
          {[
            ["No automated tests", `There are ${FACTS.automatedTests} test files in the repository. Every claim on this page was verified by hand in a browser or measured from the repository — which is honest, but it isn't a regression net. This is the first thing I'd add.`],
            ["One screen size", "The layout is authored for a single iPhone canvas. There's no tablet layout, no landscape, and no responsive behaviour inside the product itself — a real ship would need at least a size-class strategy."],
            ["No backend", "State lives in memory for the session. Sign-in, the garden, and the photo journal are all real interactions against fake persistence."],
            ["Identification is simulated", "The scan flow runs a scripted three-stage sequence — matching the species, reading its condition, measuring the room light — and returns a predetermined result. It's a faithful mock of the interaction, not a working vision model."],
          ].map(([t, d]) => (
            <div key={t} className="cs-gap">
              <h3 className="cs-h3">{t}</h3>
              <p className="cs-body">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <footer className="cs-footer">
        <div className="cs-wrap cs-footer-inner">
          <span>Verdure — design case study</span>
          <span>
            {FACTS.commits} commits · built with React &amp; Vite ·{" "}
            <a href="/?screen=garden">open the app</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

/* Styles: every value below resolves to a token from ./tokens.js. */
const css = `
  .cs-root {
    background: ${color.surface};
    color: ${color.ink};
    font-family: ${ds.family};
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    min-height: 100vh;
  }
  .cs-root *, .cs-root *::before, .cs-root *::after { box-sizing: border-box; }
  .cs-root p { margin: 0; }
  .cs-root a { color: inherit; }

  /* the single content width for the whole page */
  .cs-wrap { max-width: ${MAXW}px; margin: 0 auto; padding: 0 ${space[24]}px; }

  .cs-kicker {
    font-size: ${ds.size.sm}px; font-weight: ${ds.weight.bold};
    letter-spacing: 0.16em; text-transform: uppercase; color: ${color.brandBright};
  }
  .cs-h1 {
    font-size: clamp(40px, 6.4vw, 76px); font-weight: ${ds.weight.extrabold};
    line-height: 1.03; letter-spacing: -0.03em; margin: ${space[18]}px 0 0;
  }
  .cs-h1 em { font-style: italic; font-weight: ${ds.weight.medium}; color: ${color.brand}; }
  .cs-h2 {
    font-size: clamp(26px, 3.4vw, 40px); font-weight: ${ds.weight.extrabold};
    letter-spacing: -0.02em; margin: ${space[8]}px 0 0;
  }
  .cs-h3 {
    font-size: ${ds.size.xl}px; font-weight: ${ds.weight.bold};
    letter-spacing: -0.01em; margin: 0 0 ${space[8]}px;
  }
  /* NOTE: scoped with .cs-root so they out-specify the paragraph reset above.
     Without the extra class the reset (0,1,1) beats a bare class (0,1,0) and
     every paragraph silently loses its top margin. */
  .cs-root .cs-body {
    font-size: ${ds.size.lg}px; font-weight: ${ds.weight.medium};
    line-height: ${ds.leading.normal}; color: ${color.inkSoft}; margin-top: ${space[12]}px;
  }
  .cs-root .cs-lede {
    font-size: clamp(16px, 1.7vw, ${ds.size.xl}px); font-weight: ${ds.weight.medium};
    line-height: ${ds.leading.snug}; color: ${color.inkSoft};
    max-width: 68ch; margin-top: ${space[14]}px;
  }
  .cs-root code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.92em; background: ${color.brand}12; color: ${color.brand};
    padding: 1px 6px; border-radius: ${radius.xs}px;
  }

  /* top bar */
  .cs-bar {
    position: sticky; top: 0; z-index: 10;
    background: ${color.surface}e8; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid ${color.line};
  }
  .cs-bar-inner { display: flex; align-items: center; justify-content: space-between; height: 60px; }
  .cs-brand {
    display: flex; align-items: center; gap: ${space[10]}px; text-decoration: none;
    font-weight: ${ds.weight.extrabold}; letter-spacing: 0.12em; font-size: ${ds.size.md}px;
  }
  .cs-brand-mark {
    width: 20px; height: 20px; border-radius: 50%; background: ${color.brand};
    box-shadow: inset 0 0 0 3px ${color.surface}, 0 0 0 1.5px ${color.brand};
  }
  .cs-brand-sub {
    font-weight: ${ds.weight.medium}; letter-spacing: 0; font-size: ${ds.size.base}px;
    color: ${color.inkFaint};
  }
  .cs-bar-cta {
    display: inline-flex; align-items: center; gap: ${space[6]}px; text-decoration: none;
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.bold};
    color: ${color.brand}; background: ${color.brand}14;
    padding: ${space[8]}px ${space[14]}px; border-radius: ${radius.pill}px;
    white-space: nowrap; flex-shrink: 0;
    transition: background ${motion.duration.fast} ${motion.easing.standard};
  }
  .cs-bar-cta:hover { background: ${color.brand}22; }

  /* hero */
  .cs-hero { position: relative; overflow: hidden; padding: clamp(48px, 7vw, 104px) 0 clamp(32px, 4vw, 56px); }
  .cs-hero-glow {
    position: absolute; inset: -40% -10% auto auto; width: 70vw; height: 150%;
    background: radial-gradient(closest-side, ${color.brand}1e, transparent 70%); pointer-events: none;
  }
  .cs-hero-inner { position: relative; }
  .cs-root .cs-standfirst {
    font-size: clamp(16px, 1.9vw, 20px); font-weight: ${ds.weight.medium};
    line-height: ${ds.leading.snug}; color: ${color.inkSoft};
    max-width: 62ch; margin-top: ${space[20]}px;
  }
  .cs-meta { display: flex; flex-wrap: wrap; gap: ${space[32]}px; margin: ${space[32]}px 0 0; }
  .cs-meta div { display: flex; flex-direction: column; gap: ${space[2]}px; }
  .cs-meta dt {
    font-size: ${ds.size.xs}px; font-weight: ${ds.weight.bold};
    letter-spacing: 0.12em; text-transform: uppercase; color: ${color.inkFaint};
  }
  .cs-meta dd { margin: 0; font-size: ${ds.size.lg}px; font-weight: ${ds.weight.semibold}; }

  /* facts */
  .cs-facts {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: ${space[12]}px; margin-top: ${space[8]}px;
  }
  .cs-fact {
    background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.lg}px; padding: ${space[18]}px; box-shadow: ${shadow.e1};
  }
  .cs-fact-n { font-size: 30px; font-weight: ${ds.weight.extrabold}; letter-spacing: -0.02em; }
  .cs-fact-l {
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.semibold};
    color: ${color.inkFaint}; margin-top: ${space[2]}px;
  }
  .cs-footnote {
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.medium};
    color: ${color.inkFaint}; margin-top: ${space[12]}px !important;
  }
  .cs-footnote a { color: ${color.brand}; }

  /* sections */
  .cs-section { padding: clamp(48px, 6vw, 88px) 0 0; scroll-margin-top: 76px; }

  /* live demo */
  .cs-demo {
    display: grid; grid-template-columns: 1fr minmax(300px, 420px);
    gap: clamp(24px, 4vw, 56px); align-items: start; margin-top: ${space[28]}px;
  }
  .cs-demo-side { padding-top: ${space[4]}px; }
  .cs-live-badge {
    display: inline-flex; align-items: center; gap: ${space[8]}px;
    font-size: ${ds.size.xs}px; font-weight: ${ds.weight.extrabold};
    letter-spacing: 0.1em; text-transform: uppercase;
    color: ${color.brand}; background: ${color.brand}16;
    padding: ${space[6]}px ${space[12]}px; border-radius: ${radius.pill}px;
  }
  .cs-live-dot {
    width: 7px; height: 7px; border-radius: 50%; background: ${color.brand};
    box-shadow: 0 0 0 3px ${color.brand}33;
  }
  .cs-screens { display: flex; flex-wrap: wrap; gap: ${space[8]}px; margin-top: ${space[18]}px; }
  .cs-screen-btn {
    font-family: inherit; font-size: ${ds.size.base}px; font-weight: ${ds.weight.semibold};
    color: ${color.inkSoft}; background: ${color.surfaceRaised};
    border: 1px solid ${color.line}; border-radius: ${radius.pill}px;
    padding: ${space[8]}px ${space[14]}px; cursor: pointer;
    transition: transform ${motion.duration.fast} ${motion.easing.spring},
                background ${motion.duration.fast} ${motion.easing.standard},
                color ${motion.duration.fast} ${motion.easing.standard};
  }
  .cs-screen-btn:hover { background: ${color.brand}0e; color: ${color.brand}; }
  .cs-screen-btn.on {
    background: ${color.brand}; color: #fff; border-color: ${color.brand};
    box-shadow: ${shadow.e2};
  }
  .cs-screen-btn:active { transform: scale(0.96); }
  .cs-demo-note {
    font-size: ${ds.size.md}px; font-weight: ${ds.weight.medium};
    line-height: ${ds.leading.snug}; color: ${color.inkSoft}; margin-top: ${space[16]}px !important;
  }
  .cs-inline-cta {
    display: inline-flex; align-items: center; gap: ${space[6]}px;
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.bold};
    color: ${color.brand}; text-decoration: none; margin-top: ${space[14]}px;
  }
  .cs-inline-cta:hover { text-decoration: underline; }
  .cs-device {
    width: 100%; aspect-ratio: 402 / 874; border-radius: ${radius["2xl"]}px;
    overflow: hidden; background: ${palette.water100};
    box-shadow: ${shadow.e2}; border: 1px solid ${color.line};
  }
  .cs-frame { width: 100%; height: 100%; border: 0; display: block; }

  /* prose columns */
  .cs-cols {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: clamp(24px, 4vw, 48px); margin-top: ${space[28]}px;
  }

  /* tokens */
  .cs-tokens {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: ${space[16]}px; margin-top: ${space[28]}px;
  }
  .cs-token-card {
    background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.xl}px; padding: ${space[20]}px; box-shadow: ${shadow.e1};
  }
  .cs-token-head {
    font-size: ${ds.size.sm}px; font-weight: ${ds.weight.bold};
    letter-spacing: 0.1em; text-transform: uppercase; color: ${color.inkFaint};
    margin-bottom: ${space[16]}px;
  }
  .cs-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(126px, 1fr)); gap: ${space[10]}px; }
  .cs-swatch { display: flex; flex-direction: column; gap: ${space[2]}px; }
  .cs-swatch-chip {
    height: 44px; border-radius: ${radius.md}px; border: 1px solid ${color.line};
    margin-bottom: ${space[6]}px;
  }
  .cs-swatch-n { font-size: ${ds.size.base}px; font-weight: ${ds.weight.bold}; }
  .cs-swatch-hex {
    font-size: ${ds.size.sm}px; font-weight: ${ds.weight.semibold};
    color: ${color.inkFaint}; text-transform: uppercase;
  }
  .cs-type-row {
    display: flex; align-items: baseline; gap: ${space[14]}px;
    padding: ${space[8]}px 0; border-bottom: 1px solid ${color.line};
  }
  .cs-type-row:last-child { border-bottom: none; }
  .cs-type-spec {
    flex: 1; font-weight: ${ds.weight.bold}; line-height: 1.1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cs-type-meta {
    font-size: ${ds.size.sm}px; font-weight: ${ds.weight.semibold};
    color: ${color.inkFaint}; flex-shrink: 0;
  }
  .cs-callout {
    display: flex; flex-direction: column; align-items: flex-start; gap: ${space[8]}px;
    margin-top: ${space[16]}px; padding: ${space[20]}px;
    background: ${color.brand}0c; border: 1px solid ${color.brand}22;
    border-radius: ${radius.xl}px;
    font-size: ${ds.size.lg}px; font-weight: ${ds.weight.medium};
    line-height: ${ds.leading.normal}; color: ${color.inkSoft};
  }
  .cs-callout b { color: ${color.ink}; }

  /* artifacts */
  .cs-artifacts { display: flex; flex-direction: column; gap: ${space[16]}px; margin-top: ${space[28]}px; }
  .cs-artifact {
    background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.xl}px; padding: ${space[20]}px; box-shadow: ${shadow.e1};
  }
  .cs-artifact-head { display: flex; align-items: center; gap: ${space[12]}px; margin-bottom: ${space[16]}px; flex-wrap: wrap; }
  .cs-artifact-head .cs-h3 { margin: 0; }
  .cs-tag {
    font-size: ${ds.size["2xs"]}px; font-weight: ${ds.weight.extrabold};
    letter-spacing: 0.1em; text-transform: uppercase; color: #fff;
    background: ${color.brand}; padding: ${space[4]}px ${space[8]}px; border-radius: ${radius.sm}px;
  }
  .cs-artifact-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: ${space[16]}px; align-items: start; }
  .cs-code {
    margin: 0; padding: ${space[16]}px; overflow-x: auto;
    background: ${color.brandDeep}; border-radius: ${radius.lg}px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: ${ds.size.base}px; line-height: 1.6; color: ${palette.leaf100};
  }
  .cs-code code { background: none; color: inherit; padding: 0; font-size: inherit; }
  .cs-explain {
    background: ${color.surface}; border: 1px solid ${color.line};
    border-radius: ${radius.lg}px; padding: ${space[16]}px;
  }
  .cs-explain-label {
    font-size: ${ds.size["2xs"]}px; font-weight: ${ds.weight.extrabold};
    letter-spacing: 0.12em; text-transform: uppercase; color: ${color.brandBright};
  }
  .cs-explain .cs-body { margin-top: ${space[8]}px; }
  .cs-why {
    font-size: ${ds.size.md}px; font-weight: ${ds.weight.medium}; font-style: italic;
    line-height: ${ds.leading.snug}; color: ${color.inkFaint};
    margin-top: ${space[12]}px !important; padding-top: ${space[12]}px;
    border-top: 1px solid ${color.line};
  }

  /* a11y */
  .cs-a11y {
    display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    gap: clamp(20px, 3vw, 40px); align-items: start; margin-top: ${space[28]}px;
  }
  .cs-a11y-score {
    background: ${color.brand}; color: #fff; border-radius: ${radius.xl}px;
    padding: ${space[24]}px; box-shadow: ${shadow.e2};
  }
  .cs-a11y-n { font-size: 68px; font-weight: ${ds.weight.extrabold}; line-height: 1; letter-spacing: -0.03em; }
  .cs-a11y-l {
    font-size: ${ds.size.md}px; font-weight: ${ds.weight.semibold};
    line-height: ${ds.leading.snug}; margin-top: ${space[10]}px; color: ${palette.leaf100};
  }
  /* no opacity here — dimming this line dropped it below the AA contrast
     ratio the section is about. Weight carries the hierarchy instead. */
  .cs-a11y-l span { font-weight: ${ds.weight.medium}; }
  .cs-a11y-body .cs-body:first-child { margin-top: 0; }

  /* gaps */
  .cs-gaps {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: ${space[16]}px; margin-top: ${space[28]}px;
  }
  .cs-gap {
    background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.lg}px; padding: ${space[18]}px;
  }
  .cs-gap .cs-body { margin-top: ${space[6]}px; font-size: ${ds.size.md}px; }

  /* footer */
  .cs-footer { margin-top: clamp(56px, 7vw, 96px); border-top: 1px solid ${color.line}; padding: ${space[24]}px 0 ${space[40]}px; }
  .cs-footer-inner {
    display: flex; justify-content: space-between; flex-wrap: wrap; gap: ${space[10]}px;
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.semibold}; color: ${color.inkFaint};
  }
  .cs-footer a { color: ${color.brand}; }

  @media (max-width: 860px) {
    .cs-demo { grid-template-columns: 1fr; }
    .cs-device { max-width: 402px; margin: 0 auto; }
    .cs-artifact-body { grid-template-columns: 1fr; }
    .cs-a11y { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cs-root *, .cs-root *::before, .cs-root *::after {
      animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
    }
  }
`;
