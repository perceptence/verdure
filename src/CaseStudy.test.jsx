import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import CaseStudy, { FACTS, SCREENS, NAV } from "./CaseStudy.jsx";
import { SCREEN_ROUTES } from "./VerdureApp.jsx";
import { color, type as ds, space, radius, shadow, motion, palette } from "./tokens.js";

describe("case study page", () => {
  it("renders exactly one h1 of its own", () => {
    const { container } = render(<CaseStudy />);
    const device = container.querySelector(".cs-device");
    const pageOwn = [...container.querySelectorAll("h1")].filter((h) => !device.contains(h));
    expect(pageOwn).toHaveLength(1);
  });

  /* Documented tradeoff of mounting inline instead of in an iframe: the app
     brings its own screen heading into the host document. An iframe would have
     scoped it. Pinned here so the behaviour is visible rather than surprising. */
  it("the embedded app contributes its own screen heading", () => {
    const { container } = render(<CaseStudy />);
    const device = container.querySelector(".cs-device");
    expect(device.querySelectorAll("h1")).toHaveLength(1);
  });

  it("offers every journey as a real button", () => {
    render(<CaseStudy />);
    const group = screen.getByRole("group", { name: /choose a journey/i });
    for (const [, label] of SCREENS) {
      // anchored: a journey's accessible name includes its description, and
      // "All plants — The garden as a deck" would otherwise match /Garden/i too
      expect(within(group).getByRole("button", { name: new RegExp(`^${label}`, "i") })).toBeTruthy();
    }
  });

  it("marks exactly one journey as current", () => {
    render(<CaseStudy />);
    const group = screen.getByRole("group", { name: /choose a journey/i });
    const pressed = within(group)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
  });

  it("mounts the product inline rather than in an iframe", () => {
    const { container } = render(<CaseStudy />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector(".v-phone")).toBeTruthy();
  });

  it("does not land the embed on the splash screen", () => {
    const { container } = render(<CaseStudy />);
    expect(container.querySelector(".sp-root")).toBeNull();
  });

  /* The header nav promises a route through the page. A stop that points at a
     section which no longer exists is a broken promise, so pin it. */
  it("every nav stop points at a section that exists", () => {
    const { container } = render(<CaseStudy />);
    const missing = NAV
      .map(([id]) => id)
      .filter((id) => !container.querySelector(`#${id}`));
    expect(missing).toEqual([]);
  });

  it("keeps the nav curated rather than a table of contents", () => {
    const sections = render(<CaseStudy />).container.querySelectorAll("section[id]").length;
    expect(NAV.length).toBeLessThan(sections);
    expect(NAV.length).toBeLessThanOrEqual(5);
  });

  /* Honesty constraint: the page must not claim a team. */
  it("describes the team as solo with AI assistance", () => {
    render(<CaseStudy />);
    expect(screen.getAllByText(/solo, with ai assistance/i).length).toBeGreaterThan(0);
  });

  /* A dt is a claim about its dd. "Scope: solo, with AI assistance" read as a
     scope of work and said nothing true about it, so pin each pairing. */
  it("pairs every hero term with the value it names", () => {
    const { container } = render(<CaseStudy />);
    const pairs = [...container.querySelectorAll(".cs-meta div")].map((d) => [
      d.querySelector("dt").textContent,
      d.querySelector("dd").textContent,
    ]);
    expect(Object.fromEntries(pairs)).toEqual({
      Team: "Solo, with AI assistance",
      Scope: "Problem framing → design system → shipped build",
      Stage: "Working prototype, running end to end",
      Surface: "iOS, responsive to the viewport",
    });
  });

  /* The hero no longer leads with the prototype's limits, so the page has to
     keep stating them somewhere unhedged. If this line goes, the honesty goes
     with it and nothing else would catch that. */
  it("still says plainly that there are no users yet", () => {
    render(<CaseStudy />);
    expect(screen.getByText(/working prototype with no users yet/i)).toBeTruthy();
  });

  /* The roadmap's buckets and the key that explains them must not drift apart. */
  it("explains every bucket the roadmap actually uses", () => {
    const { container } = render(<CaseStudy />);
    const explained = [...container.querySelectorAll(".cs-rules dt")].map((d) => d.textContent);
    const used = [...container.querySelectorAll(".cs-next-item .cs-next-tag")].map((t) => t.textContent);
    expect(new Set(explained)).toEqual(new Set(used));
  });
});

/* Requirement: every number printed on the page is real. These assert the
   printed counts against the modules they describe, so a token added or removed
   without updating the page fails the build instead of quietly going stale. */
describe("printed figures match the codebase", () => {
  const cases = [
    // product-scope figures shown in the "At a glance" row
    ["journeys", FACTS.journeys, SCREENS.length],
    ["linkableScreens", FACTS.linkableScreens, Object.keys(SCREEN_ROUTES).length],
    // system internals used as section subtitles
    ["paletteColors", FACTS.paletteColors, Object.keys(palette).length],
    ["semanticColors", FACTS.semanticColors, Object.keys(color).length],
    ["typeSizes", FACTS.typeSizes, Object.keys(ds.size).length],
    ["spaceSteps", FACTS.spaceSteps, Object.keys(space).length],
    ["radii", FACTS.radii, Object.keys(radius).length],
    ["elevations", FACTS.elevations, Object.keys(shadow).length],
    ["easings", FACTS.easings, Object.keys(motion.easing).length],
  ];

  for (const [name, printed, actual] of cases) {
    it(`${name}: page says ${printed}`, () => expect(printed).toBe(actual));
  }

  /* Self-enforcing: the page prints a test-file count, and this counts the
     files on disk. Add or delete a test file without updating the page and
     this fails — the number can't quietly go stale. */
  it("testFiles matches the files actually on disk", () => {
    const found = import.meta.glob("./**/*.test.{js,jsx}");
    // glob excludes the importing module, so add this file back in
    expect(FACTS.testFiles).toBe(Object.keys(found).length + 1);
  });
});
