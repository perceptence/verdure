import React, { useState, useRef, useEffect } from "react";
import { color, type as ds, space, radius, shadow, motion, palette } from "./tokens.js";
import VerdureApp from "./VerdureApp.jsx";

/* ==========================================================================
   VERDURE — DESIGN CASE STUDY
   A route in the same app (/case-study), built from the same design tokens the
   product uses (./tokens.js). The product is mounted inline — the real
   component, same React tree, driven by its own deep-link routes.
========================================================================== */

/* One content width for the entire page — the width the product's own
   design-system screen already uses, so the two pages line up. */
const MAXW = 1080;

/* --------------------------------------------------------------------------
   FACTS — measured from this repository, not estimated.
     commits     git rev-list --count HEAD
     components  grep -cE "^function [A-Z]" src/VerdureApp.jsx
     tokens      Object.keys(...) on ./tokens.js
     a11y        axe-core 4.10.2 vs WCAG 2.1 AA on each core screen
-------------------------------------------------------------------------- */
const FACTS = {
  commits: 19, tags: 0, components: 22, appLines: 4627,
  paletteColors: 64, semanticColors: 28, typeSizes: 12, spaceSteps: 17,
  radii: 8, elevations: 6, easings: 3,
  seededPlants: 7, seededRooms: 4,
  axeVersion: "4.10.2", axeViolations: 0, axeScreens: 4,
  automatedTests: 0, measured: "5 Aug 2026",
};

