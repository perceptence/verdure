# Verdure

**A home and plant-care companion where state is said in colour, without ever
shouting.**

A plant is thirsty, a room is fine, a reminder is overdue — three different
urgencies that most apps render as the same red badge. Verdure's colour system
is deliberately over-specified so that each one can be said at its own volume.

```bash
npm install
npm run dev       # vite dev server
npm test          # 50 tests across 3 files
npm run build
```

Four surfaces: **Home**, **Rooms**, **Reminders**, **Profile**.

---

## The colour system is the point

[`src/tokens.js`](src/tokens.js) is the single source of truth for colour,
type, space, radius, elevation and motion, and it is two layers on purpose:

```
palette.*   20 raw primitives — moss, leaf, ink, paper, amber,
            clay, water, bark, black … never used directly in UI
color.*     semantic tokens — color.surface, color.ink, …
            the only names components are allowed to reach for
```

The indirection is what lets a state change meaning without changing hue, and
a hue change without hunting through components. `src/tokens.test.js` holds that
line — the primitives are tested as a layer, not as decoration.

## What this is

A prototype, and the repo is honest about it: `src/VerdureApp.jsx` is one large
component file rather than a decomposed feature tree. The design system was the
object of the exercise; the app around it is the surface that proves the tokens
survive contact with real screens.

```
src/
  tokens.js        the two-layer design system
  VerdureApp.jsx   the four surfaces
  PhoneFrame.jsx   device frame for presentation
  CaseStudy.jsx    how it was designed
  *.test.*         tokens, routes, case study
```

## Stack

React 18 · Vite 5 · Vitest
