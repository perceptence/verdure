import { describe, it, expect } from "vitest";
import { SCREEN_ROUTES } from "./VerdureApp.jsx";
import { SCREENS } from "./CaseStudy.jsx";

/* The case study drives the embedded app purely through these route keys. If a
   journey key and a route key drift apart the embed silently falls back to the
   splash screen — which is exactly the "don't ship a stuck embed" failure. */
describe("deep-link routes", () => {
  it("every journey in the case study resolves to a real route", () => {
    const missing = SCREENS.map(([key]) => key).filter((key) => !SCREEN_ROUTES[key]);
    expect(missing).toEqual([]);
  });

  it("every route lands on a phase the app understands", () => {
    const phases = ["app", "splash", "onboarding"];
    for (const [name, route] of Object.entries(SCREEN_ROUTES)) {
      expect(phases, `${name} has an unknown phase`).toContain(route.phase);
    }
  });

  it("every route lands on a real tab", () => {
    const tabs = ["home", "rooms", "reminders", "profile"];
    for (const [name, route] of Object.entries(SCREEN_ROUTES)) {
      expect(tabs, `${name} has an unknown tab`).toContain(route.tab);
    }
  });

  it("overlay routes carry a type the stack can render", () => {
    const types = ["allplants", "detail", "add"];
    for (const [name, route] of Object.entries(SCREEN_ROUTES)) {
      if (route.overlay) expect(types, `${name} overlay`).toContain(route.overlay.type);
    }
  });

  it("the detail route points at a seeded plant, not an index", () => {
    expect(SCREEN_ROUTES.detail.overlay.id).toBeTruthy();
  });

  it("time-of-day switches on the animated day cycle", () => {
    expect(SCREEN_ROUTES["time-of-day"].auto).toBe(true);
    expect(SCREEN_ROUTES["time-of-day"].tab).toBe("home");
  });

  it("design-system opens the full-screen styleguide", () => {
    expect(SCREEN_ROUTES["design-system"].dsFull).toBe(true);
  });
});