/* Journeys — one line each. The detail lives in the phone, not the copy. */
const SCREENS = [
  ["garden", "Garden", "The living home scene, lit by the real hour."],
  ["time-of-day", "Time-of-day engine", "The light model, played fast — dawn to night."],
  ["rooms", "Rooms", "Plants grouped by the light they actually get."],
  ["activity", "Activity", "A diary, not a backlog. Related events collapse."],
  ["detail", "Plant detail", "Care plan, health trend, and a photo journal."],
  ["plants", "All plants", "The garden as a deck, worst-first."],
  ["add", "Add plant", "Two-shot scan: the plant, then the room's light."],
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
  const journeysRef = useRef(null);
  const [deviceH, setDeviceH] = useState(null);

  /* Match the phone's height to the journey list beside it. */
  useEffect(() => {
    const el = journeysRef.current;
    if (!el) return;
    const sync = () => setDeviceH(el.getBoundingClientRect().height);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="cs-root">
      <style>{css}</style>

      <header className="cs-bar">
        <div className="cs-wrap cs-bar-inner">
          <a className="cs-brand" href="/">
            <span className="cs-brand-mark" />Verdure
            <span className="cs-brand-sub">Design case study</span>
          </a>
          <a className="cs-bar-cta" href="/?screen=garden">
            Open the app
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M7 17 17 7M9 7h8v8" /></svg>
          </a>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <div className="cs-hero">
        <div className="cs-hero-sun" aria-hidden="true" />
        <div className="cs-wrap cs-hero-inner">
          <div className="cs-kicker cs-kicker-dark">Product design · Design systems · Front-end</div>
          <h1 className="cs-h1">A plant app that<br /><em>knows what time it is.</em></h1>
          <p className="cs-standfirst">
            The home screen isn't a checklist with leaves on it — it's a living scene, lit by a model
            that tracks the real hour of the day.
          </p>
          <dl className="cs-meta">
            <div><dt>Role</dt><dd>Design &amp; build</dd></div>
            <div><dt>Surface</dt><dd>iOS · one screen size</dd></div>
            <div><dt>Stack</dt><dd>React 18 · Vite</dd></div>
            <div><dt>Deploy</dt><dd>Vercel · one build, two routes</dd></div>
          </dl>
        </div>
      </div>

      {/* ---------- facts ---------- */}
      <div className="cs-wrap">
        <div className="cs-facts">
          {[[FACTS.components, "components"], [`${FACTS.paletteColors}/${FACTS.semanticColors}`, "colours"],
            [FACTS.typeSizes, "type steps"], [FACTS.spaceSteps, "spacing steps"],
            [FACTS.commits, "commits"], [FACTS.axeViolations, "a11y violations"]].map(([n, l]) => (
            <div key={l} className="cs-fact"><div className="cs-fact-n">{n}</div><div className="cs-fact-l">{l}</div></div>
          ))}
        </div>
        <p className="cs-footnote">
          Measured from this repository on {FACTS.measured}. No automated test suite — see <a href="#limits">limits</a>.
        </p>
      </div>

      {/* ---------- live product ---------- */}
      <Section id="live" kicker="The product" title="It's running right here"
        lede="Not a screenshot — the real component, mounted in this page. Pick a journey; the phone reloads into it.">
        <div className="cs-demo">
          <div className="cs-demo-side">
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
            <div className="cs-live-badge"><span className="cs-live-dot" />Live · running build</div>
            {/* real component inline; `key` remounts it per journey */}
            <div className="cs-device" style={deviceH ? { height: deviceH } : undefined}>
              <VerdureApp key={screen} embedded screen={screen} />
            </div>
            <a className="cs-inline-cta" href={`/?screen=${screen}`} target="_blank" rel="noreferrer">
              Open full size
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M7 17 17 7M9 7h8v8" /></svg>
            </a>
          </div>
        </div>
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
                <div className="cs-ab cs-ab-stack">
                  <div className="cs-ab-col">
                    <span className="cs-ab-lbl cs-ab-good">390pt — the canvas it was tuned on</span>
                    <div className="cs-scalebar" style={{ width: 195 }}><span>390</span></div>
                  </div>
                  <div className="cs-ab-col">
                    <span className="cs-ab-lbl cs-ab-bad">402pt — every element gains 3%</span>
                    <div className="cs-scalebar" style={{ width: 201 }}>
                      <span>390</span>
                      <i className="cs-scalebar-extra" style={{ width: 6 }}>+12</i>
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

      {/* ---------- limits ---------- */}
      <Section id="limits" kicker="Scope" title="Limits, and what's next"
        lede="What this prototype deliberately doesn't do — and what I'd build first if it continued.">
        <div className="cs-gaps">
          {[["No automated tests", `${FACTS.automatedTests} test files. Everything here was verified by hand or measured. First thing I'd add.`],
            ["One screen size", "No tablet, landscape or responsive behaviour inside the product. Needs a size-class strategy."],
            ["No backend", "State lives in the session. Real interactions, fake persistence."],
            ["Simulated identification", "The scan runs a scripted three-stage sequence. Faithful mock, not a vision model."]].map(([t, d]) => (
            <div key={t} className="cs-gap"><h3 className="cs-h3">{t}</h3><p className="cs-body cs-tight">{d}</p></div>
          ))}
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

  .cs-bar { position: sticky; top: 0; z-index: 10; background: ${color.surface}e8;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid ${color.line}; }
  .cs-bar-inner { display: flex; align-items: center; justify-content: space-between; height: 60px; }
  .cs-brand { display: flex; align-items: center; gap: ${space[10]}px; text-decoration: none;
    font-weight: ${ds.weight.extrabold}; letter-spacing: 0.12em; font-size: ${ds.size.md}px; }
  .cs-brand-mark { width: 20px; height: 20px; border-radius: 50%; background: ${color.brand};
    box-shadow: inset 0 0 0 3px ${color.surface}, 0 0 0 1.5px ${color.brand}; }
  .cs-brand-sub { font-weight: ${ds.weight.medium}; letter-spacing: 0; font-size: ${ds.size.base}px; color: ${color.inkFaint}; }
  .cs-bar-cta { display: inline-flex; align-items: center; gap: ${space[6]}px; text-decoration: none;
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.bold}; color: ${color.brand};
    background: ${color.brand}14; padding: ${space[8]}px ${space[14]}px; border-radius: ${radius.pill}px;
    white-space: nowrap; flex-shrink: 0; transition: background ${motion.duration.fast} ${motion.easing.standard}; }
  .cs-bar-cta:hover { background: ${color.brand}22; }

  /* hero — dark, echoing the app's night sky */
  .cs-hero { position: relative; overflow: hidden; color: ${palette.onDark};
    padding: clamp(64px, 10vw, 148px) 0 clamp(52px, 7vw, 104px);
    background: radial-gradient(120% 95% at 72% 8%, ${palette.moss750} 0%, ${color.brandDeep} 42%, ${palette.black780} 100%); }
  .cs-hero-sun { position: absolute; top: -8%; right: 8%; width: min(420px, 42vw); aspect-ratio: 1;
    border-radius: 50%; pointer-events: none;
    background: radial-gradient(closest-side, ${palette.amber100}66, ${palette.amber400}22 55%, transparent 72%); }
  .cs-hero-inner { position: relative; }
  .cs-root .cs-standfirst { font-size: clamp(17px, 2vw, 23px); font-weight: ${ds.weight.medium};
    line-height: ${ds.leading.snug}; color: ${palette.leaf100}; max-width: 54ch; margin-top: ${space[24]}px; }
  .cs-meta { display: flex; flex-wrap: wrap; gap: ${space[32]}px; margin: ${space[40]}px 0 0; }
  .cs-meta div { display: flex; flex-direction: column; gap: ${space[2]}px; }
  .cs-meta dt { font-size: ${ds.size.xs}px; font-weight: ${ds.weight.bold}; letter-spacing: 0.12em;
    text-transform: uppercase; color: ${palette.leaf300}; }
  .cs-meta dd { margin: 0; font-size: ${ds.size.lg}px; font-weight: ${ds.weight.semibold}; color: ${palette.onDark}; }

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
  .cs-demo { display: grid; grid-template-columns: minmax(0, 1fr) 320px;
    gap: clamp(24px, 4vw, 48px); align-items: start; margin-top: ${space[28]}px; }
  .cs-demo-side { min-width: 0; }
  .cs-journeys { display: flex; flex-direction: column; gap: ${space[10]}px; }
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
  .cs-device-col { position: sticky; top: 76px; display: flex; flex-direction: column;
    align-items: center; gap: ${space[10]}px; }
  .cs-device { width: 100%; }
  .cs-live-badge { display: inline-flex; align-items: center; gap: ${space[8]}px;
    font-size: ${ds.size.xs}px; font-weight: ${ds.weight.extrabold}; letter-spacing: 0.1em;
    text-transform: uppercase; color: ${color.brand}; background: ${color.brand}16;
    padding: ${space[6]}px ${space[12]}px; border-radius: ${radius.pill}px; }
  .cs-live-dot { width: 7px; height: 7px; border-radius: 50%; background: ${color.brand}; box-shadow: 0 0 0 3px ${color.brand}33; }
  .cs-inline-cta { display: inline-flex; align-items: center; gap: ${space[6]}px;
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.bold}; color: ${color.brand}; text-decoration: none; }
  .cs-inline-cta:hover { text-decoration: underline; }

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
  .cs-explain { min-width: 0; }
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

  .cs-gaps { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: ${space[16]}px; margin-top: ${space[28]}px; }
  .cs-gap { background: ${color.surfaceRaised}; border: 1px solid ${color.line};
    border-radius: ${radius.lg}px; padding: ${space[18]}px; }

  .cs-footer { margin-top: clamp(56px, 7vw, 96px); border-top: 1px solid ${color.line};
    padding: ${space[24]}px 0 ${space[40]}px; }
  .cs-footer-inner { display: flex; justify-content: space-between; flex-wrap: wrap; gap: ${space[10]}px;
    font-size: ${ds.size.base}px; font-weight: ${ds.weight.semibold}; color: ${color.inkFaint}; }
  .cs-footer a { color: ${color.brand}; }

  @media (max-width: 900px) {
    .cs-span2 { grid-column: span 1; }
    .cs-prob-body { grid-template-columns: 1fr; }
  }
  @media (max-width: 860px) {
    .cs-demo { grid-template-columns: 1fr; }
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
