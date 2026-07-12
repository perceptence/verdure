import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { T, color, type as ds, space, radius, shadow, motion, palette, google, tokens } from "./tokens.js";

/* Drag-to-close for bottom sheets. Returns props to spread on the sheet element.
   Dragging down translates the sheet live; releasing past a threshold calls onClose. */
function useSheetDrag(onClose) {
  const ref = useRef(null);
  const start = useRef(null);
  const dragging = useRef(false);

  function setY(y, animate) {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate ? "transform .28s cubic-bezier(.2,.8,.3,1)" : "none";
    el.style.transform = y ? `translateY(${y}px)` : "translateY(0)";
  }
  function onStart(clientY, target) {
    // don't hijack drags that start on a scrolled-down inner scroller
    const scroller = target.closest && target.closest(".dz-sheet-scroll, .pf2-sheet-scroll, .rx-move-list");
    if (scroller && scroller.scrollTop > 4) return;
    start.current = clientY; dragging.current = true;
  }
  function onMove(clientY) {
    if (!dragging.current || start.current == null) return;
    const dy = clientY - start.current;
    if (dy > 0) setY(dy, false);
  }
  function onEnd(clientY) {
    if (!dragging.current || start.current == null) return;
    const dy = clientY - start.current;
    dragging.current = false; start.current = null;
    if (dy > 90) { setY(600, true); setTimeout(onClose, 200); }
    else setY(0, true);
  }
  return {
    ref,
    onTouchStart: (e) => onStart(e.touches[0].clientY, e.target),
    onTouchMove: (e) => onMove(e.touches[0].clientY),
    onTouchEnd: (e) => onEnd(e.changedTouches[0].clientY),
    onMouseDown: (e) => {
      onStart(e.clientY, e.target);
      const mm = (ev) => onMove(ev.clientY);
      const mu = (ev) => { onEnd(ev.clientY); window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
      window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
    },
  };
}

/* ==========================================================================
   VERDURE — end-to-end plant companion.
   Home: the Daybreak ambient scene (real-time light model) IS the home screen.
   Flows: tap a plant -> rich detail (care plan, AI diagnosis, photo journal);
   add-plant (scan -> identify -> assign to room) really mutates state;
   rooms view; reminders. Real Commons photos with guaranteed SVG fallback.
========================================================================== */

const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');";

/* ----------------------------- light model ----------------------------- */
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) { return c1.map((c, i) => Math.round(lerp(c, c2[i], t))); }
function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }

const KEYS = [
  { h: 0,  top: [18, 22, 40],   bot: [40, 44, 72],   sun: [120, 130, 180], warmth: 0.05, label: "Night" },
  { h: 6,  top: [60, 70, 110],  bot: [228, 168, 140], sun: [255, 180, 120], warmth: 0.45, label: "Dawn" },
  { h: 9,  top: [120, 175, 220], bot: [232, 224, 198], sun: [255, 224, 150], warmth: 0.7,  label: "Morning" },
  { h: 13, top: [150, 200, 235], bot: [236, 238, 224], sun: [255, 240, 200], warmth: 1.0,  label: "Midday" },
  { h: 17, top: [126, 170, 206], bot: [240, 220, 190], sun: [255, 214, 150], warmth: 0.75, label: "Afternoon" },
  { h: 19, top: [80, 88, 130],  bot: [236, 150, 110], sun: [255, 150, 95],  warmth: 0.45, label: "Dusk" },
  { h: 21, top: [40, 44, 78],   bot: [88, 70, 100],   sun: [180, 150, 200], warmth: 0.15, label: "Evening" },
  { h: 24, top: [18, 22, 40],   bot: [40, 44, 72],   sun: [120, 130, 180], warmth: 0.05, label: "Night" },
];
function lightAt(hour) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const t = (hour - a.h) / (b.h - a.h || 1);
  return { top: lerpColor(a.top, b.top, t), bot: lerpColor(a.bot, b.bot, t), sun: lerpColor(a.sun, b.sun, t), warmth: lerp(a.warmth, b.warmth, t), label: t < 0.5 ? a.label : b.label };
}
function celestialPos(hour) {
  const isDay = hour >= 6 && hour <= 18;
  // ONE full circle, clockwise, continuous. 6am at the left horizon; the sun sweeps
  // up over the top (noon = highest), down to the right horizon at 6pm, where it
  // transitions into the moon; the moon continues the SAME direction along the
  // BOTTOM of the circle (midnight = lowest), up the left horizon back to 6am.
  const t = ((hour - 6 + 24) % 24) / 24;   // 0→1 across 24h
  const angle = Math.PI - Math.PI * 2 * t; // start left (π), sweep clockwise
  const cx = 50 + Math.cos(angle) * 46;    // left → top → right → bottom → left
  const cy = 50 - Math.sin(angle) * 38;    // full vertical arc (above and below center)
  return { cx, cy, isDay };
}

/* Realistic two-arc celestial model — used ONLY on the Garden page. Sun runs the
   day (6am→6pm), moon runs the night (6pm→6am); BOTH rise on the left (east) and
   set on the right (west), each arcing over the top. Each body is below the horizon
   (alt < 0 → faded out) while off-duty, so its off-screen reset is never visible. */
function celestialRealistic(hour) {
  const dayT = (hour - 6) / 12;                    // 0 at 6am, 1 at 6pm
  const sunAlt = Math.sin(dayT * Math.PI);         // +1 at noon, 0 at horizons, <0 at night
  const sun = { cx: 4 + dayT * 92, cy: 50 - sunAlt * 38, alt: sunAlt };
  const nightT = ((hour - 18 + 24) % 24) / 12;     // 0 at 6pm, 1 at 6am
  const moonAlt = Math.sin(nightT * Math.PI);      // +1 at midnight, 0 at horizons
  const moon = { cx: 4 + nightT * 92, cy: 50 - moonAlt * 31, alt: moonAlt }; // peak 31 < sun 38 → slightly lower
  return { sun, moon, isDay: hour >= 6 && hour <= 18 };
}

/* ----------------------------- tokens ----------------------------- */
/* Design tokens now live in ./tokens.js — `T` is the backward-compatible flat
   alias; `color`, `ds` (type), `space`, `radius`, `shadow`, `motion` are the
   structured tokens used going forward. */
const ADD_STAGES = ["Matching the species", "Reading its condition", "Measuring the room light"];
function healthColor(h) { return h >= 70 ? T.moss : h >= 45 ? color.watch : T.clay; }
function healthColorLight(h) { return h >= 70 ? palette.white : h >= 45 ? color.watchSoft : color.needsCareSoft; }
function healthHue(h) { return h >= 70 ? [64, 108, 68] : h >= 45 ? [156, 132, 60] : [190, 92, 40]; }
function statusOf(h) { return h >= 70 ? "thriving" : h >= 45 ? "watch" : "urgent"; }
function statusLabel(s) { return s === "thriving" ? "Thriving" : s === "watch" ? "Needs watch" : "Needs care"; }

/* ----------------------------- plant catalog ----------------------------- */
/* commonsFile: a real Wikimedia Commons filename -> deterministic hotlink.
   SVG fallback always renders underneath, so a 404 never breaks the UI. */
const SPECIES = {
  monstera:  { common: "Monstera",     latin: "Monstera deliciosa",   commonsFile: "Monstera_deliciosa3.jpg",
    light: 78, water: "When top 2in of soil is dry, ~weekly", care: "Loves bright indirect light. Wipe leaves monthly. Give it a moss pole to climb." },
  fiddle:    { common: "Fiddle Leaf",  latin: "Ficus lyrata",          commonsFile: "Ficus_lyrata_1.jpg",
    light: 88, water: "When top inch is dry, ~weekly", care: "Hates being moved or overwatered. Wants steady bright light and consistent routine." },
  calathea:  { common: "Calathea",     latin: "Calathea orbifolia",    commonsFile: "Calathea_orbifolia_1.jpg",
    light: 58, water: "Keep evenly moist, never soggy", care: "Craves humidity. Use filtered water — sensitive to tap minerals. Leaves curl when thirsty." },
  snake:     { common: "Snake Plant",  latin: "Dracaena trifasciata",  commonsFile: "Snake_Plant_(Sansevieria_trifasciata)_1.jpg",
    light: 22, water: "Sparingly, every 2-3 weeks", care: "Nearly indestructible. Tolerates low light and neglect. Rot is the only real risk — underwater it." },
  pothos:    { common: "Pothos",       latin: "Epipremnum aureum",     commonsFile: "Epipremnum_aureum_31082012.jpg",
    light: 64, water: "When soil is dry a couple inches down", care: "Forgiving and fast-growing. Trim past a node to keep it full. Roots easily in water." },
  lily:      { common: "Peace Lily",   latin: "Spathiphyllum wallisii", commonsFile: "Spathiphyllum_cochlearispathum_RTBG.jpg",
    light: 40, water: "When leaves start to droop", care: "Tells you when it's thirsty by drooping, then perks back up. Likes shade and humidity." },
  zz:        { common: "ZZ Plant",     latin: "Zamioculcas zamiifolia", commonsFile: "Zamioculcas_zamiifolia_1.jpg",
    light: 30, water: "Every 2-3 weeks, let dry out", care: "Thrives on neglect and low light. Stores water in its rhizomes. Overwatering is the only danger." },
};
function commonsURL(file, w = 600) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}`;
}

/* AI diagnosis content keyed by status — concept stand-in for a vision model */
const DIAGNOSIS = {
  urgent: {
    title: "Root stress from overwatering",
    confidence: 88, severity: "High", trend: "declining",
    summary: "Frank's soil has stayed wet too long and the roots are starting to suffocate. Caught now, this is very recoverable — the next 10 days matter most.",
    findings: [
      { text: "Lower leaves yellowing and soft", weight: "Strong signal" },
      { text: "Soil still wet 6+ days after watering", weight: "Strong signal" },
      { text: "Slight darkening at the stem base", weight: "Early sign" },
    ],
    ifIgnored: "Left unchanged, root rot typically spreads to the crown within 2–3 weeks and becomes hard to reverse.",
    revive: [
      { step: "Stop watering completely", detail: "Let the soil dry fully — at least 7–10 days. Resist the urge to help with more water.", done: false },
      { step: "Check the roots", detail: "Gently unpot. Healthy roots are white and firm; trim any brown, mushy ones with clean scissors.", done: false },
      { step: "Repot in fresh, airy mix", detail: "Add perlite or orchid bark for drainage. Choose a snug pot, not an oversized one.", done: false },
      { step: "Move to brighter, indirect light", detail: "More light helps the soil dry and speeds recovery.", done: false },
    ],
    outlook: "Most plants caught at this stage recover within 3–4 weeks with dry-out and fresh soil.",
    nextCheck: "Check moisture in 3 days",
  },
  watch: {
    title: "Early humidity stress",
    confidence: 79, severity: "Moderate", trend: "stable",
    summary: "Leaf edges are crisping from dry air. It's cosmetic for now, but the trend is worth correcting before new growth is affected.",
    findings: [
      { text: "Leaf edges browning slightly", weight: "Strong signal" },
      { text: "Tips curling inward", weight: "Moderate signal" },
      { text: "Room humidity reading under 35%", weight: "Contributing factor" },
    ],
    ifIgnored: "Without more humidity, browning will keep advancing and new leaves may emerge already crisped.",
    revive: [
      { step: "Raise humidity nearby", detail: "Group with other plants or run a small humidifier close by.", done: false },
      { step: "Switch to filtered water", detail: "This species is sensitive to tap-water minerals that worsen tip burn.", done: false },
      { step: "Trim crispy edges", detail: "Cut just inside the brown line, following the leaf's natural shape.", done: false },
    ],
    outlook: "New growth should come in clean within 2–3 weeks once humidity stabilizes.",
    nextCheck: "Reassess in 1 week",
  },
  thriving: {
    title: "Healthy and thriving",
    confidence: 95, severity: "None", trend: "improving",
    summary: "Everything looks great. Firm leaves, good color, and visible new growth — whatever you're doing is working.",
    findings: [
      { text: "Firm, upright leaves", weight: "Positive" },
      { text: "Good color saturation", weight: "Positive" },
      { text: "New growth visible", weight: "Positive" },
    ],
    ifIgnored: "",
    revive: [],
    outlook: "Keep doing what you're doing. A light feed next month will support the active growth.",
    nextCheck: "Routine check in 2 weeks",
  },
};

/* environment targets per species — for the "Environment" insight cards */
function envFor(speciesKey) {
  const s = SPECIES[speciesKey];
  return {
    light: { label: s.light < 40 ? "Low–medium, indirect" : s.light < 70 ? "Bright, indirect" : "Bright, some direct", pct: s.light },
    water: { label: s.water, pct: s.light < 40 ? 30 : 55 },
    humidity: { label: ["calathea", "lily"].includes(speciesKey) ? "High (50–60%)" : "Average (40%)", pct: ["calathea", "lily"].includes(speciesKey) ? 58 : 42 },
    temp: { label: "18–24°C", pct: 65 },
  };
}

/* ----------------------------- initial state ----------------------------- */
/* Current local weather — in production this comes from the device location's
   weather feed. Modeled here as a plausible reading so the estimate is grounded. */
const WEATHER_NOW = { humidity: 58, tempC: 22, label: "Partly cloudy" };

const ROOMS = ["Living room", "Bedroom", "Office", "Kitchen"];
/* each room's LIGHT is user-observable; humidity is derived, not asserted */
const ROOM_ENV = {
  "Living room": { light: 68, note: "Big windows, bright and airy" },
  "Bedroom": { light: 40, note: "Softer light, calm and stable" },
  "Office": { light: 55, note: "Medium light, drier air" },
  "Kitchen": { light: 72, note: "Bright and humid" },
};
/* room-type offset from the home's ambient indoor humidity (kitchens/baths run wetter,
   offices drier from AC/heat). This is a prior, refined by weather + any user override. */
const ROOM_HUMIDITY_OFFSET = { "Living room": 0, "Bedroom": +3, "Office": -6, "Kitchen": +12 };

/* Derive indoor humidity from local weather. Indoor RH tracks outdoor RH but is damped
   by heating/cooling toward ~40%. In a shipping app `weather` comes from the location feed;
   here we model a plausible current reading so the estimate is grounded, not invented. */
function indoorBaseHumidity(weather) {
  const outdoor = weather?.humidity ?? 55;      // % RH outside
  const indoorTempPull = 40;                     // HVAC pulls indoor RH toward ~40%
  const damp = 0.55;                             // how strongly indoor follows outdoor
  return Math.round(indoorTempPull + (outdoor - indoorTempPull) * damp);
}
/* humidity for a room: manual override wins; else weather-derived base + room offset */
function roomHumidity(room, weather, overrides) {
  if (overrides && overrides[room] != null) return { pct: overrides[room], source: "manual" };
  const base = indoorBaseHumidity(weather);
  const pct = Math.max(20, Math.min(75, base + (ROOM_HUMIDITY_OFFSET[room] ?? 0)));
  return { pct, source: "estimated" };
}
function lightWord(v) { return v >= 65 ? "Bright" : v >= 45 ? "Medium" : "Low"; }
/* how well does a plant fit a given room? 0..100, higher = better */
function placementFit(speciesKey, room, weather = WEATHER_NOW, overrides) {
  const s = SPECIES[speciesKey];
  const e = ROOM_ENV[room] || { light: 55 };
  const hum = roomHumidity(room, weather, overrides).pct;
  const lightGap = Math.abs(e.light - s.light);
  const wantsHumid = ["calathea", "lily"].includes(speciesKey);
  const humGap = wantsHumid ? Math.max(0, 55 - hum) : 0;
  return Math.max(0, Math.round(100 - lightGap * 1.4 - humGap * 1.2));
}
/* best room for a plant, and whether it beats the current one meaningfully */
function bestRoomFor(speciesKey, currentRoom, weather = WEATHER_NOW, overrides) {
  let best = currentRoom, bestFit = placementFit(speciesKey, currentRoom, weather, overrides);
  ROOMS.forEach((r) => { const f = placementFit(speciesKey, r, weather, overrides); if (f > bestFit + 8) { best = r; bestFit = f; } });
  return { room: best, fit: bestFit, better: best !== currentRoom };
}

/* ============================================================================
   SINGLE SOURCE OF TRUTH — every screen reads a plant's placement + water state
   from these, so the Rooms page, care guide, verdict, and to-do list can never
   disagree. Tolerances live here and nowhere else.
   ========================================================================== */
const LIGHT_TOL = 15;   // room light within this many points of ideal reads "Good"
const HUM_TOL = 15;     // humidity within this many points reads "Good"
function roomFit(plant, weather = WEATHER_NOW, overrides) {
  const s = SPECIES[plant.speciesKey];
  const env = envFor(plant.speciesKey);
  const roomLight = (ROOM_ENV[plant.room] || { light: 55 }).light;
  const roomHum = roomHumidity(plant.room, weather, overrides).pct;
  const lightOk = Math.abs(roomLight - s.light) <= LIGHT_TOL;
  const humOk = Math.abs(env.humidity.pct - roomHum) <= HUM_TOL;
  const roomOk = lightOk && humOk;                                  // this room genuinely suits the plant
  const best = bestRoomFor(plant.speciesKey, plant.room, weather, overrides);
  const canMove = !roomOk && best.better;                          // only suggest a move when the room is off AND a better one exists
  return { roomLight, roomHum, lightOk, humOk, roomOk, best, canMove };
}
function waterInfo(plant) {
  const daysWater = parseInt(plant.lastWatered) || 0;
  const every = waterEveryFor(plant.speciesKey);
  const nextWaterIn = Math.max(0, every - daysWater);
  // urgent = recovering, soil still wet → hold off; due = needs water now; ok = on schedule
  const state = plant.status === "urgent" ? "hold" : (nextWaterIn === 0 ? "due" : "ok");
  return { every, nextWaterIn, state };
}

/* Verdure's reasoning: turn the garden's state into prioritized, explained tasks.
   Shared by the Garden todo and the Activity feed so they never drift apart. */
function waterEveryFor(speciesKey) { const l = SPECIES[speciesKey].light; return l < 40 ? 16 : l < 70 ? 9 : 7; }
function buildTasks(plants) {
  const out = [];
  plants.forEach((p) => {
    const daysWater = parseInt(p.lastWatered) || 0;
    const every = waterEveryFor(p.speciesKey);
    const dueIn = Math.max(0, every - daysWater);
    if (p.health < 45) {
      out.push({ id: `care-${p.id}`, plant: p, kind: "care", weight: 0, when: "today",
        title: `${p.nickname} needs care`, why: "Health is dropping — the recovery plan can turn it around", verb: "Open" });
    } else if (p.status !== "urgent" && dueIn === 0) {
      out.push({ id: `water-${p.id}`, plant: p, kind: "water", weight: 1, when: "today",
        title: `Water ${p.nickname}`, why: `Soil should be dry now (about every ${every} days)`, verb: "Water" });
    }
    if (p.health >= 45 && p.health < 70) {
      out.push({ id: `watch-${p.id}`, plant: p, kind: "watch", weight: 3, when: "week",
        title: `Keep an eye on ${p.nickname}`, why: "Holding steady but not improving — recheck this week", verb: "Open" });
    }
    if (dueIn > 0 && dueIn <= 3 && p.status !== "urgent") {
      out.push({ id: `soon-${p.id}`, plant: p, kind: "water", weight: 2, when: "week",
        title: `${p.nickname} needs water in ${dueIn}d`, why: "Coming up — no action needed yet", verb: "Open" });
    }
    const rf = roomFit(p);
    if (rf.canMove && p.health >= 45) {
      out.push({ id: `move-${p.id}`, plant: p, kind: "move", weight: 4, when: "week",
        title: `Consider moving ${p.nickname}`, why: `The ${rf.best.room} has better light for a ${SPECIES[p.speciesKey].common}`, verb: "Open" });
    }
  });
  return out.sort((a, b) => a.weight - b.weight);
}
function taskColor(kind) { return kind === "care" ? T.clay : kind === "watch" ? color.watch : kind === "move" ? T.moss : T.mossBright; }
function taskIcon(kind, c) {
  if (kind === "water") return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8"><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /></svg>;
  if (kind === "move") return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8"><path d="M5 9l-3 3 3 3M2 12h13M19 5l3 3-3 3M22 8H9" /></svg>;
  if (kind === "care") return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 4.3 2 18.5A2 2 0 0 0 3.7 21.5h16.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17h.01" /></svg>;
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></svg>;
}

function makePlant(id, speciesKey, health, room, nickname, lastWateredDays) {
  const s = SPECIES[speciesKey];
  const lwd = lastWateredDays != null ? lastWateredDays : (health < 45 ? 6 : 2);
  return {
    id, speciesKey, nickname: nickname || s.common, health, room,
    status: statusOf(health), light: s.light,
    addedAt: "3 weeks ago", lastWatered: `${lwd} day${lwd === 1 ? "" : "s"} ago`,
    journal: makeJournal(speciesKey, health),
  };
}
// Build a believable 6-point health history ending at the plant's current health.
// Shape depends on trajectory so declining/recovering/stable plants look genuinely different.
function makeJournal(speciesKey, health) {
  const seed = speciesKey.charCodeAt(0) + health; // deterministic per plant
  const rand = (n) => ((Math.sin(seed * 9301 + n * 49297) + 1) / 2);
  const clamp = (v) => Math.max(15, Math.min(99, Math.round(v)));
  // pick a trajectory: low health = declined into trouble; mid = wobble/recovering; high = climbed
  let path;
  if (health < 45) {
    // was healthier, declined into the danger zone (down-trend), maybe a tiny recent uptick
    path = [health + 30, health + 24, health + 15, health + 4, health - 3, health];
  } else if (health < 70) {
    // dipped then recovering — a valley shape
    path = [health + 6, health - 8, health - 12, health - 6, health - 2, health];
  } else {
    // steady climb to thriving
    path = [health - 22, health - 15, health - 9, health - 5, health - 2, health];
  }
  const notes = ["Joined the family", "Settling in", "New growth", "Bit of stress", "Turning a corner", "Latest check-in"];
  const whens = ["6 weeks ago", "5 weeks ago", "3 weeks ago", "2 weeks ago", "1 week ago", "Today"];
  // add subtle per-plant noise so lines aren't mechanically smooth, then reverse (newest first)
  return path.map((v, i) => ({
    id: `j${i}`, when: whens[i], note: notes[i],
    health: clamp(v + (rand(i) - 0.5) * 6),
  })).reverse();
}
const INITIAL = [
  makePlant("p1", "monstera", 91, "Living room", "Monty", 7),      // every 7 → due today (Water now)
  makePlant("p2", "fiddle", 31, "Living room", "Frank"),            // urgent → recovery plan
  makePlant("p3", "calathea", 54, "Bedroom", "Cala"),              // watch
  makePlant("p6", "zz", 74, "Office", "Zizi", 11),                 // every 16 → in 5 days (no button)
  makePlant("p5", "pothos", 80, "Kitchen", "Pothos", 8),           // every 9 → in 1 day (Water early)
  makePlant("p4", "snake", 86, "Office", "Slinky", 14),        // every 16 → in 2 days (Water early)
  makePlant("p7", "lily", 48, "Bedroom", "Lily"),                  // watch/urgent boundary
];

/* ----------------------------- plant artwork ----------------------------- */
/* SVG silhouette (always renders) + real photo layered on top when it loads */
const SILHOUETTE_CFG = {
  monstera: { count: 5, spread: 80, sx: 1.4, sy: 1.05 }, fiddle: { count: 4, spread: 48, sx: 1.15, sy: 1.5 },
  calathea: { count: 6, spread: 86, sx: 0.95, sy: 0.9 }, snake: { count: 5, spread: 34, sx: 0.5, sy: 1.45 },
  pothos: { count: 7, spread: 128, sx: 0.72, sy: 0.62 }, lily: { count: 5, spread: 50, sx: 0.85, sy: 1.3 },
  zz: { count: 6, spread: 60, sx: 0.7, sy: 1.25 },
};
const SILHOUETTE_LEAF_PTS = [[0, 0], [17, -28], [9, -50], [17, -58], [11, -75], [0, -83], [-11, -75], [-17, -58], [-9, -50], [-17, -28]];
/* true bounding box of a species' silhouette -> {w, h, aspect} in local units */
function silhouetteBox(speciesKey) {
  const cfg = SILHOUETTE_CFG[speciesKey] || { count: 5, spread: 70, sx: 1, sy: 1.2 };
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (let i = 0; i < cfg.count; i++) {
    const t = cfg.count === 1 ? 0.5 : i / (cfg.count - 1);
    const angle = (-cfg.spread / 2 + t * cfg.spread) * Math.PI / 180;
    const bs = i % 2 === 0 ? 0.86 : 1;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    for (const [px, py] of SILHOUETTE_LEAF_PTS) {
      const x0 = px * cfg.sx * bs, y0 = py * cfg.sy * bs;
      const x = x0 * ca - y0 * sa, y = x0 * sa + y0 * ca;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const m = 6;
  const w = (maxX - minX) + m * 2, h = (maxY - minY) + m * 2;
  return { w, h, aspect: w / h };
}
/* rendered pixel height of a plant on the shelf given its width in px */
function plantPixelHeight(speciesKey, widthPx) { return widthPx / silhouetteBox(speciesKey).aspect; }

function PlantSilhouette({ speciesKey, baseColor, size = 70, fit }) {
  const base = rgb(baseColor);
  const cfg = {
    monstera: { count: 5, spread: 80, sx: 1.4, sy: 1.05 }, fiddle: { count: 4, spread: 48, sx: 1.15, sy: 1.5 },
    calathea: { count: 6, spread: 86, sx: 0.95, sy: 0.9 }, snake: { count: 5, spread: 34, sx: 0.5, sy: 1.45 },
    pothos: { count: 7, spread: 128, sx: 0.72, sy: 0.62 }, lily: { count: 5, spread: 50, sx: 0.85, sy: 1.3 },
    zz: { count: 6, spread: 60, sx: 0.7, sy: 1.25 },
  }[speciesKey] || { count: 5, spread: 70, sx: 1, sy: 1.2 };
  const LEAF = "M0,0 C13,-2 17,-28 9,-50 C17,-58 11,-75 0,-83 C-11,-75 -17,-58 -9,-50 C-17,-28 -13,-2 0,0 Z";
  // representative outline points of one leaf (base, mid, edges, tip) in local space
  const LEAF_PTS = [[0, 0], [17, -28], [9, -50], [17, -58], [11, -75], [0, -83], [-11, -75], [-17, -58], [-9, -50], [-17, -28]];
  // compute the TRUE bounding box across every leaf (scale -> rotate, plus back-leaf 0.86)
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (let i = 0; i < cfg.count; i++) {
    const t = cfg.count === 1 ? 0.5 : i / (cfg.count - 1);
    const angle = (-cfg.spread / 2 + t * cfg.spread) * Math.PI / 180;
    const bs = i % 2 === 0 ? 0.86 : 1;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    for (const [px, py] of LEAF_PTS) {
      const x0 = px * cfg.sx * bs, y0 = py * cfg.sy * bs;      // scale
      const x = x0 * ca - y0 * sa, y = x0 * sa + y0 * ca;       // rotate
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const m = 6; // small uniform margin
  const vbX = minX - m, vbY = minY - m;
  const vbW = (maxX - minX) + m * 2, vbH = (maxY - minY) + m * 2;

  const leaves = Array.from({ length: cfg.count }, (_, i) => {
    const t = cfg.count === 1 ? 0.5 : i / (cfg.count - 1);
    const angle = -cfg.spread / 2 + t * cfg.spread;
    const back = i % 2 === 0;
    return (
      <g key={i} transform={`rotate(${angle}) scale(${back ? 0.86 : 1})`}>
        <path d={LEAF} fill={base} opacity={back ? 0.82 : 1} transform={`scale(${cfg.sx},${cfg.sy})`} />
        <path d="M0,0 L0,-50" stroke="rgba(255,255,255,0.12)" strokeWidth="1.4" transform={`scale(${cfg.sx},${cfg.sy})`} />
      </g>
    );
  });

  // natural mode: render at true aspect ratio, sized by WIDTH, base anchored to bottom.
  // `size` is the target width in px; height follows the plant's real proportions,
  // so tall species tower and low species stay short — like real plants of the same pot size.
  if (fit === "natural") {
    const aspect = vbW / vbH;
    const w = size, h = size / aspect;
    return (
      <svg width={w} height={h} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMax meet" style={{ display: "block" }}>
        {leaves}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
      {leaves}
    </svg>
  );
}

/* circular plant avatar — SVG silhouette only */
function PlantPhoto({ speciesKey, health, size = 56, round = true, imgW }) {
  const hue = healthHue(health);
  return (
    <div style={{ width: size, height: size, borderRadius: round ? "50%" : 16, overflow: "hidden", position: "relative",
      background: `${rgb(hue)}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <PlantSilhouette speciesKey={speciesKey} baseColor={hue} size={size * 0.74} />
      </div>
    </div>
  );
}

function StatusBar({ light }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);
  let h = now.getHours(); const m = now.getMinutes();
  h = h % 12; if (h === 0) h = 12;
  const timeStr = `${h}:${m < 10 ? "0" + m : m}`;
  return (
    <div className="v-status" style={{ color: light ? color.ink : color.surfaceAlt }}>
      <span>{timeStr}</span>
      <svg width="25" height="12" viewBox="0 0 24 12" fill="none">
        <rect x="1" y="1" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1" />
        <rect x="3" y="3" width="16" height="6" rx="1" fill="currentColor" />
        <rect x="22" y="4" width="1.5" height="4" rx="0.7" fill="currentColor" />
      </svg>
    </div>
  );
}

const STAR_FIELD = Array.from({ length: 40 }, (_, i) => {
  const r = ((i * 9301 + 49297) % 233280) / 233280;
  const r2 = ((i * 4523 + 1031) % 233280) / 233280;
  const r3 = ((i * 7919 + 17) % 233280) / 233280;
  return { x: r * 100, y: r2 * 52, o: 0.4 + r3 * 0.6, sz: 1 + Math.round(r3 * 1.5) };
});

/* Reusable time-aware sky — the app's living daybreak atmosphere. */
function LivingSky({ hour, showCelestial = true, realisticSky = false }) {
  const L = lightAt(hour);
  const warmth = L.warmth;
  let sunPos, moonPos, sunOpacity, moonOpacity, glowX;
  if (realisticSky) {
    // Garden page: two independent overhead arcs, both east→west (left→right).
    const cel = celestialRealistic(hour);
    const fade = (alt) => Math.max(0, Math.min(1, alt / 0.16)); // dim near each horizon → masks the hidden reset
    sunPos = cel.sun; moonPos = cel.moon;
    sunOpacity = fade(cel.sun.alt);
    moonOpacity = fade(cel.moon.alt);
    glowX = sunOpacity >= moonOpacity ? cel.sun.cx : cel.moon.cx;
  } else {
    // Onboarding / everywhere else: original single continuous circle (unchanged).
    const sun = celestialPos(hour);
    const aboveness = (50 - sun.cy) / 38;
    sunOpacity = Math.max(0, Math.min(1, (aboveness + 0.12) / 0.24));
    moonOpacity = 1 - sunOpacity;
    sunPos = sun; moonPos = sun;
    glowX = sun.cx;
  }
  return (
    <>
      <div className="vd-sky" style={{ background: `linear-gradient(180deg, ${rgb(L.top)} 0%, ${rgb(L.bot)} 100%)` }}>
        <div className="vd-stars" style={{ opacity: Math.max(0, 1 - L.warmth * 2.2) }}>
          {STAR_FIELD.map((s, i) => <div key={i} className="vd-star" style={{ top: `${s.y}%`, left: `${s.x}%`, opacity: s.o, width: s.sz, height: s.sz }} />)}
        </div>
      </div>
      {/* soft horizon glow — warms where a body is crossing */}
      <div className="vd-horizon" style={{ opacity: Math.max(sunOpacity, moonOpacity) < 0.85 ? 0.9 : 0.35, background: `radial-gradient(120% 60% at ${glowX}% 50%, rgba(${Math.round(255 * (0.6 + warmth * 0.4))},${Math.round(180 + warmth * 50)},${Math.round(120 + warmth * 40)},0.28), transparent 70%)` }} />
      {showCelestial && (
        <>
          <div className="vd-celestial" style={{
            left: `${sunPos.cx}%`, top: `${sunPos.cy}%`, opacity: sunOpacity,
            background: `radial-gradient(circle, ${rgb(L.sun)} 0%, ${rgb(L.sun)} 55%, transparent 72%)`,
            boxShadow: `0 0 60px 20px rgba(${L.sun[0]},${L.sun[1]},${L.sun[2]},${0.4 * L.warmth + 0.15})`,
            width: 64, height: 64,
          }} />
          <div className="vd-celestial" style={{
            left: `${moonPos.cx}%`, top: `${moonPos.cy}%`, opacity: moonOpacity,
            background: `radial-gradient(circle at 38% 38%, ${palette.water100} 0%, ${palette.water150} 60%, transparent 72%)`,
            boxShadow: `0 0 30px 8px rgba(200,205,230,0.25)`,
            width: 44, height: 44,
          }} />
        </>
      )}
    </>
  );
}

/* ============================ HOME (Daybreak) ============================ */
function HomeScreen({ plants, hour, onOpenPlant, onOpenRooms, onOpenPlants, onAdd, onWater, onWaterTask, onWaterAll, doneTasks, markTaskDone, mounted, guest, onSignIn }) {
  const [todoExpanded, setTodoExpanded] = useState(false);
  const [completing, setCompleting] = useState({});
  const completeTask = (t) => {
    if (completing[t.id]) return;
    setCompleting((c) => ({ ...c, [t.id]: true }));   // check hides, pot fills, then collapses
    setTimeout(() => markTaskDone(t.id), 1450);         // remove after the fill + collapse
  };
  const L = lightAt(hour);
  const sun = { ...celestialRealistic(hour).sun, isDay: hour >= 6 && hour <= 18 };
  const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
  const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const greeting = hour < 5 ? "Still resting" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Winding down";
  const lightText = L.warmth > 0.5 ? color.ink : color.surfaceAlt;
  const shadowSkew = sun.isDay ? (sun.cx - 50) * 0.5 : 0;
  const shadowLen = sun.isDay ? lerp(0.4, 1.2, 1 - sun.cy / 58) : 0.3;

  return (
    <div className="v-screen">
      {/* SKY — realistic east→west sun & moon, Garden page only */}
      <LivingSky hour={hour} realisticSky={true} />
      <StatusBar light={L.warmth > 0.5} />

      <div className="vd-content">
        <div className="vd-head" style={{ color: lightText }}>
          <div className="vd-head-top">
            <div className="vd-time"><span className="vd-phase-dot" style={{ background: rgb(L.sun) }} />{L.label.toUpperCase()} · {timeStr}</div>
            <button className="vd-add-btn" onClick={onAdd} aria-label="Add a plant"
              style={{ background: L.warmth > 0.5 ? "rgba(28,36,25,0.1)" : "rgba(246,244,238,0.16)", borderColor: L.warmth > 0.5 ? "rgba(28,36,25,0.18)" : "rgba(246,244,238,0.3)", color: lightText }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12.5c0-4.5 2.2-8 8-9.5-0.5 5-3.2 8.8-8 9.5Z" /><path d="M12 12.5c0-4.5-2.2-8-8-9.5 0.5 5 3.2 8.8 8 9.5Z" /><path d="M12 12.5v-2.5" /><path d="M5 12.5h14l-1.4 8a1 1 0 0 1-1 .8H7.4a1 1 0 0 1-1-.8L5 12.5Z" /></svg>
              Add plant
            </button>
          </div>
          <h1 className={`vd-greeting${mounted ? " in" : ""}`}>
            {greeting.split(" ").map((w, i, arr) => i === arr.length - 1 ? <em key={i}>{w}</em> : w + " ")}
          </h1>
          <div className={`vd-sub${mounted ? " in" : ""}`} style={{ color: L.warmth > 0.5 ? "rgba(28,36,25,0.75)" : "rgba(246,244,238,0.92)" }}>
            {hour < 5 ? "The garden rests in the quiet dark." : hour < 12 ? "Morning light is reaching the leaves." : hour < 17 ? "Warm light settling across the garden." : hour < 21 ? "The day is softening into evening." : "The garden is winding down with you."}
          </div>

          {/* quick access — restores entry to the All-Plants deck & Rooms */}
          <div className={`vd-access${mounted ? " in" : ""}`}>
            <button className="vd-access-btn" onClick={onOpenPlants} style={{ background: L.warmth > 0.5 ? "rgba(255,255,255,0.42)" : "rgba(246,244,238,0.14)", borderColor: L.warmth > 0.5 ? "rgba(28,36,25,0.1)" : "rgba(246,244,238,0.22)", color: lightText }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: -2 }}><path d="M12 12.5c0-4.5 2.2-8 8-9.5-0.5 5-3.2 8.8-8 9.5Z" /><path d="M12 12.5c0-4.5-2.2-8-8-9.5 0.5 5 3.2 8.8 8 9.5Z" /><path d="M12 12.5v-2.5" /><path d="M5 12.5h14l-1.4 8a1 1 0 0 1-1 .8H7.4a1 1 0 0 1-1-.8L5 12.5Z" /></svg>
              <span className="vd-access-lbl">Plants</span><span className="vd-access-num">{plants.length}</span>
            </button>
            <button className="vd-access-btn" onClick={onOpenRooms} style={{ background: L.warmth > 0.5 ? "rgba(255,255,255,0.42)" : "rgba(246,244,238,0.14)", borderColor: L.warmth > 0.5 ? "rgba(28,36,25,0.1)" : "rgba(246,244,238,0.22)", color: lightText }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21V9l9-6 9 6v12M3 21h18M9 21v-6h6v6" /></svg>
              <span className="vd-access-lbl">Rooms</span><span className="vd-access-num">{new Set(plants.map((p) => p.room)).size}</span>
            </button>
          </div>

          {/* DAILY BRIEFING — one glass bar that reads like a sentence, expands on tap */}
          <div className={`vd-brief-wrap${mounted ? " in" : ""}`}>
            {(() => {
              const tasks = buildTasks(plants);
              const todays = tasks.filter((t) => !doneTasks[t.id] && t.when === "today");
              const waterTodays = todays.filter((t) => t.kind === "water");
              const batch = waterTodays.length >= 2;
              const nonBatch = todays.filter((t) => !(batch && t.kind === "water"));
              const light = L.warmth > 0.5;
              const glass = { background: light ? "rgba(251,249,244,0.7)" : "rgba(28,36,25,0.42)", borderColor: light ? "rgba(28,36,25,0.08)" : "rgba(246,244,238,0.16)", color: lightText };

              if (todays.length === 0) {
                return (
                  <div className="vd-brief-card" style={glass}>
                    <div className="vd-brief-head vd-brief-static">
                      <span className="vd-brief-ic" style={{ color: T.moss }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></svg></span>
                      <span className="vd-brief-text">All set for today — nothing needs you.</span>
                    </div>
                  </div>
                );
              }

              // Visual summary of the day: one semantic chip per task type (icon +
              // color), with a count when a type repeats. Scannable at a glance, and
              // previews the same color-coded icons used in the expanded list below.
              const byKind = [];
              todays.forEach((t) => {
                const g = byKind.find((x) => x.kind === t.kind);
                if (g) g.count++; else byKind.push({ kind: t.kind, count: 1 });
              });
              const hasAttention = todays.some((t) => t.kind !== "water");
              const heroGlass = hasAttention
                ? { ...glass, background: light ? "rgba(252,246,236,0.78)" : "rgba(46,38,22,0.46)", borderColor: light ? "rgba(138,104,32,0.22)" : "rgba(232,176,75,0.28)" }
                : glass;
              const title = todays.length === 1
                ? `${todays[0].plant.nickname.split(" ")[0]} needs you today`
                : `${todays.length} tasks today`;

              return (
                <div className={`vd-brief-card vd-brief-hero${todoExpanded ? " open" : ""}`} style={heroGlass}>
                  <button className="vd-brief-head" onClick={() => setTodoExpanded((v) => !v)}>
                    <span className="vd-brief-text">
                      <b>{title}</b>
                    </span>
                    {!todoExpanded && (
                      <span className="vd-brief-chips">
                        {byKind.map((g) => {
                          const c = taskColor(g.kind);
                          return (
                            <span key={g.kind} className="vd-brief-chip" style={{ background: `${c}1e`, color: c }}>
                              {taskIcon(g.kind, c)}
                              <span className="vd-brief-chip-n">{g.count}</span>
                            </span>
                          );
                        })}
                      </span>
                    )}
                    <svg className="vd-brief-chev" style={{ transform: todoExpanded ? "rotate(180deg)" : "none" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                  </button>

                  <div className={`vd-brief-reveal${todoExpanded ? " open" : ""}`}>
                    <div className="vd-brief-reveal-inner">
                      <div className="vd-brief-items">
                        {batch && (
                          <div className="vd-bi vd-bi-batch">
                            <span className="vd-bi-ic" style={{ background: `${T.mossBright}1e`, color: T.mossBright }}>{taskIcon("water", T.mossBright)}</span>
                            <span className="vd-bi-body">
                              <span className="vd-bi-title">Water {waterTodays.length} plants</span>
                              <span className="vd-bi-sub">{waterTodays.map((t) => t.plant.nickname).join(", ")}</span>
                            </span>
                            <button className="vd-bi-act" style={{ background: T.moss }} onClick={(e) => { e.stopPropagation(); onWaterAll(waterTodays); }}>Water all</button>
                          </div>
                        )}
                        {nonBatch.map((t) => {
                          const c = taskColor(t.kind);
                          return (
                            <div key={t.id} className={`vd-bi${completing[t.id] ? " completing" : ""}`} onClick={() => onOpenPlant(t.plant.id)}>
                              <span className="vd-bi-ic" style={{ background: `${c}1e`, color: c }}>{taskIcon(t.kind, c)}</span>
                              <span className="vd-bi-body">
                                <span className="vd-bi-title">{t.title}</span>
                                <span className="vd-bi-sub">{t.why}</span>
                              </span>
                              {t.kind === "water"
                                ? <button className="vd-bi-act" style={{ background: c }} onClick={(e) => { e.stopPropagation(); onWaterTask(t.plant.id, t.id); }}>Water</button>
                                : <button className="vd-bi-check" onClick={(e) => { e.stopPropagation(); completeTask(t); }} aria-label={`Mark done: ${t.title}`}><span className="vd-bi-check-fill" /><svg className="vd-bi-check-tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></button>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {guest && (
            <div className={`vd-guest${mounted ? " in" : ""}`} style={{ background: L.warmth > 0.5 ? "rgba(251,249,244,0.72)" : "rgba(28,36,25,0.42)", borderColor: L.warmth > 0.5 ? "rgba(28,36,25,0.08)" : "rgba(246,244,238,0.16)" }}>
              <span className="vd-guest-ic" style={{ color: T.mossBright, background: `${T.mossBright}22` }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.4" /><path d="M3.5 20c0-3.3 2.6-5.6 5.5-5.6 1.3 0 2.5.5 3.5 1.2" /><path d="M18 14v6M15 17h6" /></svg>
              </span>
              <span className="vd-guest-body" style={{ color: lightText }}>
                <span className="vd-guest-title">You're exploring as a guest</span>
                <span className="vd-guest-sub" style={{ color: L.warmth > 0.5 ? "rgba(28,36,25,0.6)" : "rgba(246,244,238,0.68)" }}>Sign in to keep your garden safe across devices.</span>
              </span>
              <button className="vd-guest-cta" onClick={onSignIn}>Sign in</button>
            </div>
          )}
        </div>

        {/* SHELF — a garden seen at a low angle: same width, natural heights, depth along Z */}
        <div className="vd-shelf">
          <div className="vd-ground" style={{ background: `linear-gradient(180deg, transparent 0%, rgba(28,36,25,${0.1 + (1 - L.warmth) * 0.16}) 100%)` }} />
          {plants.map((p, i, arr) => {
            const baseHue = healthHue(p.health);
            const lit = lerpColor(baseHue, [Math.min(255, baseHue[0] + 40), Math.min(255, baseHue[1] + 30), baseHue[2]], L.warmth * 0.28);
            const n = arr.length;
            const layerOf = (idx) => idx % 2;                 // 0 = front, 1 = back
            const layer = layerOf(i);
            const frontIdxs = arr.map((_, k) => k).filter((k) => layerOf(k) === 0);
            const backIdxs = arr.map((_, k) => k).filter((k) => layerOf(k) === 1);
            const group = layer === 0 ? frontIdxs : backIdxs;
            const posInLayer = group.indexOf(i);
            const layerN = group.length;

            const FRONT_GROUND = 102;    // front baseline (both rows derive from this) — lowered 10px
            const FRONT_W = 150;         // front plant width
            const BACK_W = 118;          // back plants a touch smaller (further away)
            const d = layer === 0 ? 0.12 : 0.78;   // back row pushed further on Z (was 0.7)

            let bottom, commonW, xPos;
            if (layer === 0) {
              commonW = FRONT_W;
              bottom = FRONT_GROUND - 10;   // bottom row nudged 10px down
              xPos = layerN === 1 ? 50 : 12 + (posInLayer / (layerN - 1)) * 76;
            } else {
              commonW = BACK_W;
              // back row sits just behind and slightly above the front baseline — close enough
              // to read as one cluster, raised only a little so each plant peeks up clearly.
              bottom = FRONT_GROUND + 46;
              // stagger back plants into the GAPS between front plants (not directly behind them)
              // so nothing gets eclipsed. Front slots are ~12/37/63/88%; gaps fall near 25/50/75%.
              xPos = layerN === 1 ? 50 : 25 + (posInLayer / (layerN - 1)) * 50;
            }
            const nudgeX = p.speciesKey === "snake" ? -10 : 0;  // snake plant shifted 10px left
            return (
              <div key={p.id} className="vd-plant"
                style={{ left: `${xPos}%`, bottom,
                  transform: mounted ? `translateX(calc(-50% + ${nudgeX}px))` : `translateX(calc(-50% + ${nudgeX}px)) translateY(30px)`,
                  opacity: mounted ? (1 - d * 0.18) : 0,
                  filter: d > 0.4 ? `brightness(${1 - (d - 0.4) * 0.18})` : "none",
                  zIndex: Math.round(30 - d * 25), transitionDelay: `${i * 70}ms` }}
                onClick={() => onOpenPlant(p.id)}>
                <div className="vd-plant-glow" style={{ background: `radial-gradient(circle, rgba(${L.sun[0]},${L.sun[1]},${L.sun[2]},${0.4 * L.warmth}) 0%, transparent 70%)`, opacity: L.warmth * (1 - d * 0.5) }} />
                <div className="vd-sway" style={{ animationDuration: `${4.6 + (i % 5) * 0.7}s`, animationDelay: `${(i % 4) * -1.3}s`, transformOrigin: "bottom center" }}>
                  <PlantSilhouette speciesKey={p.speciesKey} baseColor={lit} size={commonW} fit="natural" />
                </div>
                <div className="vd-plant-shadow" style={{ width: commonW * 0.6 * (0.7 + shadowLen * 0.4), transform: `translateX(-50%) skewX(${shadowSkew}deg) scaleX(${1 + shadowLen * 0.4})`, opacity: (sun.isDay ? 0.16 + L.warmth * 0.18 : 0.1) * (1 - d * 0.5) }} />
                {p.health < 45 && <div className="vd-plant-alert">!</div>}
                <div className="vd-plant-label" style={{ background: L.warmth > 0.5 ? "rgba(28,36,25,0.82)" : "rgba(246,244,238,0.9)", color: L.warmth > 0.5 ? color.surfaceAlt : color.ink }}>{p.nickname}</div>
              </div>
            );
          })}
          {L.warmth < 0.35 && (
            <div className="vd-fireflies" aria-hidden="true" style={{ opacity: (0.35 - L.warmth) / 0.35 }}>
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="vd-firefly" style={{
                  left: `${8 + (i * 10.5) % 84}%`,
                  bottom: `${20 + (i * 27) % 120}px`,
                  animationDuration: `${5 + (i % 4) * 1.6}s`,
                  animationDelay: `${(i % 5) * -1.4}s`,
                }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================ PLANT DETAIL ============================ */
function HealthTrend({ journal, color }) {
  const pts = [...journal].reverse().map((j) => j.health);
  if (pts.length < 2) return null;
  const w = 100, h = 32, min = Math.min(...pts) - 6, max = Math.max(...pts) + 6;
  const range = Math.max(1, max - min);
  const coords = pts.map((v, i) => [i / (pts.length - 1) * w, h - ((v - min) / range) * h]);
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.22" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#tg)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="3" fill={color} />
    </svg>
  );
}

/* large health-history chart for the journal tab */
function HealthChart({ journal, color }) {
  const data = [...journal].reverse();
  const pts = data.map((j) => j.health);
  if (pts.length < 2) return null;
  const w = 320, h = 120, pad = 8;
  const min = Math.max(0, Math.min(...pts) - 10), max = Math.min(100, Math.max(...pts) + 8);
  const range = Math.max(1, max - min);
  const X = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const Y = (v) => pad + (1 - (v - min) / range) * (h - pad * 2);
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${X(pts.length - 1)},${h - pad} L${X(0)},${h - pad} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs><linearGradient id="hc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.24" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke={T.line} strokeWidth="1" />)}
      <path d={area} fill="url(#hc)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r={i === pts.length - 1 ? 4 : 2.5} fill={i === pts.length - 1 ? color : palette.white} stroke={color} strokeWidth="1.8" />)}
    </svg>
  );
}

/* confidence ring for the diagnosis hero */
function ConfidenceRing({ value, color, size = 62 }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`${color}22`} strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="16" fill={T.ink}>{value}</text>
    </svg>
  );
}

function DetailScreen({ plant, onBack, onWater, onAddJournal, faved, onToggleFavorite, onMovePlant, onRemovePlant, onRestorePlant }) {
  const s = SPECIES[plant.speciesKey];
  const color = healthColor(plant.health);
  const diag = DIAGNOSIS[plant.status];
  const env = envFor(plant.speciesKey);
  const [mounted, setMounted] = useState(false);
  const [waterSnap, setWaterSnap] = useState(null); // pre-water snapshot, for inline undo
  const [sheet, setSheet] = useState(null);   // null | 'diagnosis' | 'care' | 'journal'
  const sheetDrag = useSheetDrag(() => setSheet(null));
  const [full, setFull] = useState(false);      // tier 3: full details within a sheet
  const [moveOpen, setMoveOpen] = useState(false); // move-room picker in care guide
  const moveDrag = useSheetDrag(() => setMoveOpen(false));
  const fit = roomFit(plant);
  const wi = waterInfo(plant);
  const [doneSteps, setDoneSteps] = useState({});
  const [justWatered, setJustWatered] = useState(false);
  const [hasWatered, setHasWatered] = useState(false);
  const [waterFx, setWaterFx] = useState(false);
  const [healthPop, setHealthPop] = useState(false);
  const [displayHealth, setDisplayHealth] = useState(plant.health);
  useEffect(() => { setDisplayHealth(plant.health); setHasWatered(false); }, [plant.id]);
  useEffect(() => { setMounted(false); const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, [plant.id]);
  function openSheet(name) { setFull(false); setSheet(name); }

  const stepsTotal = diag.revive.length;
  const stepsDone = Object.values(doneSteps).filter(Boolean).length;
  const toggleStep = (i) => setDoneSteps((d) => ({ ...d, [i]: !d[i] }));
  const waterEvery = wi.every;
  const nextWaterIn = wi.nextWaterIn;
  const waterDue = wi.state === "due";

  function handleWater() {
    if (justWatered) return;
    setWaterSnap({ id: plant.id, health: plant.health, status: plant.status, lastWatered: plant.lastWatered });
    setJustWatered(true);
    setHasWatered(true);
    setWaterFx(true);
    onWater(plant.id);
    // animate the health number ticking up (+10, clamped)
    const target = Math.min(99, plant.health + 10);
    let cur = plant.health;
    const iv = setInterval(() => {
      cur += 1;
      if (cur >= target) { cur = target; clearInterval(iv); }
      setDisplayHealth(cur);
    }, 55);
    setTimeout(() => setHealthPop(true), 250);
    setTimeout(() => setHealthPop(false), 900);
    setTimeout(() => setWaterFx(false), 1400);
    setTimeout(() => setJustWatered(false), 1800);
  }
  function undoWater() {
    if (!waterSnap) return;
    onRestorePlant(waterSnap);
    setHasWatered(false); setJustWatered(false); setWaterFx(false); setHealthPop(false);
    setDisplayHealth(waterSnap.health);
    setWaterSnap(null);
  }

  const headline = plant.status === "urgent"
    ? `${plant.nickname} needs help — but this is fixable.`
    : plant.status === "watch"
    ? `${plant.nickname} is okay, with one thing to watch.`
    : `${plant.nickname} is thriving. Keep it up.`;
  const nextAction = plant.status === "urgent" ? "Hold off watering — soil is still wet" : `Next water in ${nextWaterIn} day${nextWaterIn === 1 ? "" : "s"}`;

  const roomLight = fit.roomLight;
  const roomHum = fit.roomHum;
  const matches = [
    { label: "Light", need: s.light, have: roomLight, ok: fit.lightOk, needTxt: env.light.label, haveTxt: `${plant.room} is ${roomLight >= 65 ? "bright" : roomLight >= 45 ? "medium" : "dim"}` },
    { label: "Humidity", need: env.humidity.pct, have: roomHum, ok: fit.humOk, needTxt: env.humidity.label, haveTxt: `${plant.room} ~${roomHum}% (est.)` },
    { label: "Watering", need: waterEvery, have: waterEvery, ok: wi.state !== "hold", needTxt: s.water, haveTxt: wi.state === "hold" ? "Hold off — soil still wet" : wi.state === "due" ? "Due today" : `On track — every ~${waterEvery} days` },
  ];
  const lightFit = fit.lightOk ? "Good" : roomLight < s.light ? "Low" : "High";

  // journal insight (less generic)
  const jHealth = [...plant.journal].reverse().map((j) => j.health);
  const jChange = jHealth.length >= 2 ? jHealth[jHealth.length - 1] - jHealth[0] : 0;
  const jTrendTxt = jChange > 2 ? `Up ${jChange} points — trending healthy` : jChange < -2 ? `Down ${Math.abs(jChange)} points — needs attention` : "Holding steady";

  return (
    <div className="v-screen">
      <div className="dz">
        <div className={`dz-photo${waterFx ? " watered" : ""}`}><PlantPhoto speciesKey={plant.speciesKey} health={plant.health} size={470} round={false} imgW={900} /></div>
        {waterFx && (
          <div className="dz-waterfx" aria-hidden="true">
            <span className="dz-drop dz-drop1" />
            <span className="dz-drop dz-drop2" />
            <span className="dz-drop dz-drop3" />
            <span className="dz-drop dz-drop4" />
            <span className="dz-drop dz-drop5" />
            <span className="dz-perkglow" />
          </div>
        )}
        <div className="dz-veil" />
        <div className="dz-statuswash" style={{ background: `radial-gradient(120% 80% at 50% 100%, ${color}2e 0%, transparent 60%)` }} />
        <div className="dz-top">
          <button className="dz-icon" onClick={onBack} aria-label="Back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg></button>
          <div className="dz-top-right">
            <button className="dz-icon" onClick={() => onToggleFavorite(plant.id)} aria-label={faved ? "Unfavorite" : "Favorite"}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill={faved ? palette.white : "none"} stroke={palette.white} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 11-8 11Z" /></svg>
            </button>
            <button className="dz-icon" onClick={() => setSheet(sheet === "options" ? null : "options")} aria-label="More options" aria-haspopup="menu" aria-expanded={sheet === "options"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={palette.white} stroke="none"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
            </button>
            {sheet === "options" && (
              <>
                <div className="dz-menu-scrim" onClick={() => setSheet(null)} />
                <div className="dz-menu" role="menu" aria-label={`${plant.nickname} options`}>
                  <button className="dz-menu-item danger" role="menuitem" onClick={() => setSheet("remove")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" /></svg>
                    Remove from garden
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="dz-scroll">
          <div className="dz-spacer" />

          <div className={`dz-id${mounted ? " in" : ""}`}>
            <div className="dz-pulse-row"><span className="dz-pulse" style={{ background: color }} /><span className="dz-pulse-lbl">{statusLabel(plant.status)}</span></div>
            <h1 className="dz-name">{plant.nickname}</h1>
            <div className="dz-latin">{s.common} · {plant.room}</div>
          </div>

          {/* TIER 1 — a little more detail, surfaced right on the canvas */}
          <div className={`dz-vitals${mounted ? " in" : ""}`}>
            <div className="dz-vital"><div className={`dz-vital-num${healthPop ? " pop" : ""}`} style={{ color: healthColorLight(displayHealth) }}>{displayHealth}</div><div className="dz-vital-lbl">Health</div></div>
            <div className="dz-vital-div" />
            <div className="dz-vital"><div className="dz-vital-num">{nextWaterIn === 0 ? "Now" : `${nextWaterIn}d`}</div><div className="dz-vital-lbl">Next water</div></div>
            <div className="dz-vital-div" />
            <div className="dz-vital"><div className="dz-vital-num" style={{ color: matches[0].ok ? palette.white : color.watchSoft }}>{lightFit}</div><div className="dz-vital-lbl">Light fit</div></div>
          </div>

          {/* TREND — where this plant is heading */}
          <div className={`dz-trend${mounted ? " in" : ""}`}>
            <div className="dz-trend-l">
              <div className="dz-trend-dir" style={{ color: healthColorLight(plant.health) }}>
                {jChange > 2 ? (<><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M4 17l7-7 4 4 5-6" /><path d="M20 8h-4M20 8v4" /></svg>Recovering</>)
                  : jChange < -2 ? (<><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M4 7l7 7 4-4 5 6" /><path d="M20 16h-4M20 16v-4" /></svg>Declining</>)
                  : (<><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M4 12h16" /></svg>Holding steady</>)}
              </div>
              <div className="dz-trend-sub">{jChange > 2 ? `Up ${jChange} points over ${plant.journal.length} check-ins` : jChange < -2 ? `Down ${Math.abs(jChange)} points — watch closely` : `Stable across ${plant.journal.length} check-ins`}</div>
            </div>
            <div className="dz-trend-spark"><HealthTrend journal={plant.journal} color={healthColorLight(plant.health)} /></div>
          </div>

          {/* RHYTHM — the plant's care cadence, a relationship with a schedule */}
          <div className={`dz-rhythm${mounted ? " in" : ""}`}>
            <div className="dz-rhythm-step">
              <div className="dz-rhythm-k">Last watered</div>
              <div className="dz-rhythm-v">{plant.lastWatered}</div>
            </div>
            <div className="dz-rhythm-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg></div>
            <div className="dz-rhythm-step">
              <div className="dz-rhythm-k">Every</div>
              <div className="dz-rhythm-v">~{waterEvery} days</div>
            </div>
            <div className="dz-rhythm-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg></div>
            <div className="dz-rhythm-step">
              <div className="dz-rhythm-k">Next due</div>
              <div className="dz-rhythm-v" style={{ color: nextWaterIn === 0 ? healthColorLight(plant.health) : palette.white }}>{nextWaterIn === 0 ? "Today" : `in ${nextWaterIn}d`}</div>
            </div>
          </div>

          <div className={`dz-call${mounted ? " in" : ""}`}>
            <div className="dz-headline">{headline}</div>
            {plant.status === "urgent" ? (
              <>
                <button className="dz-action urgent" onClick={() => openSheet("diagnosis")}>
                  <span className="dz-action-main"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21v-8"/><path d="M12 13c0-3.3 2.4-5.5 6-5.5.3 3.3-2.2 5.5-6 5.5Z"/><path d="M12 15c0-2.8-2-4.8-5-4.8-.2 2.8 1.7 4.8 5 4.8Z"/><path d="M7 21h10"/></svg>Start recovery plan</span>
                  <span className="dz-action-steps">{stepsTotal} steps</span>
                </button>
                <div className="dz-status subtle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /><path d="M4 3l16 18" /></svg>Hold off watering — soil is still wet</div>
              </>
            ) : hasWatered ? (
              <div className="dz-status done">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.mossBright} strokeWidth="2.4"><path d="M20 6L9 17l-5-5" /></svg>
                <span className="dz-status-done-txt">Watered · +10 health · next water in ~{waterEvery} days</span>
                <button className="dz-status-undo" onClick={undoWater}>Undo</button>
              </div>
            ) : waterDue ? (
              <div className="dz-status"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8"><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /></svg>Needs water today<button className="dz-status-log" onClick={handleWater}>Water now</button></div>
            ) : nextWaterIn <= 2 ? (
              <div className="dz-status"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8"><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /></svg>{nextAction}<button className="dz-status-log" onClick={handleWater}>Water early</button></div>
            ) : (
              <div className="dz-status"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8"><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /></svg>{nextAction}</div>
            )}
          </div>

          <div className={`dz-explore${mounted ? " in" : ""}`}>
            <button className="dz-row" onClick={() => openSheet("diagnosis")}>
              <span className="dz-row-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.4 13.3 12 21l-8.4-7.7A5 5 0 0 1 12 6.5a5 5 0 0 1 8.4 6.8Z"/><path d="M3.5 12.5h4l2-3.5 3 7 2-4.5h6"/></svg></span>
              <span className="dz-row-body"><span className="dz-row-lbl">Health check</span><span className="dz-row-prev">{diag.title} · {diag.confidence}% confident</span></span>
              <svg className="dz-row-arr" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <div className="dz-row-sep" />
            <button className="dz-row" onClick={() => openSheet("care")}>
              <span className="dz-row-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="1.8"><path d="M12 22V12M12 12C12 8 9 5 5 5c0 4 3 7 7 7ZM12 12c0-4 3-7 7-7 0 4-3 7-7 7Z" /></svg></span>
              <span className="dz-row-body"><span className="dz-row-lbl">Care guide</span><span className="dz-row-prev">{(() => {
                const off = matches.filter((m) => !m.ok);
                return off.length === 0 ? "Light, humidity & watering all suit it" : `${off.length} to check — ${off.map((m) => m.label.toLowerCase()).join(" & ")}`;
              })()}</span></span>
              <svg className="dz-row-arr" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <div className="dz-row-sep" />
            <button className="dz-row" onClick={() => openSheet("journal")}>
              <span className="dz-row-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 15l5-4 4 3 4-5 5 6" /></svg></span>
              <span className="dz-row-body"><span className="dz-row-lbl">Journal</span><span className="dz-row-prev">{jTrendTxt} · {plant.journal.length} check-ins</span></span>
              <svg className="dz-row-arr" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>
      </div>

      {sheet && sheet !== "options" && <div className="dz-sheet-scrim" onClick={() => setSheet(null)} />}

      {/* ---------- HEALTH CHECK ---------- */}
      {sheet === "diagnosis" && (
        <div className="dz-sheet" ref={sheetDrag.ref} onTouchStart={sheetDrag.onTouchStart} onTouchMove={sheetDrag.onTouchMove} onTouchEnd={sheetDrag.onTouchEnd} onMouseDown={sheetDrag.onMouseDown}>
          <div className="dz-sheet-grip" />
          <div className="dz-sheet-scroll dz-sheet-scroll-pinned">
            <div className="dz-sheet-titlerow">
              <div><div className="dz-sheet-title">Health check</div><div className="dz-sheet-sub">{diag.title}</div></div>
              <ConfidenceRing value={diag.confidence} color={color} size={54} />
            </div>
            {/* TIER 2 — digest */}
            <div className="dz-verdict" style={{ background: `${color}12`, borderColor: `${color}2a` }}>
              <span className="dz-verdict-txt">{diag.summary}</span>
            </div>
            {diag.revive.length > 0 && (
              <div className="dz-do-now">
                <div className="dz-do-now-lbl">Do this first</div>
                <div className="dz-do-now-step">{diag.revive[0].step}</div>
                <div className="dz-do-now-detail">{diag.revive[0].detail}</div>
              </div>
            )}
            {/* TIER 3 — full */}
            {!full ? (
              <button className="dz-more" onClick={() => setFull(true)}>See full analysis<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg></button>
            ) : (
              <div className="dz-full">
                <div className="dz-full-lbl">What the scan detected</div>
                <div className="cg-cond">
                  {diag.findings.map((f, i) => {
                    const positive = /positive|strong|good/i.test(f.weight);
                    return (
                      <div key={i} className="cg-cond-row">
                        <span className="cg-cond-ic" style={{ background: positive ? `${T.moss}18` : `${color.watch}18`, color: positive ? T.moss : color.watch }}>
                          {positive
                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>
                            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>}
                        </span>
                        <div className="cg-cond-body"><div className="cg-cond-label">{f.text}</div></div>
                        <span className="cg-cond-flag" style={{ color: T.inkFaint, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>{f.weight}</span>
                      </div>
                    );
                  })}
                </div>
                {diag.ifIgnored && (<div className="dt-ifignored"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.clay} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 4.3 2 18.5A2 2 0 0 0 3.7 21.5h16.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17h.01" /></svg><span><b>If left unchanged:</b> {diag.ifIgnored}</span></div>)}
                {diag.revive.length > 0 && (
                  <>
                    <div className="dt-revive-head"><div className="dz-full-lbl" style={{ margin: 0 }}>Recovery plan</div><div className="dt-revive-progress">{stepsDone}/{stepsTotal} done</div></div>
                    <div className="dt-revive-track"><div className="dt-revive-trackfill" style={{ width: `${(stepsDone / stepsTotal) * 100}%`, background: color }} /></div>
                    {diag.revive.map((r, i) => { const isDone = !!doneSteps[i]; return (
                      <button key={i} className={`dt-revive${isDone ? " done" : ""}`} onClick={() => toggleStep(i)}>
                        <div className="dt-revive-check" style={{ borderColor: color, background: isDone ? color : "transparent" }}>{isDone && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1" stroke={palette.white} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div>
                        <div className="dt-revive-content"><div className="dt-revive-step">{r.step}</div><div className="dt-revive-detail">{r.detail}</div></div>
                      </button>); })}
                  </>
                )}
                <div className="dt-outlook"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V12"/><path d="M12 12c0-3.3-2.7-6-6-6-.5 3.3 2.2 6 6 6Z"/><path d="M12 10c0-3 2.5-5.5 5.5-5.5C18 7.5 15.5 10 12 10Z"/></svg><span>{diag.outlook}</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- CARE GUIDE ---------- */}
      {sheet === "care" && (
        <div className="dz-sheet" ref={sheetDrag.ref} onTouchStart={sheetDrag.onTouchStart} onTouchMove={sheetDrag.onTouchMove} onTouchEnd={sheetDrag.onTouchEnd} onMouseDown={sheetDrag.onMouseDown}>
          <div className="dz-sheet-grip" />
          <div className="dz-sheet-scroll dz-sheet-scroll-pinned">
            <div className="dz-sheet-title">Care guide</div>
            {/* verdict — three honest states, all from the shared roomFit():
                great spot (all room conditions met) · a better room exists (move) ·
                off but no better room available. Can never contradict the rows below. */}
            <div className="dz-verdict" style={{ background: fit.roomOk ? `${T.moss}12` : `${color.watch}0f`, borderColor: fit.roomOk ? `${T.moss}2a` : `${color.watch}33` }}>
              <span className="dz-verdict-ic" style={{ background: fit.roomOk ? `${T.moss}22` : `${color.watch}22`, color: fit.roomOk ? T.moss : color.watch }}>
                {fit.roomOk
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></svg>
                  : fit.canMove
                    ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M5 9l-3 3 3 3M2 12h13M19 5l3 3-3 3M22 8H9" /></svg>
                    : !fit.lightOk
                      ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                      : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /></svg>}
              </span>
              <span className="dz-verdict-body">
                <span className="dz-verdict-title">{fit.roomOk ? `${plant.room} is a great spot` : fit.canMove ? `A better spot for ${plant.nickname.split(" ")[0]}` : `${plant.room} is a little off`}</span>
                <span className="dz-verdict-sub">{fit.roomOk
                  ? `Its light and humidity both suit a ${s.common} here.`
                  : fit.canMove
                    ? `The ${fit.best.room} has ${lightWord(ROOM_ENV[fit.best.room].light).toLowerCase()} light — a closer match than ${plant.room}.`
                    : `${!fit.lightOk ? "Light" : "Humidity"} is off, but ${plant.room} is still the best room you have for a ${s.common}.`}</span>
              </span>
              {fit.canMove && (
                <button className="dz-verdict-cta" onClick={() => setMoveOpen(true)}>Move</button>
              )}
            </div>
            {/* UNIFIED condition rows — reading + slider together */}
            <div className="cg-cond">
              {matches.map((m) => {
                const condIcon = m.label === "Light"
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                  : m.label === "Humidity"
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /></svg>
                  : <svg width="15" height="15" viewBox="0 0 100 100" fill="currentColor" stroke="currentColor" strokeWidth="2.5"><path fillRule="evenodd" clipRule="evenodd" d="m58.289 82.125-2.9023 7.75c-0.76562 2.043-2.3906 3.6445-4.4453 4.3828-2.0547 0.73438-4.3281 0.53125-6.2188-0.55859l-35.934-20.746c-1.8906-1.0898-3.2031-2.957-3.5938-5.1055-0.39062-2.1484 0.1875-4.3555 1.5742-6.0391l7.1719-8.7109-4.9219-6.2578c-2.668-3.3906-3-8.0586-0.84375-11.797l12.453-21.566c4.6406-8.0352 14.91-10.789 22.945-6.1484 3.8594 2.2266 6.6719 5.8945 7.8281 10.199 1.1523 4.3047 0.54688 8.8906-1.6797 12.746l-0.97656 1.6914 24.695 14.258c1.3086 0.75391 1.7539 2.4297 1 3.7344l-1.5625 2.707c-0.75391 1.3086-2.4258 1.7578-3.7344 1l-0.15625-0.089843-4.8672 12.992 14.562-2.0156 4.9609-4.3984c0.30469-0.26953 0.72656-0.36328 1.1133-0.24609 0.39063 0.11719 0.69141 0.42969 0.79688 0.82031l3.2344 12.074c0.10547 0.39062 0 0.8125-0.28125 1.1055-0.27734 0.29688-0.69141 0.42578-1.0859 0.34375l-6.5-1.3281zm-24.828-49.055-24.883 30.227c-0.94922 1.1523-1.3438 2.6641-1.0781 4.1328s1.1641 2.7461 2.457 3.4922l35.934 20.746c1.293 0.74609 2.8477 0.88672 4.2539 0.38281 1.4062-0.50391 2.5156-1.6016 3.0391-3l13.734-36.664-33.461-19.32zm11.453 20.711s0.51563 5.3594 0.17188 9.7109c-0.16016 2.0312-0.53516 3.8555-1.1602 4.9375-2.0469 3.5469-6.5898 4.7656-10.141 2.7188-3.5469-2.0469-4.7656-6.5898-2.7148-10.141 0.625-1.0859 2.0156-2.3203 3.6953-3.4766 3.5977-2.4766 8.4961-4.707 8.4961-4.707 0.34375-0.15625 0.74219-0.13672 1.0703 0.054687 0.32812 0.1875 0.54297 0.52344 0.58203 0.90234zm-2.2031 1.9062c-1.668 0.82422-4.3984 2.25-6.6172 3.7734-1.3398 0.92187-2.4961 1.8516-2.9961 2.7148-1.4023 2.4297-0.57031 5.5352 1.8594 6.9375 2.4297 1.4023 5.5352 0.57031 6.9375-1.8594 0.5-0.86328 0.72656-2.332 0.85547-3.9531 0.21094-2.6797 0.082031-5.7617-0.039062-7.6172zm-10.289-25.926 37.891 21.875c0.1875 0.10938 0.42578 0.042969 0.53125-0.14062l1.5625-2.707c0.10938-0.1875 0.042969-0.42578-0.14062-0.53516l-37.891-21.875c-0.1875-0.10938-0.42578-0.042968-0.53516 0.14453l-1.5625 2.707c-0.10938 0.1875-0.042969 0.42578 0.14453 0.53125zm-12.301 15.828 11.285-13.707-0.15625-0.089843c-1.3086-0.75391-1.7578-2.4258-1-3.7344l1.5625-2.707c0.75781-1.3086 2.4297-1.7578 3.7344-1l5.75 3.3203 0.97656-1.6914c1.0859-1.8828 1.3828-4.125 0.82031-6.2266-0.5625-2.1016-1.9375-3.8945-3.8203-4.9805-1.8828-1.0859-4.125-1.3828-6.2266-0.82031s-3.8945 1.9375-4.9805 3.8203l-11.594 20.078c-0.75781 1.3086-0.58984 2.957 0.41406 4.0898l3.2344 3.6445zm26.59-14.793 0.97656-1.6914c1.9141-3.3203 2.4375-7.2656 1.4453-10.969-0.99219-3.7031-3.4141-6.8594-6.7344-8.7773-6.9141-3.9922-15.754-1.625-19.742 5.2891l-12.453 21.566c-1.6758 2.9062-1.4141 6.5391 0.65625 9.1758l4.6055 5.8516 3.1484-3.8242-3.4766-3.9219c-1.6719-1.8867-1.9531-4.6328-0.69141-6.8164l11.594-20.078c1.3984-2.4219 3.7031-4.1914 6.4062-4.9141 2.7031-0.72656 5.582-0.34375 8.0039 1.0547 2.4219 1.3984 4.1914 3.7031 4.9141 6.4062 0.72266 2.7031 0.34375 5.5781-1.0547 8.0039l-0.97656 1.6914 3.3828 1.9531zm16.469 38.266-3.7734 10.078 20.004-8.1328-1.082-4.0391-15.145 2.0938zm18.574 1.6406 4.2812 0.875-2.2539-8.4102-3.2656 2.8984 1.2422 4.6406zm9.7266 9.2852 0.003906 0.007813c1.4688 2.6914 3.4375 6.8398 3.4375 9.0664 0 3.2344-2.625 5.8594-5.8594 5.8594s-5.8594-2.625-5.8594-5.8594c0-2.2266 1.9688-6.375 3.4258-9.0469 0.45703-0.92188 1.3984-1.5078 2.4336-1.5078 1.0234 0 1.957 0.57422 2.418 1.4805zm-2.082 1.0703c-0.0625-0.12891-0.19141-0.20703-0.33594-0.20703-0.14062 0-0.27344 0.078126-0.33594 0.20703l-0.023437 0.046875c-1.2969 2.3711-3.1562 5.9922-3.1562 7.9609 0 1.9414 1.5742 3.5156 3.5156 3.5156s3.5156-1.5742 3.5156-3.5156c0-1.9688-1.8633-5.5859-3.1562-7.9609z"/></svg>;
                return (
                <div key={m.label} className="cg-merge">
                  <div className="cg-merge-head">
                    <span className="cg-cond-ic" style={{ background: m.ok ? `${T.moss}18` : `${color.watch}18`, color: m.ok ? T.moss : color.watch }}>{condIcon}</span>
                    <div className="cg-cond-body"><div className="cg-cond-label">{m.label}</div><div className="cg-cond-have">{m.haveTxt}</div></div>
                    <span className="cg-cond-flag" style={{ color: m.ok ? T.moss : color.watch }}>{m.ok ? "Good" : "Off"}</span>
                  </div>
                  {m.label !== "Watering" && (
                    <div className="cg-merge-track">
                      <div className="dt-match-track"><div className="dt-match-fill" style={{ width: `${Math.min(100, m.have)}%`, background: m.ok ? `${T.moss}22` : `${color.watch}18` }} /><div className="dt-match-need" style={{ left: `${Math.min(96, m.need)}%` }} /><div className="dt-match-have" style={{ left: `${Math.min(96, m.have)}%`, background: m.ok ? T.moss : color.watch }} /></div>
                      <div className="cg-match-legend">
                        <span className="cg-match-key"><i className="cg-key-have" style={{ background: m.ok ? T.moss : color.watch }} />Your {plant.room.toLowerCase()}</span>
                        <span className="cg-match-key"><i className="cg-key-need" />Ideal</span>
                      </div>
                    </div>
                  )}
                  <div className="cg-detail-note"><b>Needs:</b> {m.needTxt}</div>
                </div>
                );
              })}
            </div>
            <div className="cg-know"><div className="cg-know-lbl">Good to know</div><div className="cg-know-txt">{s.care}</div></div>
          </div>
        </div>
      )}
      {/* move picker — the exact drag sheet from the Rooms page, rendered above the care sheet */}
      {sheet === "care" && moveOpen && (() => {
              const best = fit.best;
              const misfit = fit.canMove;
              return (
              <>
                <div className="rx-move-scrim" onClick={() => setMoveOpen(false)} />
                <div className="rx-move-sheet" ref={moveDrag.ref} onTouchStart={moveDrag.onTouchStart} onTouchMove={moveDrag.onTouchMove} onTouchEnd={moveDrag.onTouchEnd} onMouseDown={moveDrag.onMouseDown}>
                  <div className="dz-sheet-grip" />
                  <div className="rx-move-head">
                    <div className="rx-move-photo"><PlantPhoto speciesKey={plant.speciesKey} health={plant.health} size={44} round /></div>
                    <div><div className="rx-move-title">Move {plant.nickname}</div><div className="rx-move-sub">Currently in {plant.room}</div></div>
                  </div>
                  {misfit ? (
                    <div className="rx-move-tip">
                      <span className="rx-move-tip-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="1.8"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.2 1 2.5h6c0-1.3.3-1.8 1-2.5A6 6 0 0012 3Z" /></svg></span>
                      <span className="rx-move-tip-txt"><b>{plant.nickname}</b> would be happier in the <b>{best.room}</b> — {lightWord(ROOM_ENV[best.room].light).toLowerCase()} light suits a {s.common} better than {plant.room}.</span>
                    </div>
                  ) : (
                    <div className="rx-move-tip ok">
                      <span className="rx-move-tip-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg></span>
                      <span className="rx-move-tip-txt"><b>{plant.nickname}</b> is already well-placed in {plant.room}. You can still move it below.</span>
                    </div>
                  )}
                  <div className="rx-move-list">
                    {ROOMS.map((r) => {
                      const fit = placementFit(plant.speciesKey, r);
                      const isCurrent = r === plant.room;
                      const isBest = misfit && r === best.room;
                      const rank = fit >= 80 ? "Great" : fit >= 60 ? "Good" : fit >= 40 ? "Okay" : "Poor";
                      const rc = fit >= 60 ? T.moss : fit >= 40 ? color.watch : T.clay;
                      return (
                        <button key={r} className={`rx-move-room${isCurrent ? " current" : ""}${isBest ? " best" : ""}`} onClick={() => { if (!isCurrent) { onMovePlant(plant.id, r); setMoveOpen(false); } }} disabled={isCurrent}>
                          <div className="rx-move-room-l">
                            <div className="rx-move-room-name">{r}{isCurrent && <span className="rx-move-here"> · here now</span>}{isBest && <span className="rx-move-besttag">Best fit</span>}</div>
                            <div className="rx-move-room-env">{lightWord(ROOM_ENV[r].light)} light · {roomHumidity(r, WEATHER_NOW).pct}% humidity</div>
                          </div>
                          <div className="rx-move-fit" style={{ color: rc }}>{rank}<span className="rx-move-fit-bar"><span style={{ width: `${fit}%`, background: rc }} /></span></div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
              );
            })()}

      {/* ---------- JOURNAL ---------- */}
      {sheet === "journal" && (
        <div className="dz-sheet" ref={sheetDrag.ref} onTouchStart={sheetDrag.onTouchStart} onTouchMove={sheetDrag.onTouchMove} onTouchEnd={sheetDrag.onTouchEnd} onMouseDown={sheetDrag.onMouseDown}>
          <div className="dz-sheet-grip" />
          <div className="dz-sheet-scroll dz-sheet-scroll-pinned">
            <div className="dz-sheet-title">Journal</div>
            {/* THEN vs NOW — the visual progress payoff */}
            {plant.journal.length >= 2 && (() => {
              const oldest = plant.journal[plant.journal.length - 1];
              const newest = plant.journal[0];
              const delta = newest.health - oldest.health;
              return (
                <div className="jn-compare">
                  <div className="jn-compare-side">
                    <div className="jn-compare-photo"><PlantPhoto speciesKey={plant.speciesKey} health={oldest.health} size={72} round={false} /></div>
                    <div className="jn-compare-when">{oldest.when}</div>
                    <div className="jn-compare-h" style={{ color: healthColor(oldest.health) }}>{oldest.health}</div>
                  </div>
                  <div className="jn-compare-mid">
                    <div className="jn-compare-delta" style={{ color: delta >= 0 ? T.moss : T.clay }}>{delta >= 0 ? `+${delta}` : delta}</div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.inkFaint} strokeWidth="1.8"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </div>
                  <div className="jn-compare-side">
                    <div className="jn-compare-photo now" style={{ boxShadow: `0 0 0 2px ${color}` }}><PlantPhoto speciesKey={plant.speciesKey} health={newest.health} size={72} round={false} /></div>
                    <div className="jn-compare-when">Now</div>
                    <div className="jn-compare-h" style={{ color: healthColor(newest.health) }}>{newest.health}</div>
                  </div>
                </div>
              );
            })()}
            {/* TIER 2 — trend digest + latest */}
            <div className="jn-trend">
              <div className="jn-trend-left">
                <div className="jn-trend-txt" style={{ color: jChange >= 0 ? T.moss : T.clay }}>{jTrendTxt}</div>
                <div className="jn-trend-sub">over {plant.journal.length} check-ins</div>
              </div>
              <div className="jn-trend-num" style={{ color }}>{plant.health}</div>
            </div>
            {plant.journal[0] && (
              <div className="jn-latest">
                <div className="jn-latest-lbl">Latest</div>
                <div className="jn-card">
                  <div className="jn-photo"><PlantPhoto speciesKey={plant.speciesKey} health={plant.journal[0].health} size={46} round={false} /></div>
                  <div className="jn-body"><div className="jn-note">{plant.journal[0].note}</div><div className="jn-when">{plant.journal[0].when}</div></div>
                  <div className="jn-health" style={{ color: healthColor(plant.journal[0].health) }}>{plant.journal[0].health}</div>
                </div>
              </div>
            )}
            {/* TIER 3 — chart + full history */}
            {!full ? (
              <button className="dz-more" onClick={() => setFull(true)}>See chart &amp; full history<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg></button>
            ) : (
              <div className="dz-full">
                {plant.journal.length >= 2 && (
                  <div className="jn-chart"><div className="jn-chart-head"><span className="jn-chart-lbl">Health over time</span><span className="jn-chart-now" style={{ color }}>{plant.health}<span className="jn-chart-now-u"> now</span></span></div><HealthChart journal={plant.journal} color={color} /></div>
                )}
                <div className="jn-tl-lbl">All check-ins</div>
                <div className="jn-timeline">
                  {plant.journal.map((j, i) => (
                    <div key={j.id} className="jn-row">
                      <div className="jn-marker"><div className="jn-dot" style={{ background: healthColor(j.health) }} />{i < plant.journal.length - 1 && <div className="jn-line" />}</div>
                      <div className="jn-card"><div className="jn-photo"><PlantPhoto speciesKey={plant.speciesKey} health={j.health} size={46} round={false} /></div><div className="jn-body"><div className="jn-note">{j.note}</div><div className="jn-when">{j.when}</div></div><div className="jn-health" style={{ color: healthColor(j.health) }}>{j.health}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="dz-sheet-cta">
            <button className="dz-cta-btn" onClick={() => onAddJournal(plant.id)}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="1.8"><rect x="3" y="6" width="18" height="14" rx="2.5" /><circle cx="12" cy="13" r="3.5" /><path d="M9 6l1-2h4l1 2" /></svg>Add a progress photo</button>
          </div>
        </div>
      )}

      {sheet === "remove" && (
        <div className="dz-sheet dz-sheet-confirm" ref={sheetDrag.ref} onTouchStart={sheetDrag.onTouchStart} onTouchMove={sheetDrag.onTouchMove} onTouchEnd={sheetDrag.onTouchEnd} onMouseDown={sheetDrag.onMouseDown} role="dialog" aria-modal="true" aria-label={`Remove ${plant.nickname}`}>
          <div className="dz-sheet-grip" />
          <div className="dz-confirm-body">
            <div className="dz-confirm-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.clay} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" /></svg></div>
            <div className="dz-sheet-title">Remove {plant.nickname}?</div>
            <div className="dz-sheet-sub">This takes {plant.nickname.split(" ")[0]} out of your garden, along with its check-in history. You can always scan it again later.</div>
            <button className="dz-confirm-keep" onClick={() => setSheet(null)}>Keep {plant.nickname.split(" ")[0]}</button>
            <button className="dz-confirm-remove" onClick={() => onRemovePlant(plant.id)}>Remove from garden</button>
          </div>
        </div>
      )}
    </div>
  );
}
function nextActionShort(p) {
  if (p.health < 45) return "Needs care";
  if (parseInt(p.lastWatered) >= 5) return "Water soon";
  if (p.status === "watch") return "Keep an eye";
  return "Thriving";
}

/* Shared plant identity block — name + botanical + room — used by the deck cards
   and the list rows so the two stay in sync. `dark` themes it for the dark deck
   cards; `lead` is an inline element before the name (the deck's status dot);
   `badge` sits after the name (the favorite pin); `roomInset` aligns the room
   under the name when a lead is present. */
function PlantLabel({ plant, dark = false, lead = null, badge = null, roomInset = 0 }) {
  const s = SPECIES[plant.speciesKey];
  return (
    <div className={`pl-id${dark ? " dark" : ""}`}>
      <div className="pl-id-top">
        {lead}
        <span className="pl-id-name">{plant.nickname}</span>
        {badge}
        <span className="pl-id-species">{s.common}</span>
      </div>
      <span className="pl-id-room" style={roomInset ? { marginLeft: roomInset } : undefined}>{plant.room}</span>
    </div>
  );
}

function PlantDeck({ plants, onOpenPlant, favorites = {} }) {
  // lowest (last) card starts open
  const [expanded, setExpanded] = useState(plants.length ? plants.length - 1 : null);
  useEffect(() => { setExpanded(plants.length ? plants.length - 1 : null); }, [plants.length]);

  // moss-family tints cycle across the header strips (keeps Verdure's palette)
  const tints = [T.moss, palette.moss750, palette.moss600, T.mossBright, palette.moss800, palette.moss550];
  const HEADER = 108;    // stacked collapsed card height — overlap (HEADER-STEP=34) exceeds corner radius so cards flow together
  const HEADER_LAST = 80; // the bottom collapsed card hugs its header with balanced padding (~24px below the room line)
  const STEP = 72;      // vertical advance per collapsed card — less than HEADER, so cards overlap (room line sits ~16px above the next card)
  const EXPANDED = 420; // expanded card height

  // compute each card's vertical offset; collapsed cards overlap by (HEADER - STEP)
  let y = 0;
  const layout = plants.map((p, i) => {
    const top = y;
    const isExp = expanded === i;
    const isLast = i === plants.length - 1;
    const collapsedH = isLast ? HEADER_LAST : HEADER;
    y += isExp ? EXPANDED + 14 : STEP;
    return { top, isExp, collapsedH };
  });
  // the last card still needs its full height beyond its top offset
  const lastExp = expanded === plants.length - 1;
  const stageHeight = (layout.length ? layout[layout.length - 1].top : 0) + (lastExp ? EXPANDED : HEADER_LAST) + 14;

  return (
    <div className="wal-wrap">
      <div className="wal-stage" style={{ height: stageHeight }}>
        {plants.map((p, i) => {
          const { top, isExp, collapsedH } = layout[i];
          const color = healthColor(p.health);
          const light = healthColorLight(p.health);
          const tint = tints[i % tints.length];
          const action = nextActionShort(p);
          return (
            <div key={p.id} className={`wal-card${isExp ? " exp" : ""}`}
              style={{ top, height: isExp ? EXPANDED : collapsedH, zIndex: isExp ? 50 : i + 1, background: isExp ? palette.black600 : tint }}
              onClick={() => { if (isExp) onOpenPlant(p.id); else setExpanded(i); }}>

              {/* header strip — always visible */}
              <div className="wal-head">
                <div className="wal-head-left">
                  <PlantLabel plant={p} dark roomInset={17}
                    lead={<span className="wal-dot" style={{ background: isExp ? color : (p.status === "thriving" ? palette.white : color), boxShadow: !isExp && p.status !== "thriving" ? `0 0 0 3px ${color}44` : "none" }} />}
                    badge={favorites[p.id] ? <svg className="wal-pin" width="12" height="12" viewBox="0 0 24 24" fill={isExp ? palette.white : color} stroke="none"><path d="M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 11-8 11Z" /></svg> : null}
                  />
                </div>
                <div className="wal-head-right">
                  {!isExp && (
                    <span className={`wal-action${p.status !== "thriving" ? " attn" : ""}`} style={p.status !== "thriving" ? { background: color } : undefined}>
                      <span className="wal-action-health">{p.health}</span>
                      <span className="wal-action-sep">·</span>
                      <span className="wal-action-txt">{action}</span>
                    </span>
                  )}
                  {isExp && (
                    <button className="wal-collapse" onClick={(e) => { e.stopPropagation(); setExpanded(null); }} aria-label="Collapse">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="2"><path d="M18 15l-6-6-6 6" /></svg>
                    </button>
                  )}
                </div>
              </div>

              {/* expanded body — full photo card */}
              {isExp && (
                <div className="wal-body">
                  <div className="wal-photo"><PlantPhoto speciesKey={p.speciesKey} health={p.health} size={470} round={false} imgW={800} /></div>
                  <div className="wal-heart">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill={p.status === "thriving" ? color : "none"} stroke={color} strokeWidth="2"><path d="M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 11-8 11Z" /></svg>
                  </div>
                  <div className="wal-info">
                    <div className="wal-meta-row">
                      <span className="wal-status" style={{ background: `${light}1e`, color: light }}>{statusLabel(p.status)}</span>
                    </div>
                    <div className="wal-vitals">
                      <div className="wal-vital"><div className="wal-vital-num" style={{ color: light }}>{p.health}</div><div className="wal-vital-lbl">Health</div></div>
                      <div className="wal-vital-sep" />
                      <div className="wal-vital"><div className="wal-vital-num">{SPECIES[p.speciesKey].light < 40 ? "Low" : SPECIES[p.speciesKey].light < 70 ? "Bright" : "Direct"}</div><div className="wal-vital-lbl">Light</div></div>
                      <div className="wal-vital-sep" />
                      <div className="wal-vital"><div className="wal-vital-num">{p.lastWatered.split(" ")[0]}d</div><div className="wal-vital-lbl">Watered</div></div>
                    </div>
                    <div className="wal-open">Tap to open full record<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="wal-hint">{expanded === null ? "Tap a card to open" : "Tap the open card for its full details"}</div>
    </div>
  );
}

function AllPlantsScreen({ plants, onBack, onOpenPlant, favorites = {} }) {
  const [view, setView] = useState("deck"); // deck | list
  const [sort, setSort] = useState("attention");
  const [query, setQuery] = useState("");
  const sorted = useMemo(() => {
    const list = [...plants];
    if (sort === "attention") list.sort((a, b) => a.health - b.health);
    else if (sort === "name") list.sort((a, b) => a.nickname.localeCompare(b.nickname));
    else if (sort === "room") list.sort((a, b) => a.room.localeCompare(b.room) || a.nickname.localeCompare(b.nickname));
    return list;
  }, [plants, sort, favorites]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => !q ? sorted : sorted.filter((p) =>
    p.nickname.toLowerCase().includes(q) ||
    (SPECIES[p.speciesKey].common || "").toLowerCase().includes(q) ||
    p.room.toLowerCase().includes(q)), [sorted, q]);
  const SORTS = [["attention", "Needs attention"], ["name", "Name"], ["room", "Room"]];
  return (
    <div className="v-screen light">
      <StatusBar light={true} />
      <div className="dt-scroll">
        <div className="dt-topnav" style={{ justifyContent: "space-between" }}>
          <button className="dt-icon" onClick={onBack} aria-label="Back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg></button>
          <div className=" vtoggle">
            <button className={`vtoggle-btn${view === "deck" ? " active" : ""}`} onClick={() => setView("deck")} aria-label="Deck view">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="3" width="14" height="16" rx="2.5" /><path d="M8 21h8" opacity="0.5" /></svg>
            </button>
            <button className={`vtoggle-btn${view === "list" ? " active" : ""}`} onClick={() => setView("list")} aria-label="List view">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
            </button>
          </div>
        </div>
        <div className="rm-head"><h1 className="rm-title">All plants</h1><div className="rm-sub">{plants.length} in your care.</div></div>

        <div className="ap-search">
          <svg className="ap-search-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkFaint} strokeWidth="1.9"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input className="ap-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search plants, species, rooms" aria-label="Search plants" />
          {query && <button className="ap-search-clear" onClick={() => setQuery("")} aria-label="Clear search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.inkFaint} strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
        </div>

        <div className="ap-sorts">
          {SORTS.map(([id, label]) => (
            <button key={id} className={`ap-sort${sort === id ? " active" : ""}`} onClick={() => setSort(id)}>{label}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="nx-empty">
            <div className="nx-empty-ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg></div>
            <div className="nx-empty-title">No matches</div>
            <div className="nx-empty-sub">Nothing matches “{query}”. Try a plant name, species, or room.</div>
          </div>
        ) : view === "deck" ? (
          <PlantDeck plants={filtered} onOpenPlant={onOpenPlant} favorites={favorites} />
        ) : (
          <>
            <div className="apl-list">
              {filtered.map((p) => {
                const color = healthColor(p.health);
                const needs = p.health < 45;
                const daysWater = parseInt(p.lastWatered) || 0;
                const action = nextActionShort(p);
                return (
                  <button key={p.id} className={`apl-row${needs ? " attn" : ""}`} onClick={() => onOpenPlant(p.id)}>
                    <div className="apl-photo" style={{ boxShadow: `0 0 0 2px ${color}` }}>
                      <PlantPhoto speciesKey={p.speciesKey} health={p.health} size={50} round />
                    </div>
                    <div className="apl-body">
                      <PlantLabel plant={p} />
                    </div>
                    <div className="apl-side">
                      <span className={`apl-pill${p.status !== "thriving" ? " attn" : ""}`} style={p.status !== "thriving" ? { background: color } : undefined}>
                        <span className="apl-pill-health">{p.health}</span>
                        <span className="apl-pill-sep">·</span>
                        <span className="apl-pill-txt">{action}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div style={{ height: 30 }} />
      </div>
    </div>
  );
}

/* ============================ ROOMS ============================ */
function RoomsScreen({ plants, onBack, onOpenPlant, onMovePlant }) {
  const [overrides, setOverrides] = useState({}); // room -> manual %
  const [editRoom, setEditRoom] = useState(null);
  const [movePicker, setMovePicker] = useState(null); // plant being moved
  const moveDrag = useSheetDrag(() => setMovePicker(null));
  const weather = WEATHER_NOW;

  const rooms = useMemo(() => {
    const map = {};
    plants.forEach((p) => { (map[p.room] = map[p.room] || []).push(p); });
    return ROOMS.map((r) => {
      const items = map[r] || [];
      const env = ROOM_ENV[r];
      const avg = items.length ? Math.round(items.reduce((s, p) => s + p.health, 0) / items.length) : null;
      const misfits = items.filter((p) => roomFit(p, weather, overrides).canMove);
      const hum = roomHumidity(r, weather, overrides);
      return { room: r, items, env, avg, misfits, hum };
    }).filter((g) => g.items.length > 0);
  }, [plants, overrides]);

  const moves = useMemo(() => {
    const out = [];
    plants.forEach((p) => { const b = roomFit(p, weather, overrides); if (b.canMove) out.push({ plant: p, to: b.best.room, fit: 0 }); });
    return out;
  }, [plants, overrides]);

  function setManual(room, pct) { setOverrides((o) => ({ ...o, [room]: pct })); setEditRoom(null); }
  function clearManual(room) { setOverrides((o) => { const n = { ...o }; delete n[room]; return n; }); setEditRoom(null); }
  function doMove(room) { if (movePicker) { onMovePlant(movePicker.id, room); setMovePicker(null); } }

  return (
    <div className="v-screen light">
      <StatusBar light={true} />
      <div className="dt-scroll">
        <div className="rm-head"><h1 className="rm-title">Rooms</h1><div className="rm-sub">How each space suits the plants living in it.</div></div>

        {/* GARDEN OVERVIEW — the health of your growing spaces at a glance */}
        {(() => {
          const all = plants;
          const nn = all.length;
          const avg = Math.round(all.reduce((s, p) => s + p.health, 0) / Math.max(1, nn));
          const thr = all.filter((p) => p.health >= 70).length;
          const need = all.filter((p) => p.health < 45).length;
          const wat = nn - thr - need;
          const gc = healthColor(avg);
          return (
            <>
              <div className="rm-overview">
                <div className="rm-ov-hero">
                  <div className="rm-ov-ring">
                    <svg width="76" height="76" viewBox="0 0 76 76">
                      <circle cx="38" cy="38" r="31" fill="none" stroke={T.line} strokeWidth="4" />
                      <circle cx="38" cy="38" r="31" fill="none" stroke={gc} strokeWidth="4" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 31} strokeDashoffset={2 * Math.PI * 31 * (1 - avg / 100)}
                        transform="rotate(-90 38 38)" style={{ transition: "stroke-dashoffset 1s ease" }} />
                    </svg>
                    <div className="rm-ov-ring-num" style={{ color: gc }}>{avg}</div>
                  </div>
                  <div className="rm-ov-hero-body">
                    <div className="rm-ov-hero-lbl">Garden health</div>
                    <div className="rm-ov-hero-stats">
                      <span><b>{nn}</b> plants</span>
                      <span className="rm-ov-hero-dot" />
                      <span><b>{rooms.length}</b> rooms</span>
                      <span className="rm-ov-hero-dot" />
                      <span className="rm-ov-hero-weather"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.inkFaint} strokeWidth="1.8"><path d="M6.5 18A4.5 4.5 0 0 1 6 9.05 6 6 0 0 1 17.7 8 4.5 4.5 0 0 1 17 18H6.5Z" /></svg>{weather.humidity}%</span>
                    </div>
                  </div>
                </div>
                <div className="rm-ov-bar">
                  {thr > 0 && <div style={{ flex: thr, background: T.moss }} />}
                  {wat > 0 && <div style={{ flex: wat, background: palette.amber500 }} />}
                  {need > 0 && <div style={{ flex: need, background: T.clay }} />}
                </div>
                <div className="rm-ov-legend">
                  <span><i style={{ background: T.moss }} />{thr} thriving</span>
                  {wat > 0 && <span><i style={{ background: palette.amber500 }} />{wat} watching</span>}
                  {need > 0 && <span><i style={{ background: T.clay }} />{need} need care</span>}
                </div>
              </div>
            </>
          );
        })()}

        {rooms.map((g) => {
          const climate = g.avg == null ? T.inkFaint : healthColor(g.avg);
          const editing = editRoom === g.room;
          return (
            <div key={g.room} className="rx-room">
              <div className="rx-room-top">
                <div className="rx-room-id">
                  <div className="rx-room-name">{g.room}</div>
                  <div className="rx-room-note">{g.env.note}</div>
                </div>
                <div className="rx-room-climate" style={{ color: climate }}>
                  <div className="rx-room-avg">{g.avg}</div>
                  <div className="rx-room-avg-lbl">avg health</div>
                </div>
              </div>

              <div className="rx-env">
                <div className="rx-env-item"><span className="rx-env-ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="1.8"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg></span>{lightWord(g.env.light)} light</div>
                <button className="rx-env-item rx-env-hum" onClick={() => setEditRoom(editing ? null : g.room)}>
                  <span className="rx-env-ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="1.8"><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /></svg></span>
                  {g.hum.pct}% humidity
                  <span className="rx-env-src">{g.hum.source === "manual" ? "yours" : "est."}</span>
                  <svg className="rx-env-caret" style={{ transform: editing ? "rotate(180deg)" : "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.inkFaint} strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </button>
              </div>

              <div className={`rx-hum-reveal${editing ? " open" : ""}`}>
                <div className="rx-hum-reveal-inner">
                  <div className="rx-hum-edit">
                    <div className="rx-hum-edit-lbl">Set {g.room} humidity</div>
                    <div className="rx-hum-chips">
                      {[["Dry", 30], ["Average", 42], ["Humid", 58], ["Very humid", 68]].map(([lbl, val]) => (
                        <button key={lbl} className={`rx-hum-chip${overrides[g.room] === val ? " on" : ""}`} onClick={() => setManual(g.room, val)}>{lbl}<span className="rx-hum-chip-v">{val}%</span></button>
                      ))}
                    </div>
                    {overrides[g.room] != null && <button className="rx-hum-reset" onClick={() => clearManual(g.room)}>Back to weather estimate</button>}
                  </div>
                </div>
              </div>

              {/* plants — a clean row; only misfits carry an action */}
              <div className="rx-plants">
                {g.items.map((p) => {
                  const rf = roomFit(p, weather, overrides);
                  const misfit = rf.canMove;
                  return (
                    <div key={p.id} className="rx-plant">
                      <button className="rx-plant-tap" onClick={() => onOpenPlant(p.id)}>
                        <div className="rx-plant-photo" style={{ boxShadow: `0 0 0 2px ${misfit ? color.watch : healthColor(p.health)}` }}>
                          <PlantPhoto speciesKey={p.speciesKey} health={p.health} size={46} round />
                        </div>
                        <div className="rx-plant-name">{p.nickname}</div>
                      </button>
                      {rf.canMove
                        ? <button className="rx-plant-move" onClick={() => setMovePicker(p)}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color.watch} strokeWidth="2.4"><path d="M5 9l-3 3 3 3M2 12h13M19 5l3 3-3 3M22 8H9" /></svg>Move</button>
                        : rf.roomOk
                          ? <div className="rx-plant-ok"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="2"><path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></svg><span>Happy here</span></div>
                          : <div className="rx-plant-ok best"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color.watch} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21c4.5-5 7-8.2 7-11.5A7 7 0 1 0 5 9.5C5 12.8 7.5 16 12 21Z" /><circle cx="12" cy="9.5" r="2.3" /></svg><span>Best spot</span></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div style={{ height: 40 }} />
      </div>

      {/* MOVE PICKER — actually reassigns the room */}
      {movePicker && (() => {
        const rf = roomFit(movePicker, weather, overrides);
        const best = rf.best;
        const misfit = rf.canMove;
        return (
        <>
          <div className="rx-move-scrim" onClick={() => setMovePicker(null)} />
          <div className="rx-move-sheet" ref={moveDrag.ref} onTouchStart={moveDrag.onTouchStart} onTouchMove={moveDrag.onTouchMove} onTouchEnd={moveDrag.onTouchEnd} onMouseDown={moveDrag.onMouseDown}>
            <div className="dz-sheet-grip" />
            <div className="rx-move-head">
              <div className="rx-move-photo"><PlantPhoto speciesKey={movePicker.speciesKey} health={movePicker.health} size={44} round /></div>
              <div><div className="rx-move-title">Move {movePicker.nickname}</div><div className="rx-move-sub">Currently in {movePicker.room}</div></div>
            </div>

            {/* placement reasoning — the tip, now in context */}
            {misfit ? (
              <div className="rx-move-tip">
                <span className="rx-move-tip-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="1.8"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.2 1 2.5h6c0-1.3.3-1.8 1-2.5A6 6 0 0012 3Z" /></svg></span>
                <span className="rx-move-tip-txt"><b>{movePicker.nickname}</b> would be happier in the <b>{best.room}</b> — {lightWord(ROOM_ENV[best.room].light).toLowerCase()} light suits a {SPECIES[movePicker.speciesKey].common} better than {movePicker.room}.</span>
              </div>
            ) : (
              <div className="rx-move-tip ok">
                <span className="rx-move-tip-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg></span>
                <span className="rx-move-tip-txt"><b>{movePicker.nickname}</b> is already well-placed in {movePicker.room}. You can still move it below.</span>
              </div>
            )}

            <div className="rx-move-list">
              {ROOMS.map((r) => {
                const fit = placementFit(movePicker.speciesKey, r, weather, overrides);
                const isCurrent = r === movePicker.room;
                const isBest = misfit && r === best.room;
                const rank = fit >= 80 ? "Great" : fit >= 60 ? "Good" : fit >= 40 ? "Okay" : "Poor";
                const rc = fit >= 60 ? T.moss : fit >= 40 ? color.watch : T.clay;
                return (
                  <button key={r} className={`rx-move-room${isCurrent ? " current" : ""}${isBest ? " best" : ""}`} onClick={() => !isCurrent && doMove(r)} disabled={isCurrent}>
                    <div className="rx-move-room-l">
                      <div className="rx-move-room-name">{r}{isCurrent && <span className="rx-move-here"> · here now</span>}{isBest && <span className="rx-move-besttag">Best fit</span>}</div>
                      <div className="rx-move-room-env">{lightWord(ROOM_ENV[r].light)} light · {roomHumidity(r, weather, overrides).pct}% humidity</div>
                    </div>
                    <div className="rx-move-fit" style={{ color: rc }}>{rank}<span className="rx-move-fit-bar"><span style={{ width: `${fit}%`, background: rc }} /></span></div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
        );
      })()}
    </div>
  );
}

function RemindersScreen({ plants, onBack, onOpenPlant, onWater }) {
  // Activity = a backward-looking DIARY of the garden: care you did, AI observations,
  // health changes, and milestones. Distinct from the Garden to-do (forward-looking).
  // Events are derived deterministically from plant state + journals.
  const EV = {
    water:   { color: T.mossBright, ic: <path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /> },
    overwater:{ color: palette.water600, ic: <><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /><path d="M4 3l16 18" strokeLinecap="round"/></> },
    dry:     { color: color.watch, ic: <><path d="M12 3v5" strokeLinecap="round" /><path d="M12 8C7 9 4 13 4 20 C11 20 16 16 16 10 C16 8.5 14 8 12 8Z" strokeLinejoin="round" /><path d="M12 9C10 12 8 16 5 19" strokeLinecap="round" /></> },
    light:   { color: color.watch, ic: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round"/></> },
    rise:    { color: T.moss, ic: <path d="M4 17l7-7 4 4 5-6" /> },
    drop:    { color: T.clay, ic: <path d="M4 7l7 7 4-4 5 6" /> },
    milestone:{ color: T.mossBright, ic: <path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /> },
    move:    { color: T.moss, ic: <path d="M5 9l-3 3 3 3M2 12h13M19 5l3 3-3 3M22 8H9" /> },
  };
  // map a plant's actual problem to the right symptom icon + phrasing
  function flagFor(p) {
    const sum = DIAGNOSIS[p.status].summary.toLowerCase();
    if (sum.includes("wet") || sum.includes("root rot") || sum.includes("suffocat")) return { type: "overwater", why: "Soil staying wet too long — ease off watering" };
    if (sum.includes("dry") || sum.includes("humid") || sum.includes("crisp") || sum.includes("brown")) return { type: "dry", why: "Air's too dry — leaf edges are crisping" };
    if (sum.includes("light") || sum.includes("sun") || sum.includes("pale")) return { type: "light", why: "Light levels look off for this plant" };
    return { type: "dry", why: DIAGNOSIS[p.status].summary.split("—")[0].trim() };
  }

  const events = [];
  plants.forEach((p, idx) => {
    const j = p.journal || [];
    // health change from journal (newest vs previous)
    if (j.length >= 2) {
      const d = j[0].health - j[1].health;
      if (d >= 3) events.push({ t: 2 + idx, plant: p, type: "rise", stamp: j[0].when, title: `${p.nickname} improved to ${j[0].health}`, why: `Up ${d} points since your last check-in` });
      else if (d <= -3) events.push({ t: 2 + idx, plant: p, type: "drop", stamp: j[0].when, title: `${p.nickname} dipped to ${j[0].health}`, why: `Down ${Math.abs(d)} points — worth a look` });
    }
    // symptom-specific flag for plants that need attention (no generic AI icon)
    if (p.health < 45) { const fl = flagFor(p); events.push({ t: 1 + idx * 0.1, plant: p, type: fl.type, stamp: "Today", title: `Verdure flagged ${p.nickname}`, why: fl.why }); }
    else if (p.health < 70) { const fl = flagFor(p); events.push({ t: 5 + idx, plant: p, type: fl.type, stamp: "This week", title: `Noticed something on ${p.nickname}`, why: fl.why }); }
    // care action history (watering)
    const wd = parseInt(p.lastWatered) || 0;
    events.push({ t: 10 + wd + idx, plant: p, type: "water", stamp: wd <= 2 ? "Yesterday" : wd <= 4 ? "3 days ago" : "Last week", title: `You watered ${p.nickname}`, why: `Logged from care history` });
    // placement/milestone flavor for a couple
    if (idx === 0) events.push({ t: 0, plant: p, type: "milestone", stamp: "Today", title: "Milestone: 12-day streak", why: "Twelve days of consistent care — keep it going" });
    if (idx === 3) events.push({ t: 8, plant: p, type: "move", stamp: "This week", title: `${p.nickname} settled into ${p.room}`, why: "Adjusting well to its new spot" });
  });
  events.sort((a, b) => a.t - b.t);

  // group by stamp bucket
  const bucket = (s) => (s === "Today" ? 0 : s === "Yesterday" ? 1 : s === "This week" || s.includes("day") ? 2 : 3);
  const groups = [
    { label: "Today", items: events.filter((e) => bucket(e.stamp) === 0) },
    { label: "This week", items: events.filter((e) => bucket(e.stamp) === 1 || bucket(e.stamp) === 2) },
    { label: "Earlier", items: events.filter((e) => bucket(e.stamp) === 3) },
  ].filter((g) => g.items.length > 0);

  const [expanded, setExpanded] = useState({});
  const toggle = (k) => setExpanded((o) => ({ ...o, [k]: !o[k] }));
  // families group "similar notifications" within a section
  const FAM = {
    attention: { types: ["overwater", "dry", "light"], color: color.watch, ic: <><path d="M10.3 4.3 2 18.5A2 2 0 0 0 3.7 21.5h16.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17h.01" strokeLinecap="round" /></>, title: (n) => `${n} plants need attention` },
    health: { types: ["rise", "drop"], color: T.moss, ic: <><path d="M20.4 13.3 12 21l-8.4-7.7A5 5 0 0 1 12 6.5a5 5 0 0 1 8.4 6.8Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.5 12.5h4l2-3.5 3 7 2-4.5h6" strokeLinecap="round" strokeLinejoin="round" /></>, title: (n) => `${n} health updates` },
    care: { types: ["water"], color: T.mossBright, ic: <path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" />, title: (n) => `You watered ${n} plants` },
    move: { types: ["move"], color: T.moss, ic: <path d="M5 9l-3 3 3 3M2 12h13M19 5l3 3-3 3M22 8H9" />, title: (n) => `${n} plants settled in` },
    milestone: { types: ["milestone"], color: T.mossBright, ic: <path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />, title: (n) => `${n} milestones` },
  };
  const FAM_ORDER = ["attention", "health", "care", "move", "milestone"];
  const familyOf = (type) => FAM_ORDER.find((f) => FAM[f].types.includes(type)) || "care";
  const groupByFamily = (items) => {
    const m = {};
    items.forEach((e) => { const f = familyOf(e.type); (m[f] = m[f] || []).push(e); });
    return FAM_ORDER.filter((f) => m[f]).map((f) => ({ family: f, items: m[f] }));
  };

  function Row({ e }) {
    const cfg = EV[e.type];
    return (
      <div className="ax-item" role="button" tabIndex={0} onClick={() => onOpenPlant(e.plant.id)}
        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpenPlant(e.plant.id); } }}>
        <div className="ax-item-ic" style={{ background: `${cfg.color}18`, color: cfg.color }}>
          <svg width={e.type === "dry" ? 17 : 16} height={e.type === "dry" ? 17 : 16} viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="1.8">{cfg.ic}</svg>
        </div>
        <div className="ax-item-body">
          <div className="ax-item-title">{e.title}</div>
          <div className="ax-item-why">{e.why}</div>
        </div>
        <div className="ax-item-stamp">{e.stamp}</div>
      </div>
    );
  }

  return (
    <div className="v-screen light">
      <StatusBar light={true} />
      <div className="dt-scroll">
        <div className="rm-head"><h1 className="rm-title">Activity</h1><div className="rm-sub">A diary of your garden — what you've done and what Verdure has noticed.</div></div>

        {groups.length === 0 ? (
          <div className="nx-empty">
            <div className="nx-empty-ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="1.8"><path d="M4 17l7-7 4 4 5-6" /></svg></div>
            <div className="nx-empty-title">No activity yet</div>
            <div className="nx-empty-sub">As you care for your garden, your story will appear here.</div>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="ax-group">
              <div className="ax-group-lbl">{g.label}</div>
              {groupByFamily(g.items).map((fg) => {
                if (fg.items.length === 1) return <Row key={`${fg.items[0].type}-${fg.items[0].plant.id}`} e={fg.items[0]} />;
                const key = `${g.label}-${fg.family}`;
                const open = !!expanded[key];
                const cfg = FAM[fg.family];
                const names = fg.items.map((e) => e.plant.nickname.split(" ")[0]);
                const preview = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
                return (
                  <div key={key} className="ax-cluster">
                    <button className="ax-cluster-head" onClick={() => toggle(key)} aria-expanded={open}>
                      <div className="ax-item-ic" style={{ background: `${cfg.color}18`, color: cfg.color }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="1.8">{cfg.ic}</svg>
                      </div>
                      <div className="ax-item-body">
                        <div className="ax-item-title">{cfg.title(fg.items.length)}</div>
                        <div className="ax-item-why">{preview}</div>
                      </div>
                      <svg className={`ax-cluster-chev${open ? " open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkFaint} strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    <div className={`ax-cluster-body${open ? " open" : ""}`}>
                      <div className="ax-cluster-inner">
                        {fg.items.map((e, i) => <Row key={`${e.type}-${e.plant.id}-${i}`} e={e} />)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div style={{ height: 30 }} />
      </div>
    </div>
  );
}

function ProfileScreen({ plants, onBack, onOpenRooms, onOpenActivity, signedIn = false, onSignIn, account, onUpdateAccount, onDeleteAccount }) {
  const [sheet, setSheet] = useState(null);
  const sheetDrag = useSheetDrag(() => setSheet(null));

  // Signed-out: a calm prompt to sign in rather than a personal profile.
  if (!signedIn) {
    return (
      <div className="v-screen light">
        <StatusBar light={true} />
        <div className="pf-out">
          <div className="pf-out-mark">
            <svg width="56" height="56" viewBox="0 0 96 96" fill="none">
              <path d="M48 78V46" stroke={T.moss} strokeWidth="3.5" strokeLinecap="round" />
              <path d="M48 54c0-9-5-15-14-17 0 9 5 15 14 17Z" fill={T.mossBright} />
              <path d="M48 48c0-9 5-15 14-17 0 9-5 15-14 17Z" fill={palette.leaf300} />
            </svg>
          </div>
          <div className="pf-out-title">Save your garden</div>
          <div className="pf-out-sub">You're exploring as a guest. Sign in to keep your plants, track your progress, and sync across every device — your garden stays safe even if you switch phones.</div>
          <div className="pf-out-perks">
            <div className="pf-out-perk"><span className="pf-out-perk-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></svg></span>Never lose a plant or its history</div>
            <div className="pf-out-perk"><span className="pf-out-perk-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4v1a3 3 0 0 0 3 3" /><path d="M17 6h3v1a3 3 0 0 1-3 3" /></svg></span>Earn milestones as you grow</div>
            <div className="pf-out-perk"><span className="pf-out-perk-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4.5" width="13" height="9.5" rx="1.5" /><path d="M6.5 18h5M9 14v4" /><rect x="16.5" y="9" width="5.5" height="11" rx="1.5" /></svg></span>Sync across all your devices</div>
          </div>
          <button className="pf-out-btn" onClick={onSignIn}>Sign in to Verdure</button>
        </div>
      </div>
    );
  }

  return <ProfileScreenSignedIn plants={plants} account={account} onBack={onBack} onOpenRooms={onOpenRooms} onOpenActivity={onOpenActivity} onUpdateAccount={onUpdateAccount} onDeleteAccount={onDeleteAccount} />;
}

function ProfileScreenSignedIn({ plants, onBack, onOpenRooms, onOpenActivity, account, onUpdateAccount, onDeleteAccount }) {
  const [sheet, setSheet] = useState(null);
  const sheetDrag = useSheetDrag(() => setSheet(null));
  const [celebrate, setCelebrate] = useState(null); // earned achievement being celebrated
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(null), 4000);
    return () => clearTimeout(t);
  }, [celebrate]);
  const [notif, setNotif] = useState({ watering: true, health: true, weekly: false, tips: true });
  const toggle = (k) => setNotif((s) => ({ ...s, [k]: !s[k] }));

  // user-centric stats (their journey as a plant parent)
  const userName = (account && account.name) || "Samantha";
  const userEmail = (account && account.email) || "samantha@email.com";
  const memberSince = "Spring 2025";
  const [acctPanel, setAcctPanel] = useState(null); // null | 'email' | 'password' | 'export' | 'delete'
  const [acctEmail, setAcctEmail] = useState(userEmail);
  const [acctPass, setAcctPass] = useState("");
  const [acctMsg, setAcctMsg] = useState(null);     // transient confirmation line
  const [exporting, setExporting] = useState(false);
  function openAcct(name) { setAcctMsg(null); setAcctEmail(userEmail); setAcctPass(""); setAcctPanel(name); }
  function flashAcctMsg(m) { setAcctPanel(null); setAcctMsg(m); }
  const daysTending = 87;
  const streak = 12;
  const cared = plants.length;
  const logged = plants.reduce((s, p) => s + (p.journal ? p.journal.length : 0), 0);
  const waterings = 32; // logged waterings toward big goals

  // ---- gamified milestones: each tracks progress toward a target ----
  const achievements = [
    { icon: <><path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></>, label: "First sprout", sub: "Add your first plant", cur: cared, target: 1 },
    { icon: <><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" /></>, label: "On a streak", sub: "7 days of daily care", cur: streak, target: 7 },
    { icon: <><path d="M12 12.5c0-4.5 2.2-8 8-9.5-0.5 5-3.2 8.8-8 9.5Z" /><path d="M12 12.5c0-4.5-2.2-8-8-9.5 0.5 5 3.2 8.8 8 9.5Z" /><path d="M12 12.5v-2.5" /><path d="M5 12.5h14l-1.4 8a1 1 0 0 1-1 .8H7.4a1 1 0 0 1-1-.8L5 12.5Z" /></>, label: "Full house", sub: "10 plants in your care", cur: cared, target: 10 },
    { icon: <><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /></>, label: "Hydration hero", sub: "Log 50 waterings", cur: waterings, target: 50 },
    { icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, label: "Century club", sub: "100 days tending", cur: daysTending, target: 100 },
    { icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></>, label: "Journal keeper", sub: "Log 25 journal entries", cur: logged, target: 25 },
    { icon: <><path d="M12 2v20M2 12h20" /><circle cx="12" cy="12" r="9" /></>, label: "Room to grow", sub: "Fill all 4 rooms with plants", cur: new Set(plants.map((p) => p.room)).size, target: 4 },
    { icon: <><path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3Z" /></>, label: "Perfect week", sub: "All plants healthy for 7 days", cur: 4, target: 7 },
  ].map((a) => ({ ...a, got: a.cur >= a.target, pct: Math.min(100, Math.round((a.cur / a.target) * 100)) }));

  const earned = achievements.filter((a) => a.got).length;
  const nextUp = achievements.find((a) => !a.got);

  // ---- tier ladder (hotel/airline elite-status style) ----
  const TIERS = [
    { name: "New sprout", need: 0, perk: "Care reminders & plant ID" },
    { name: "Growing steady", need: 30, perk: "Seasonal care tips unlocked" },
    { name: "Seasoned grower", need: 60, perk: "Placement insights & health trends" },
    { name: "Master gardener", need: 120, perk: "Early access to new features" },
  ];
  const tierIdx = TIERS.reduce((acc, t, i) => (daysTending >= t.need ? i : acc), 0);
  const greenThumbLevel = TIERS[tierIdx].name;
  const nextTier = TIERS[tierIdx + 1] || null;
  const tierProgress = nextTier ? Math.min(100, Math.round(((daysTending - TIERS[tierIdx].need) / (nextTier.need - TIERS[tierIdx].need)) * 100)) : 100;
  const daysToNext = nextTier ? nextTier.need - daysTending : 0;

  const settings = [
    { group: "Preferences", items: [
      { icon: <><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></>, label: "Notifications", sub: `${Object.values(notif).filter(Boolean).length} of 4 on`, act: () => setSheet("notifications") },
      { icon: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>, label: "Account & email", sub: userEmail, act: () => setSheet("account") },
    ] },
    { group: "Support", items: [
      { icon: <><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 2.5M12 17h.01" /></>, label: "Help & FAQ", sub: "Common questions", act: () => setSheet("about") },
      { icon: <><path d="M12 16v-5M12 7.5h.01" /><circle cx="12" cy="12" r="9" /></>, label: "About Verdure", sub: "Version 1.0", act: () => setSheet("about") },
    ] },
  ];

  return (
    <div className="v-screen light">
      <StatusBar light={true} />
      <div className="dt-scroll">

        {/* HERO — the person */}
        <div className="pf2-hero">
          <div className="pf3-avatar">
            <svg width="78" height="78" viewBox="0 0 78 78" fill="none">
              <defs>
                <linearGradient id="avgrad" x1="0" y1="0" x2="78" y2="78"><stop stopColor={palette.moss400} /><stop offset="1" stopColor={palette.moss650} /></linearGradient>
                <clipPath id="avclip"><circle cx="39" cy="39" r="39" /></clipPath>
              </defs>
              <circle cx="39" cy="39" r="39" fill="url(#avgrad)" />
              <g clipPath="url(#avclip)">
                {/* blouse + collar */}
                <path d="M15 78 C15 62 26 55 39 55 C52 55 63 62 63 78 Z" fill={color.surfaceWarm} />
                <path d="M34.5 56 C36 60 42 60 43.5 56 L44 61 L34 61 Z" fill={color.surfaceWarmDeep} />
                {/* neck */}
                <path d="M35 48 h8 v7 c0 2 -1.6 3.4 -4 3.4 s-4 -1.4 -4 -3.4 Z" fill={palette.clay120} />
                {/* hair back */}
                <path d="M24 39 C24 26 30.5 18 39 18 C47.5 18 54 26 54 39 C54 49 52 55 49 60 L49 42 C49 36 45 32 39 32 C33 32 29 36 29 42 L29 60 C26 55 24 49 24 39 Z" fill={palette.bark700} />
                {/* face */}
                <path d="M30 37.5 C30 30 33.6 25 39 25 C44.4 25 48 30 48 37.5 C48 46 44.4 51 39 51 C33.6 51 30 46 30 37.5 Z" fill={palette.clay200} />
                {/* ears */}
                <circle cx="30" cy="39.5" r="2" fill={palette.clay150} /><circle cx="48" cy="39.5" r="2" fill={palette.clay150} />
                {/* hairline / fringe */}
                <path d="M29 35 C30 26.5 33.6 22.5 39 22.5 C44.4 22.5 48 26.5 49 35 C46.5 30 43 28 39 28 C35 28 31.5 30 29 35 Z" fill={palette.bark600} />
                <path d="M28.6 34 C27.6 40 28 46 29.6 50 C27.2 46 26.4 40 27.4 34 Z" fill={palette.bark700} />
                <path d="M49.4 34 C50.4 40 50 46 48.4 50 C50.8 46 51.6 40 50.6 34 Z" fill={palette.bark700} />
                {/* cheeks */}
                <ellipse cx="33.3" cy="42.5" rx="2.2" ry="1.4" fill={palette.clay300} opacity="0.5" />
                <ellipse cx="44.7" cy="42.5" rx="2.2" ry="1.4" fill={palette.clay300} opacity="0.5" />
                {/* brows */}
                <path d="M33.4 35.6 C34.4 34.9 35.9 34.9 36.9 35.4" stroke={palette.bark500} strokeWidth="0.9" fill="none" strokeLinecap="round" />
                <path d="M41.1 35.4 C42.1 34.9 43.6 34.9 44.6 35.6" stroke={palette.bark500} strokeWidth="0.9" fill="none" strokeLinecap="round" />
                {/* eyes */}
                <circle cx="35" cy="38.6" r="1.5" fill={palette.black500} /><circle cx="43" cy="38.6" r="1.5" fill={palette.black500} />
                <circle cx="35.5" cy="38.1" r="0.45" fill={palette.white} /><circle cx="43.5" cy="38.1" r="0.45" fill={palette.white} />
                {/* nose + smile */}
                <path d="M38.6 40 l-0.7 2 h1.5 Z" fill={palette.clay250} opacity="0.7" />
                <path d="M36 45.2 C37.5 46.8 40.5 46.8 42 45.2" stroke={palette.clay500} strokeWidth="1.3" fill="none" strokeLinecap="round" />
              </g>
            </svg>
          </div>
          <h1 className="pf2-name">{userName}</h1>
          <button className="pf3-badge pf3-badge-tap" onClick={() => setSheet("tiers")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="2"><path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /></svg>
            {greenThumbLevel}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="2" style={{ opacity: 0.7 }}><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <div className="pf2-sub">Plant parent since {memberSince}</div>
        </div>

        {/* JOURNEY — the user's plant-parenting stats */}
        <div className="pf2-vitals">
          <div className="pf2-vital"><div className="pf2-vital-num" style={{ color: T.moss }}>{streak}</div><div className="pf2-vital-lbl">Day streak</div></div>
          <div className="pf2-vital-div" />
          <div className="pf2-vital"><div className="pf2-vital-num">{daysTending}</div><div className="pf2-vital-lbl">Days tending</div></div>
          <div className="pf2-vital-div" />
          <div className="pf2-vital"><div className="pf2-vital-num">{logged}</div><div className="pf2-vital-lbl">Care logged</div></div>
        </div>

        {/* MILESTONES — calm: one next-up focus + compact earned strip */}
        <div className="pf3-mile-head">
          <span className="pf3-sec-lbl" style={{ margin: 0 }}>Milestones</span>
          <button className="pf3-mile-all" onClick={() => setSheet("milestones")}>{earned} of {achievements.length} · View all</button>
        </div>
        {nextUp && (
          <button className="pf3-next" onClick={() => setSheet("milestones")}>
            <div className="pf3-next-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="1.8">{nextUp.icon}</svg></div>
            <div className="pf3-next-body">
              <div className="pf3-next-kicker">Closest milestone</div>
              <div className="pf3-next-label">{nextUp.label}</div>
              <div className="pf3-next-bar"><div className="pf3-next-fill" style={{ width: `${nextUp.pct}%` }} /></div>
            </div>
            <div className="pf3-next-pct">{nextUp.cur}/{nextUp.target}</div>
          </button>
        )}
        <div className="pf3-earned-strip">
          {achievements.map((a, i) => (
            <div key={i} className={`pf3-chip${a.got ? " got" : ""}`} onClick={() => a.got && setCelebrate(a)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={a.got ? palette.white : T.inkFaint} strokeWidth="1.8">{a.icon}</svg>
              <div className="pf3-chip-tip">
                <div className="pf3-chip-tip-name">{a.label}</div>
                <div className="pf3-chip-tip-sub">{a.got ? "Earned" : `${a.sub} · ${a.cur}/${a.target}`}</div>
              </div>
            </div>
          ))}
        </div>

        {settings.map((sec) => (
          <div key={sec.group} className="pf2-sec">
            <div className="pf2-sec-lbl">{sec.group}</div>
            <div className="pf2-list">
              {sec.items.map((r, i) => (
                <button key={i} className="pf2-row" onClick={r.act}>
                  <div className="pf2-row-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="1.8">{r.icon}</svg></div>
                  <div className="pf2-row-text"><div className="pf2-row-label">{r.label}</div><div className="pf2-row-sub">{r.sub}</div></div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.inkFaint} strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              ))}
            </div>
          </div>
        ))}
        <button className="pf3-signout">Sign out</button>
        <div style={{ height: 30 }} />
      </div>

      {sheet && <div className="pf2-scrim" onClick={() => setSheet(null)} />}
      {sheet === "tiers" && (
        <div className="pf2-sheet" ref={sheetDrag.ref} onTouchStart={sheetDrag.onTouchStart} onTouchMove={sheetDrag.onTouchMove} onTouchEnd={sheetDrag.onTouchEnd} onMouseDown={sheetDrag.onMouseDown}>
          <div className="pf2-sheet-grab" />
          <div className="pf2-sheet-title">Grower tiers</div>
          <div className="pf2-sheet-sub">Keep tending your garden to climb. Tiers are based on your days of care.</div>

          {nextTier ? (
            <div className="pf3-tierhero">
              <div className="pf3-tierhero-ring">
                <svg width="72" height="72" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="30" fill="none" stroke={T.line} strokeWidth="4" />
                  <circle cx="36" cy="36" r="30" fill="none" stroke={T.moss} strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 30} strokeDashoffset={2 * Math.PI * 30 * (1 - tierProgress / 100)}
                    transform="rotate(-90 36 36)" style={{ transition: "stroke-dashoffset 1s ease" }} />
                </svg>
                <div className="pf3-tierhero-num">{daysToNext}<span>days</span></div>
              </div>
              <div className="pf3-tierhero-body">
                <div className="pf3-tierhero-kicker">On your way to</div>
                <div className="pf3-tierhero-next">{nextTier.name}</div>
                <div className="pf3-tierhero-sub">{daysToNext} more days of care · you're at {daysTending}</div>
              </div>
            </div>
          ) : (
            <div className="pf3-tierhero"><div className="pf3-tierhero-body"><div className="pf3-tierhero-next">Top tier reached 🌿</div><div className="pf3-tierhero-sub">You're a Master gardener.</div></div></div>
          )}

          <div className="pf3-ladder">
            {TIERS.map((t, i) => {
              const state = i < tierIdx ? "done" : i === tierIdx ? "current" : "locked";
              return (
                <div key={t.name} className={`pf3-tier ${state}`}>
                  <div className="pf3-tier-rail"><div className="pf3-tier-dot">{state === "done" && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="3.5"><path d="M20 6L9 17l-5-5" /></svg>}</div>{i < TIERS.length - 1 && <div className="pf3-tier-line" />}</div>
                  <div className="pf3-tier-body">
                    <div className="pf3-tier-top">
                      <span className="pf3-tier-name">{t.name}</span>
                      {state === "current" && <span className="pf3-tier-here">You're here</span>}
                    </div>
                    <div className="pf3-tier-need">{t.need === 0 ? "Starting tier" : `${t.need} days of care`}</div>
                    <div className="pf3-tier-perk">{t.perk}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {sheet === "milestones" && (
        <div className="pf2-sheet" ref={sheetDrag.ref} onTouchStart={sheetDrag.onTouchStart} onTouchMove={sheetDrag.onTouchMove} onTouchEnd={sheetDrag.onTouchEnd} onMouseDown={sheetDrag.onMouseDown}>
          <div className="pf2-sheet-grab" />
          <div className="pf2-sheet-title">Milestones</div>
          <div className="pf2-sheet-sub">{earned} of {achievements.length} earned · keep going to collect them all.</div>
          <div className="pf3-badges" style={{ margin: "18px 0 0" }}>
            {achievements.map((a, i) => (
              <div key={i} className={`pf3-badge-card${a.got ? " got" : " locked"}`}>
                {a.got && <div className="pf3-badge-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg></div>}
                <div className="pf3-badge-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={a.got ? palette.white : T.inkFaint} strokeWidth="1.8">{a.icon}</svg></div>
                <div className="pf3-badge-label">{a.label}</div>
                <div className="pf3-badge-sub">{a.sub}</div>
                {!a.got && <div className="pf3-badge-prog"><div className="pf3-badge-prog-bar"><div style={{ width: `${a.pct}%` }} /></div><span>{a.cur}/{a.target}</span></div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {sheet === "notifications" && (
        <div className="pf2-sheet" ref={sheetDrag.ref} onTouchStart={sheetDrag.onTouchStart} onTouchMove={sheetDrag.onTouchMove} onTouchEnd={sheetDrag.onTouchEnd} onMouseDown={sheetDrag.onMouseDown}>
          <div className="pf2-sheet-grab" />
          <div className="pf2-sheet-title">Notifications</div>
          <div className="pf2-sheet-sub">Choose what Verdure reminds you about.</div>
          {[["watering", "Watering reminders", "When a plant is due for water"], ["health", "Health alerts", "When a plant needs attention"], ["weekly", "Weekly digest", "A Sunday summary of your garden"], ["tips", "Care tips", "Seasonal advice for your plants"]].map(([k, label, sub]) => (
            <button key={k} type="button" className="pf2-toggle-row" role="switch" aria-checked={!!notif[k]} aria-label={label} onClick={() => toggle(k)}>
              <div className="pf2-toggle-text"><div className="pf2-toggle-label">{label}</div><div className="pf2-toggle-sub">{sub}</div></div>
              <div className={`pf2-switch${notif[k] ? " on" : ""}`}><div className="pf2-switch-knob" /></div>
            </button>
          ))}
        </div>
      )}
      {sheet === "account" && (
        <div className="pf2-sheet" ref={sheetDrag.ref} onTouchStart={sheetDrag.onTouchStart} onTouchMove={sheetDrag.onTouchMove} onTouchEnd={sheetDrag.onTouchEnd} onMouseDown={sheetDrag.onMouseDown}>
          <div className="pf2-sheet-grab" />
          {acctPanel === null && (
            <>
              <div className="pf2-sheet-title">Account &amp; email</div>
              <div className="pf2-sheet-sub">Signed in as {userEmail}</div>
              {acctMsg && <div className="pf2-acct-msg"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.mossBright} strokeWidth="2.2"><path d="M20 6L9 17l-5-5" /></svg>{acctMsg}</div>}
              <div className="pf2-about-rows">
                {[["email", "Change email"], ["password", "Change password"], ["export", "Export my data"], ["delete", "Delete account"]].map(([k, label]) => (
                  <button key={k} className={`pf2-about-row${k === "delete" ? " danger" : ""}`} onClick={() => openAcct(k)}>{label}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={k === "delete" ? T.clay : T.inkFaint} strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg></button>
                ))}
              </div>
            </>
          )}
          {acctPanel === "email" && (
            <>
              <button className="pf2-acct-back" onClick={() => setAcctPanel(null)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>Account</button>
              <div className="pf2-sheet-title">Change email</div>
              <div className="pf2-sheet-sub">Where Verdure sends reminders and your weekly digest.</div>
              <input className="pf2-acct-input" type="email" inputMode="email" value={acctEmail} onChange={(e) => setAcctEmail(e.target.value)} placeholder="you@email.com" aria-label="Email address" />
              <button className="pf2-acct-save" disabled={!acctEmail.includes("@")} onClick={() => { onUpdateAccount && onUpdateAccount({ email: acctEmail }); flashAcctMsg("Email updated."); }}>Save email</button>
            </>
          )}
          {acctPanel === "password" && (
            <>
              <button className="pf2-acct-back" onClick={() => setAcctPanel(null)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>Account</button>
              <div className="pf2-sheet-title">Change password</div>
              <div className="pf2-sheet-sub">Choose something at least 8 characters long.</div>
              <input className="pf2-acct-input" type="password" value={acctPass} onChange={(e) => setAcctPass(e.target.value)} placeholder="New password" aria-label="New password" />
              <button className="pf2-acct-save" disabled={acctPass.length < 8} onClick={() => flashAcctMsg("Password updated.")}>Update password</button>
            </>
          )}
          {acctPanel === "export" && (
            <>
              <button className="pf2-acct-back" onClick={() => setAcctPanel(null)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>Account</button>
              <div className="pf2-sheet-title">Export my data</div>
              <div className="pf2-sheet-sub">We'll gather your plants, check-in history, and rooms, then email a copy to {userEmail}.</div>
              <button className="pf2-acct-save" disabled={exporting} onClick={() => { setExporting(true); setTimeout(() => { setExporting(false); flashAcctMsg(`Export sent to ${userEmail}.`); }, 1300); }}>{exporting ? "Preparing your export…" : "Email me my data"}</button>
            </>
          )}
          {acctPanel === "delete" && (
            <>
              <button className="pf2-acct-back" onClick={() => setAcctPanel(null)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>Account</button>
              <div className="pf2-sheet-title">Delete account</div>
              <div className="pf2-sheet-sub">This permanently removes your garden, check-in history, and milestones. This can't be undone.</div>
              <button className="pf2-acct-delete" onClick={() => onDeleteAccount && onDeleteAccount()}>Delete my account</button>
              <button className="pf2-acct-cancel" onClick={() => setAcctPanel(null)}>Keep my garden</button>
            </>
          )}
        </div>
      )}
      {sheet === "about" && (
        <div className="pf2-sheet" ref={sheetDrag.ref} onTouchStart={sheetDrag.onTouchStart} onTouchMove={sheetDrag.onTouchMove} onTouchEnd={sheetDrag.onTouchEnd} onMouseDown={sheetDrag.onMouseDown}>
          <div className="pf2-sheet-grab" />
          <div className="pf2-about-mark"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="1.8"><path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></svg></div>
          <div className="pf2-sheet-title" style={{ textAlign: "center" }}>Verdure</div>
          <div className="pf2-sheet-sub" style={{ textAlign: "center" }}>Version 1.0 · A calmer way to care for your plants.</div>
          <div className="pf2-about-rows">
            {["Privacy policy", "Terms of service", "Rate Verdure", "Send feedback"].map((x) => (
              <button key={x} className="pf2-about-row">{x}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.inkFaint} strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg></button>
            ))}
          </div>
        </div>
      )}

      {celebrate && (
        <div className="pf3-celebrate" onClick={() => setCelebrate(null)}>
          <div className="pf3-cel-burst">
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} className="pf3-confetti" style={{ "--a": `${(360 / 14) * i}deg`, "--d": `${0.05 * (i % 5)}s`, background: [T.moss, T.mossBright, color.watchSoft, T.clay][i % 4] }} />
            ))}
          </div>
          <div className="pf3-cel-badge"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="1.8">{celebrate.icon}</svg></div>
          <div className="pf3-cel-kicker">Milestone earned</div>
          <div className="pf3-cel-name">{celebrate.label}</div>
          <div className="pf3-cel-sub">{celebrate.sub}</div>
          <button className="pf3-cel-btn" onClick={() => setCelebrate(null)}>Nice!</button>
        </div>
      )}
    </div>
  );
}
function AddPlantScreen({ onClose, onAdd, firstRun = false, skyHour }) {
  const [phase, setPhase] = useState("capture1"); // capture1 | capture2 | analyzing | identified
  const [stageIdx, setStageIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [shot1, setShot1] = useState(false); // close-up captured
  const [shot2, setShot2] = useState(false); // room-light captured
  const [flash, setFlash] = useState(false);
  const [room, setRoom] = useState(null);
  const [nickname, setNickname] = useState("");
  const [customRooms, setCustomRooms] = useState([]);
  const [addingRoom, setAddingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const timers = useRef([]);
  const detected = "lily"; // concept: the scan identifies a Peace Lily
  const detectedHealth = 58; // the scan reads its actual condition — this one arrived a little stressed
  const detectedStatus = statusOf(detectedHealth);
  const detectedLight = { label: "Medium, indirect", level: 52, note: "Bright enough for a Peace Lily, out of harsh sun" }; // read from the room-light photo
  const needsCare = detectedHealth < 70;
  const diag = DIAGNOSIS[detectedStatus];
  const s = SPECIES[detected];
  const env = envFor(detected);
  const allRooms = ROOMS.concat(customRooms);
  const recommended = placementFit(detected, "Bedroom") >= placementFit(detected, "Living room") ? "Bedroom" : "Living room";
  useEffect(function () { return function () { timers.current.forEach(clearTimeout); }; }, []);

  function freezeCapture(after) {
    setFlash(true); // reuse as 'frozen' flag
    timers.current.push(setTimeout(function () { setFlash(false); after(); }, 620));
  }
  function captureCloseup() {
    freezeCapture(function () { setShot1(true); setPhase("capture2"); });
  }
  function captureRoom() {
    freezeCapture(function () { setShot2(true); runAnalysis(); });
  }
  function runAnalysis() {
    setPhase("analyzing"); setStageIdx(0);
    timers.current.push(setTimeout(function () { setStageIdx(1); }, 850));
    timers.current.push(setTimeout(function () { setStageIdx(2); }, 1700));
    timers.current.push(setTimeout(function () { setPhase("identified"); }, 2600));
    timers.current.push(setTimeout(function () { setRevealed(true); setRoom(firstRun ? null : recommended); }, 2750));
  }
  function retake() {
    timers.current.forEach(clearTimeout); timers.current = [];
    setShot1(false); setShot2(false); setRevealed(false); setStageIdx(0); setFlash(false);
    setPhase("capture1");
  }
  function addRoom() {
    const name = newRoomName.trim();
    if (!name || allRooms.indexOf(name) !== -1) { setAddingRoom(false); setNewRoomName(""); return; }
    setCustomRooms(customRooms.concat(name));
    setRoom(name);
    setAddingRoom(false); setNewRoomName("");
  }
  function confirm() {
    if (!room) return; // a room is required — several features depend on it
    onAdd({ speciesKey: detected, health: detectedHealth, room, nickname: nickname.trim() || s.common });
  }

  const care = [
    { k: "Room light", v: detectedLight.label, sub: "measured from your photo", ic: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg> },
    { k: "Water", v: s.water, ic: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /></svg> },
  ];

  return (
    <div className="v-screen dark">
      <StatusBar light={false} />
      {(phase === "capture1" || phase === "capture2" || phase === "analyzing") && (
        <div className="ap-viewfinder">
          <button className="ap-close" onClick={onClose} aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>

          {/* subtle two-step progress */}
          {phase !== "analyzing" && (
            <div className="ap-seg">
              <span className={`ap-seg-line${phase === "capture1" ? " on" : ""}${shot1 ? " past" : ""}`} />
              <span className={`ap-seg-line${phase === "capture2" ? " on" : ""}${shot2 ? " past" : ""}`} />
            </div>
          )}

          {/* WHY copy — informs the user what this shot is for */}
          {phase === "capture1" && (
            <div className="ap-why">
              <div className="ap-why-t">First, the plant up close</div>
              <div className="ap-why-b">This shot lets Verdure identify the species and read its health from the leaves.</div>
            </div>
          )}
          {phase === "capture2" && (
            <div className="ap-why">
              <div className="ap-why-t">Now, step back for the light</div>
              <div className="ap-why-b">A wider shot reads how much light this spot gets, so care advice fits the real conditions.</div>
            </div>
          )}

          {/* framing guide — animates between close and wide */}
          <div className={`ap-frame${phase === "capture2" ? " wide" : ""}${flash ? " snap" : ""}`}><div className="ap-corner tl" /><div className="ap-corner tr" /><div className="ap-corner bl" /><div className="ap-corner br" /></div>
          {phase === "capture2" && (
            <div className="ap-lightfield" aria-hidden="true">
              <div className="ap-lf-glow" />
              <div className="ap-lf-rays">
                <span className="ap-lf-ray r1" />
                <span className="ap-lf-ray r2" />
                <span className="ap-lf-ray r3" />
                <span className="ap-lf-ray r4" />
              </div>
              <div className="ap-lf-pool" />
            </div>
          )}
          <div className={`ap-specimen${phase === "capture2" ? " far" : ""}${flash ? " frozen" : ""}`}>
            <PlantSilhouette speciesKey={detected} baseColor={[200, 210, 200]} size={phase === "capture2" ? 74 : 120} />
          </div>

          {phase === "analyzing" && <div className="ap-scanline" />}
          {flash && <div className="ap-snap-ring" />}

          {/* one shutter per shot — two taps total */}
          {phase === "capture1" && <div className="ap-shutter-wrap"><div className="ap-shutter-cap">Tap to capture</div><button className="ap-shutter" onClick={captureCloseup}><div className="ap-shutter-in" /></button></div>}
          {phase === "capture2" && <div className="ap-shutter-wrap"><div className="ap-shutter-cap">Tap to capture</div><button className="ap-shutter" onClick={captureRoom}><div className="ap-shutter-in" /></button></div>}
          {phase === "analyzing" && <div className="ap-stages"><div className="ap-stage-text">{ADD_STAGES[stageIdx]}</div><div className="ap-dots">{ADD_STAGES.map(function (_, i) { return <div key={i} className={`ap-dot${i === stageIdx ? " on" : ""}`} />; })}</div></div>}
        </div>
      )}

      {phase === "failed" && (
        <div className="ap-viewfinder ap-failed">
          <button className="ap-close" onClick={onClose} aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <div className="ap-fail-card">
            <div className="ap-fail-ic"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color.watchSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7a10.6 10.6 0 0 1-4.2-.9" /><path d="M3 3l18 18" /><circle cx="12" cy="12" r="3" /></svg></div>
            <div className="ap-fail-title">We couldn't get a clear read</div>
            <div className="ap-fail-sub">The photos were a little too dark or busy to identify with confidence. A couple of quick things help:</div>
            <div className="ap-fail-tips">
              <div className="ap-fail-tip"><span>1</span>Find bright, indirect light — avoid backlighting.</div>
              <div className="ap-fail-tip"><span>2</span>Fill the frame with a single plant.</div>
              <div className="ap-fail-tip"><span>3</span>Hold steady until the shutter finishes.</div>
            </div>
            <button className="ap-fail-retry" onClick={retake}>Retake photos</button>
            <button className="ap-fail-cancel" onClick={onClose}>Not now</button>
          </div>
        </div>
      )}

      {phase === "identified" && (
        <div className="apx">
          {/* immersive reveal — the plant arrives on a dark canvas with a glow */}
          <div className="apx-glow" />
          <button className="apx-close" onClick={onClose} aria-label="Close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>

          <div className="apx-scroll">
            <div className={`apx-hero${revealed ? " in" : ""}`}>
              <div className="apx-badge">Identified · 94% match</div>
              <div className="apx-photo"><PlantPhoto speciesKey={detected} health={detectedHealth} size={150} round={false} /></div>
              <h1 className="apx-name">{s.common}</h1>
              <div className="apx-latin">{s.latin}</div>
              <button className="apx-dispute" onClick={() => setPhase("failed")}>Not the right plant?</button>
            </div>

            {/* early AI power — the scan reads its condition */}
            {needsCare && (
              <div className={`apx-alert${revealed ? " in" : ""}`}>
                <div className="apx-alert-top">
                  <span className="apx-alert-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color.watchSoft} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 4.3 2 18.5A2 2 0 0 0 3.7 21.5h16.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17h.01" /></svg></span>
                  <div className="apx-alert-head">
                    <div className="apx-alert-title">Needs a little care</div>
                    <div className="apx-alert-conf">AI · {diag.confidence}% confident</div>
                  </div>
                </div>
                <div className="apx-alert-body">{diag.summary}</div>
                <div className="apx-alert-first"><span className="apx-alert-first-lbl">First step</span> {diag.revive[0] ? diag.revive[0].step : "Keep an eye on it this week"}</div>
              </div>
            )}

            {/* the app already knows how to care for it — instant value */}
            <div className={`apx-care${revealed ? " in" : ""}`}>
              <div className="apx-care-lbl">Here's what it likes</div>
              {care.map(function (c) {
                return (
                  <div key={c.k} className="apx-care-row">
                    <span className="apx-care-ic">{c.ic}</span>
                    <div className="apx-care-body"><div className="apx-care-k">{c.k}</div><div className="apx-care-v">{c.v}</div>{c.sub && <div className="apx-care-sub">{c.sub}</div>}</div>
                  </div>
                );
              })}
            </div>

            <div className={`apx-form${revealed ? " in" : ""}`}>
              <div className="apx-field-lbl">Give it a name</div>
              <input className="apx-input" aria-label="Plant nickname" placeholder={`e.g. ${s.common === "Peace Lily" ? "Lily" : s.common}`} value={nickname} onChange={function (e) { setNickname(e.target.value); }} />

              <div className="apx-field-lbl">Where will it live?</div>
              <div className="apx-rooms">
                {allRooms.map(function (r) {
                  const isRec = !firstRun && r === recommended;
                  return (
                    <button key={r} className={`apx-room${room === r ? " sel" : ""}`} onClick={function () { setRoom(r); }}>
                      {r}
                      {isRec && <span className="apx-room-rec">Best fit</span>}
                    </button>
                  );
                })}
                {!addingRoom && (
                  <button className="apx-room apx-room-add" onClick={function () { setAddingRoom(true); }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>Add room
                  </button>
                )}
              </div>
              {addingRoom && (
                <div className="apx-room-new">
                  <input className="apx-input apx-room-new-input" aria-label="New room name" autoFocus placeholder="Room name (e.g. Balcony)" value={newRoomName}
                    onChange={function (e) { setNewRoomName(e.target.value); }}
                    onKeyDown={function (e) { if (e.key === "Enter") addRoom(); }} />
                  <button className="apx-room-new-save" onClick={addRoom}>Add</button>
                </div>
              )}
            </div>
          </div>

          <div className={`apx-cta-wrap${revealed ? " in" : ""}`}>
            <button className="apx-cta" onClick={confirm} disabled={!room}>
              {!room ? (
                <>Choose a room to continue</>
              ) : firstRun ? (
                <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V11"/><path d="M12 11c0-3.3 2.4-5.5 6-5.5.3 3.3-2.2 5.5-6 5.5Z"/><path d="M12 13c0-2.8-2-4.8-5-4.8-.2 2.8 1.7 4.8 5 4.8Z"/><path d="M7 22h10"/></svg>Continue with {nickname.trim() || s.common}</>
              ) : (
                <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={palette.white} strokeWidth="2"><path d="M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 11-8 11Z" /></svg>Welcome {nickname.trim() || s.common} home</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ SPLASH SCREEN ============================ */
function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 2200);
    const t2 = setTimeout(onDone, 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div className={`sp-root${leaving ? " leaving" : ""}`} onClick={() => { setLeaving(true); setTimeout(onDone, 500); }}>
      <StatusBar light={false} />
      <div className="sp-glowfield" />
      <div className="sp-mark">
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
          <circle className="sp-ring" cx="48" cy="48" r="44" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
          {/* growing sprout */}
          <path className="sp-stem" d="M48 74V44" stroke={color.onDark} strokeWidth="3" strokeLinecap="round" />
          <path className="sp-leaf sp-leaf-l" d="M48 52c0-9-5-15-14-17 0 9 5 15 14 17Z" fill={palette.leaf300} />
          <path className="sp-leaf sp-leaf-r" d="M48 46c0-9 5-15 14-17 0 9-5 15-14 17Z" fill={palette.leaf200} />
          <circle className="sp-seed" cx="48" cy="76" r="3" fill={color.onDark} />
        </svg>
      </div>
      <div className="sp-word">VERDURE</div>
      <div className="sp-rule" />
      <div className="sp-tag">Your plants, understood</div>
    </div>
  );
}

/* ============================ ONBOARDING ============================ */
function OnboardingFlow({ hour, onComplete, resumePlant }) {
  // Scan-first onboarding: feel the magic, THEN sign in.
  // welcome → scan (two-photo capture + reveal) → earned sign-in.
  // Resuming from the save-nudge jumps straight to sign-in with the scanned plant.
  const [sub, setSub] = useState(resumePlant ? "signin" : "welcome"); // welcome | scan | signin
  const [scanned, setScanned] = useState(resumePlant && !resumePlant.signInOnly ? resumePlant : null); // { speciesKey, health, room, nickname }
  const [emailStep, setEmailStep] = useState(null); // null | 'email' | 'name' | 'confirm'
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState(null); // 'apple' | 'google' | 'email'
  function startSSO(prov) {
    // the provider hands back the account's name + email; we confirm them, same as email signup
    const data = prov === "apple" ? { name: "Samantha Reed", email: "samantha@icloud.com" } : { name: "Samantha Reed", email: "samantha@gmail.com" };
    setProvider(prov); setName(data.name); setEmail(data.email); setEmailStep("confirm");
  }
  const [enter, setEnter] = useState(false);
  const [runHour, setRunHour] = useState(hour); // sky auto-cycles through the day on the welcome scene
  const rafRef = useRef(null);
  useEffect(() => { const t = setTimeout(() => setEnter(true), 80); return () => clearTimeout(t); }, []);

  // Welcome + sign-in: run the day like "Play day", so the world stays alive throughout.
  useEffect(() => {
    if (sub === "scan") { cancelAnimationFrame(rafRef.current); return; }
    let last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000; last = now;
      setRunHour((h) => (h + dt * 1.3) % 24);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sub]);

  const skyHour = runHour;

  if (sub === "scan") {
    return (
      <OnboardingScan
        hour={runHour}
        onIdentified={(data) => { setScanned(data); setSub("signin"); }}
        onCancel={() => setSub("welcome")}
      />
    );
  }

  return (
    <div className="ob2-root">
      <LivingSky hour={skyHour} realisticSky={true} />
      <div className="ob2-veil" />
      <StatusBar light={false} />

      {sub === "welcome" && (
        <div className={`ob2-welcome${enter ? " in" : ""}`}>
          <div className="ob2-mark">
            <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
              <path className="ob2-stem" d="M48 78V46" stroke={color.onDark} strokeWidth="3.5" strokeLinecap="round" />
              <path className="ob2-leaf ob2-leaf-l" d="M48 54c0-9-5-15-14-17 0 9 5 15 14 17Z" fill={palette.leaf300} />
              <path className="ob2-leaf ob2-leaf-r" d="M48 48c0-9 5-15 14-17 0 9-5 15-14 17Z" fill={palette.leaf200} />
            </svg>
          </div>
          <h1 className="ob2-w-title">Meet your first plant</h1>
          <div className="ob2-w-sub">Point your camera at any plant. Verdure will know what it is, how it's doing, and exactly how to help it thrive.</div>
          <button className="ob2-scan-btn" onClick={() => setSub("scan")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.2"/></svg>
            Scan a plant
          </button>
          <div className="ob2-w-foot">No account needed to start</div>
        </div>
      )}

      {sub === "signin" && (() => {
        const plant = scanned && !scanned.signInOnly ? scanned : null;
        const savePlant = plant || null;
        return (
        <div className="ob2-signin in">
          {plant ? (
            <>
              <div className="ob2-si-plant"><PlantPhoto speciesKey={plant.speciesKey} health={plant.health} size={124} round={false} /></div>
              <div className="ob2-si-kicker">Say hello to</div>
              <h1 className="ob2-si-name">{plant.nickname}</h1>
            </>
          ) : (
            <>
              <div className="ob2-si-mark">
                <svg width="72" height="72" viewBox="0 0 96 96" fill="none">
                  <path d="M48 78V46" stroke={color.onDark} strokeWidth="3.5" strokeLinecap="round" />
                  <path d="M48 54c0-9-5-15-14-17 0 9 5 15 14 17Z" fill={palette.leaf300} />
                  <path d="M48 48c0-9 5-15 14-17 0 9-5 15-14 17Z" fill={palette.leaf200} />
                </svg>
              </div>
              <h1 className="ob2-si-name">Save your garden</h1>
            </>
          )}

          {emailStep === null && (
            <>
              <div className="ob2-si-sub">{plant ? `Beautiful. Sign in to save ${plant.nickname.split(" ")[0]} to your garden and pick up right where you left off — on any device.` : "Sign in to keep your plants safe and synced across every device."}</div>
              <div className="ob2-si-btns">
                <button className="ob2-sso apple" onClick={() => startSSO("apple")}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.04c-.03-2.6 2.13-3.85 2.23-3.91-1.22-1.78-3.11-2.02-3.78-2.05-1.61-.16-3.14.95-3.96.95-.81 0-2.07-.93-3.4-.9-1.75.02-3.36 1.02-4.26 2.58-1.82 3.16-.47 7.83 1.3 10.4.86 1.25 1.89 2.66 3.23 2.61 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.28 3.14-2.54.99-1.46 1.4-2.87 1.42-2.94-.03-.01-2.72-1.05-2.75-4.16zM14.53 4.3c.72-.87 1.2-2.08 1.07-3.3-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2-1.09 3.18 1.15.09 2.32-.58 3.04-1.44z"/></svg>
                  Continue with Apple
                </button>
                <button className="ob2-sso google" onClick={() => startSSO("google")}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill={palette.amber300} d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.45 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z"/></svg>
                  Continue with Google
                </button>
                <button className="ob2-sso email" onClick={() => setEmailStep("email")}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 7l9 6 9-6"/></svg>
                  Sign up with email
                </button>
              </div>
              <button className="ob2-si-skip" onClick={() => onComplete(savePlant, false)}>I'll explore first</button>
            </>
          )}

          {emailStep === "email" && (
            <div className="ob2-email in">
              <input className="ob2-input" type="email" inputMode="email" autoFocus placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" />
              <button className="ob2-email-next" disabled={!/.+@.+\..+/.test(email)} onClick={() => setEmailStep("name")}>
                Continue
              </button>
              <button className="ob2-email-back" onClick={() => { setEmailStep(null); setEmail(""); }}>Back to other options</button>
            </div>
          )}

          {emailStep === "name" && (
            <div className="ob2-email in">
              <div className="ob2-email-cap">What should we call you?</div>
              <input className="ob2-input" autoFocus placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
              <button className="ob2-email-next" disabled={!name.trim()} onClick={() => onComplete(savePlant, true, { name: name.trim(), email: email.trim() })}>
                {plant ? `Save ${plant.nickname.split(" ")[0]} & finish` : "Create account"}
              </button>
              <button className="ob2-email-back" onClick={() => setEmailStep("email")}>Back</button>
            </div>
          )}

          {emailStep === "confirm" && (
            <div className="ob2-email in">
              <div className="ob2-email-cap">Confirm your details{provider === "apple" ? " from Apple" : provider === "google" ? " from Google" : ""}</div>
              <input className="ob2-input" autoFocus placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
              <input className="ob2-input" type="email" inputMode="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" style={{ marginTop: 10 }} />
              <button className="ob2-email-next" disabled={!name.trim() || !/.+@.+\..+/.test(email)} onClick={() => onComplete(savePlant, true, { name: name.trim(), email: email.trim() })}>
                {plant ? `Save ${plant.nickname.split(" ")[0]} & finish` : "Create account"}
              </button>
              <button className="ob2-email-back" onClick={() => { setEmailStep(null); setProvider(null); }}>Back to other options</button>
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}

/* onboarding scan — the two-photo capture + reveal, reused for the first-run magic */
function OnboardingScan({ hour, onIdentified, onCancel }) {
  return <AddPlantScreen onClose={onCancel} onAdd={onIdentified} skyHour={hour} firstRun={true} />;
}


function DynamicIsland({ activity, onDismiss, nudge, onNudgeTap }) {
  // A real iOS Live Activity: appears only when there's an active, time-bound event
  // worth surfacing at a glance (here: a plant was just watered). It animates in,
  // holds briefly, expands on tap, then auto-dismisses back to the plain notch.
  // Separately, a gentle persistent nudge invites saving an unsaved scanned plant.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!activity) { setOpen(false); return; }
    setOpen(true);
    const collapse = setTimeout(() => setOpen(false), 1600);
    return () => clearTimeout(collapse);
  }, [activity]);

  // A live watering activity takes priority over the ambient nudge.
  if (!activity && nudge) {
    return (
      <div className="di-wrap nudge" onClick={onNudgeTap}>
        <div className="di-pill">
          <span className="di-dot save" />
          <span className="di-mini">{nudge.nickname} unsaved · Sign in</span>
          <svg className="di-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(234,240,228,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </div>
      </div>
    );
  }

  if (!activity) return <div className="v-island" />;

  return (
    <div className={`di-wrap${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)}>
      {!open ? (
        <div className="di-pill">
          <span className="di-dot water" />
          <span className="di-mini">{activity.nickname} watered</span>
          <span className="di-gain">+{activity.gain}</span>
        </div>
      ) : (
        <div className="di-expanded">
          <div className="di-exp-head">
            <span className="di-live-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color.water} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-12.5Z" /></svg></span>
            <span className="di-exp-title">{activity.nickname} watered</span>
            <span className="di-exp-gain">+{activity.gain} health</span>
          </div>
          <div className="di-exp-sub">Next water in ~{activity.every} days · logged just now</div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   DESIGN SYSTEM — FULL SCREEN. An editorial, interactive reference that lives
   outside the phone frame. Click any token to copy it. Components are live.
========================================================================== */
function DesignSystemFullScreen({ onClose }) {
  const [copied, setCopied] = useState(null);
  const [toggles, setToggles] = useState({ water: true, health: true, weekly: false });
  const [pressed, setPressed] = useState(false);
  const copy = (label, value) => {
    try { navigator.clipboard && navigator.clipboard.writeText(value); } catch (e) {}
    setCopied({ label, value });
    clearTimeout(copy._t); copy._t = setTimeout(() => setCopied(null), 1700);
  };

  const colorGroups = [
    { title: "Brand", items: [["color.brand", color.brand], ["color.brandBright", color.brandBright], ["color.brandDeep", color.brandDeep], ["leaf300", palette.leaf300], ["leaf200", palette.leaf200], ["leaf100", palette.leaf100]] },
    { title: "Ink", items: [["color.ink", color.ink], ["color.inkSoft", color.inkSoft], ["color.inkFaint", color.inkFaint]] },
    { title: "Surface", items: [["color.surface", color.surface], ["color.surfaceRaised", color.surfaceRaised], ["color.surfaceAlt", color.surfaceAlt], ["color.surfaceWarm", color.surfaceWarm]] },
    { title: "Status", items: [["color.thriving", color.thriving], ["color.watch", color.watch], ["color.needsCare", color.needsCare], ["color.water", color.water]] },
  ];
  const typeSteps = Object.entries(ds.size).sort((a, b) => a[1] - b[1]);
  const spaceSteps = Object.entries(space).filter(([, v]) => v > 0);
  const radiusSteps = Object.entries(radius).filter(([k]) => k !== "device");
  const shadowSteps = [["e1", shadow.e1], ["e2", shadow.e2], ["e3", shadow.e3], ["e4", shadow.e4], ["e5", shadow.e5]];
  const easings = Object.entries(motion.easing);
  const nav = [["color", "Color"], ["type", "Type"], ["scale", "Scale"], ["elevation", "Elevation"], ["motion", "Motion"], ["components", "Components"]];
  const jumpTo = (id) => document.getElementById("dsf-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const Swatch = ({ name, hex }) => {
    const dark = ["color.ink", "color.brand", "color.brandDeep", "color.thriving", "color.needsCare", "color.watch", "color.water", "color.inkSoft"].includes(name);
    return (
      <button className="dsf-swatch" onClick={() => copy(name, hex)} title="Click to copy">
        <span className="dsf-chip" style={{ background: hex }}><span className="dsf-chip-copy" style={{ color: dark ? "#fff" : color.ink }}>copy</span></span>
        <span className="dsf-swatch-name">{name}</span>
        <span className="dsf-swatch-hex">{hex}</span>
      </button>
    );
  };
  const Section = ({ id, kicker, title, children }) => (
    <section id={"dsf-" + id} className="dsf-section">
      <div className="dsf-kicker">{kicker}</div>
      <h2 className="dsf-h2">{title}</h2>
      {children}
    </section>
  );

  return (
    <div className="dsf-root">
      <style>{dsfCss}</style>

      {/* top bar */}
      <header className="dsf-bar">
        <div className="dsf-brand"><span className="dsf-brand-mark" />VERDURE<span className="dsf-brand-sub">Design System</span></div>
        <nav className="dsf-nav">{nav.map(([id, label]) => <button key={id} onClick={() => jumpTo(id)}>{label}</button>)}</nav>
        <button className="dsf-close" onClick={onClose} aria-label="Close design system">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      {/* hero */}
      <div className="dsf-hero">
        <div className="dsf-hero-glow" />
        <div className="dsf-hero-inner">
          <div className="dsf-kicker dsf-hero-kicker">Living styleguide</div>
          <h1 className="dsf-hero-title">The system behind<br /><em>Verdure</em>.</h1>
          <p className="dsf-hero-sub">Every color, size, and motion the app is built from — organized, named, and one click from your clipboard.</p>
          <div className="dsf-stats">
            {[["12", "type steps"], ["60+", "colors"], ["7", "radii"], ["5", "elevations"], ["3", "easings"]].map(([n, l]) => (
              <div key={l} className="dsf-stat"><div className="dsf-stat-n">{n}</div><div className="dsf-stat-l">{l}</div></div>
            ))}
          </div>
        </div>
      </div>

      <main className="dsf-main">
        {/* COLOR */}
        <Section id="color" kicker="Foundations" title="Color">
          {colorGroups.map((g) => (
            <div key={g.title} className="dsf-cgroup">
              <div className="dsf-cgroup-title">{g.title}</div>
              <div className="dsf-swatches">{g.items.map(([n, h]) => <Swatch key={n} name={n} hex={h} />)}</div>
            </div>
          ))}
        </Section>

        {/* TYPE */}
        <Section id="type" kicker="Foundations" title="Typography">
          <div className="dsf-panel">
            {typeSteps.map(([name, px]) => (
              <button key={name} className="dsf-type-row" onClick={() => copy("ds.size." + name, px + "px")} title="Click to copy">
                <span className="dsf-type-spec" style={{ fontSize: Math.min(px, 44) }}>Verdant garden</span>
                <span className="dsf-type-meta"><b>{name}</b>{px}px</span>
              </button>
            ))}
          </div>
          <div className="dsf-weights">
            {Object.entries(ds.weight).map(([name, w]) => (
              <button key={name} className="dsf-weight" onClick={() => copy("ds.weight." + name, String(w))} title="Click to copy">
                <span style={{ fontWeight: w, fontSize: 26 }}>Aa</span><span className="dsf-weight-l">{name} · {w}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* SCALE: spacing + radius */}
        <Section id="scale" kicker="Foundations" title="Spacing & Radius">
          <div className="dsf-two">
            <div className="dsf-panel dsf-grow">
              <div className="dsf-sub">Spacing</div>
              {spaceSteps.map(([name, v]) => (
                <div key={name} className="dsf-space-row"><span className="dsf-space-n">{name}</span><span className="dsf-space-bar" style={{ width: v }} /><span className="dsf-space-v">{v}px</span></div>
              ))}
            </div>
            <div className="dsf-panel dsf-grow">
              <div className="dsf-sub">Radius</div>
              <div className="dsf-radii">
                {radiusSteps.map(([name, v]) => (
                  <div key={name} className="dsf-radius"><div className="dsf-radius-box" style={{ borderRadius: Math.min(v, 30) }} /><span>{name}</span><small>{v}px</small></div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ELEVATION */}
        <Section id="elevation" kicker="Foundations" title="Elevation">
          <div className="dsf-elevs">
            {shadowSteps.map(([name, sh]) => (
              <div key={name} className="dsf-elev"><div className="dsf-elev-box" style={{ boxShadow: sh }} /><span>shadow.{name}</span></div>
            ))}
          </div>
        </Section>

        {/* MOTION */}
        <Section id="motion" kicker="Foundations" title="Motion">
          <p className="dsf-note">Hover a track — the dot travels with that easing. Named durations keep the app's rhythm consistent.</p>
          <div className="dsf-panel">
            {easings.map(([name, curve]) => (
              <div key={name} className="dsf-motion-row">
                <span className="dsf-motion-name">easing.{name}</span>
                <div className="dsf-track"><span className="dsf-dot" style={{ transitionTimingFunction: curve }} /></div>
                <span className="dsf-motion-curve">{curve}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* COMPONENTS */}
        <Section id="components" kicker="Built from tokens" title="Components">
          <div className="dsf-comp-grid">
            <div className="dsf-card">
              <div className="dsf-sub">Buttons</div>
              <div className="dsf-btn-row">
                <button className="dsf-btn dsf-btn-primary" onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)} onMouseLeave={() => setPressed(false)}>Primary</button>
                <button className="dsf-btn dsf-btn-secondary">Secondary</button>
                <button className="dsf-btn dsf-btn-ghost">Ghost</button>
                <button className="dsf-btn dsf-btn-primary" disabled>Disabled</button>
              </div>
            </div>
            <div className="dsf-card">
              <div className="dsf-sub">Toggles <span className="dsf-live">live</span></div>
              {[["water", "Watering reminders"], ["health", "Health alerts"], ["weekly", "Weekly digest"]].map(([k, label]) => (
                <button key={k} className="dsf-toggle-row" role="switch" aria-checked={toggles[k]} onClick={() => setToggles((t) => ({ ...t, [k]: !t[k] }))}>
                  <span>{label}</span>
                  <span className={`dsf-switch${toggles[k] ? " on" : ""}`}><span className="dsf-knob" /></span>
                </button>
              ))}
            </div>
            <div className="dsf-card">
              <div className="dsf-sub">Status</div>
              <div className="dsf-pills">
                {[["Thriving", color.thriving, color.thrivingText], ["Watch", color.watch, color.watchText], ["Needs care", color.needsCare, color.needsCareText], ["Water", color.water, color.waterText]].map(([lbl, dot, txt]) => (
                  <span key={lbl} className="dsf-pill" style={{ background: `${dot}22`, color: txt }}><span className="dsf-pill-dot" style={{ background: dot }} />{lbl}</span>
                ))}
              </div>
            </div>
            <div className="dsf-card">
              <div className="dsf-sub">Input</div>
              <input className="dsf-input" placeholder="Search plants…" aria-label="Demo search" />
            </div>
          </div>
        </Section>

        <footer className="dsf-footer">
          <span>Verdure Design System</span>
          <span>Source of truth · <code>src/tokens.js</code></span>
        </footer>
      </main>

      {/* copy toast */}
      <div className={`dsf-toast${copied ? " show" : ""}`}>
        {copied && <><span className="dsf-toast-swatch" style={{ background: copied.value?.[0] === "#" ? copied.value : color.brand }} />Copied <b>{copied.label}</b> · {copied.value}</>}
      </div>
    </div>
  );
}

const dsfCss = `
  .dsf-root { position: fixed; inset: 0; z-index: 200; overflow-y: auto; background: ${color.surface};
    color: ${color.ink}; font-family: ${ds.family}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    animation: dsfIn .4s ease; }
  @keyframes dsfIn { from { opacity: 0; } to { opacity: 1; } }
  .dsf-root *, .dsf-root *::before, .dsf-root *::after { box-sizing: border-box; }
  .dsf-root button { font-family: inherit; cursor: pointer; }
  .dsf-kicker { font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: ${color.brandBright}; }

  /* top bar */
  .dsf-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 24px;
    padding: 14px 28px; background: ${color.surface}e8; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid ${color.line}; }
  .dsf-brand { display: flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: 0.14em; font-size: 14px; }
  .dsf-brand-mark { width: 20px; height: 20px; border-radius: 50%; background: ${color.brand}; box-shadow: inset 0 0 0 3px ${color.surface}, 0 0 0 1.5px ${color.brand}; }
  .dsf-brand-sub { font-weight: 500; letter-spacing: 0; font-size: 12.5px; color: ${color.inkFaint}; margin-left: 2px; }
  .dsf-nav { display: flex; gap: 4px; margin-left: auto; flex-wrap: wrap; }
  .dsf-nav button { border: none; background: none; color: ${color.inkSoft}; font-size: 13.5px; font-weight: 600; padding: 7px 12px; border-radius: 100px; transition: background .15s, color .15s; }
  .dsf-nav button:hover { background: ${color.brand}14; color: ${color.brand}; }
  .dsf-close { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; border: 1px solid ${color.line}; background: ${color.surfaceRaised}; color: ${color.ink}; transition: transform .15s, background .15s; }
  .dsf-close:hover { transform: rotate(90deg); background: ${color.brand}; color: #fff; }

  /* hero */
  .dsf-hero { position: relative; overflow: hidden; padding: clamp(56px, 9vw, 120px) 28px clamp(48px, 7vw, 96px); border-bottom: 1px solid ${color.line}; }
  .dsf-hero-glow { position: absolute; top: -30%; right: -10%; width: 60vw; height: 120%; pointer-events: none;
    background: radial-gradient(closest-side, ${color.brand}22, transparent 70%); }
  .dsf-hero-inner { position: relative; max-width: 1080px; margin: 0 auto; }
  .dsf-hero-kicker { margin-bottom: 18px; }
  .dsf-hero-title { font-size: clamp(40px, 7vw, 84px); font-weight: 800; line-height: 1.02; letter-spacing: -0.03em; margin: 0; }
  .dsf-hero-title em { font-style: italic; font-weight: 500; color: ${color.brand}; }
  .dsf-hero-sub { max-width: 520px; margin: 22px 0 0; font-size: clamp(15px, 1.6vw, 18px); font-weight: 500; line-height: 1.55; color: ${color.inkSoft}; }
  .dsf-stats { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 40px; }
  .dsf-stat { padding: 16px 22px; border-radius: 18px; background: ${color.surfaceRaised}; border: 1px solid ${color.line}; box-shadow: ${shadow.e1}; }
  .dsf-stat-n { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; }
  .dsf-stat-l { font-size: 12.5px; font-weight: 600; color: ${color.inkFaint}; margin-top: 2px; }

  .dsf-main { max-width: 1080px; margin: 0 auto; padding: 0 28px 80px; }
  .dsf-section { padding: clamp(48px, 6vw, 84px) 0 0; scroll-margin-top: 76px; }
  .dsf-h2 { font-size: clamp(28px, 4vw, 44px); font-weight: 800; letter-spacing: -0.02em; margin: 8px 0 28px; }
  .dsf-sub { font-size: 12.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${color.inkFaint}; margin-bottom: 14px; }
  .dsf-note { font-size: 14.5px; color: ${color.inkSoft}; margin: -12px 0 22px; max-width: 560px; line-height: 1.5; }
  .dsf-panel { background: ${color.surfaceRaised}; border: 1px solid ${color.line}; border-radius: 20px; padding: 10px 22px; box-shadow: ${shadow.e1}; }
  .dsf-two { display: flex; gap: 20px; flex-wrap: wrap; }
  .dsf-grow { flex: 1 1 320px; }

  /* color swatches */
  .dsf-cgroup { margin-bottom: 28px; }
  .dsf-cgroup-title { font-size: 15px; font-weight: 700; margin-bottom: 14px; }
  .dsf-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .dsf-swatch { text-align: left; border: 1px solid ${color.line}; background: ${color.surfaceRaised}; border-radius: 16px; padding: 10px; display: flex; flex-direction: column; gap: 3px; transition: transform .16s ${motion.easing.spring}, box-shadow .16s; }
  .dsf-swatch:hover { transform: translateY(-4px); box-shadow: ${shadow.e2}; }
  .dsf-chip { position: relative; height: 68px; border-radius: 11px; border: 1px solid ${color.line}; margin-bottom: 8px; overflow: hidden; display: grid; place-items: center; }
  .dsf-chip-copy { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0; transition: opacity .16s; }
  .dsf-swatch:hover .dsf-chip-copy { opacity: 0.9; }
  .dsf-swatch-name { font-size: 13px; font-weight: 700; }
  .dsf-swatch-hex { font-size: 12px; font-weight: 600; color: ${color.inkFaint}; text-transform: uppercase; letter-spacing: 0.03em; }

  /* type */
  .dsf-type-row { display: flex; align-items: baseline; gap: 18px; width: 100%; text-align: left; border: none; background: none; padding: 12px 0; border-bottom: 1px solid ${color.line}; transition: padding-left .16s; }
  .dsf-type-row:last-child { border-bottom: none; }
  .dsf-type-row:hover { padding-left: 8px; }
  .dsf-type-spec { flex: 1; font-weight: 700; line-height: 1.1; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${color.ink}; }
  .dsf-type-meta { display: flex; gap: 10px; font-size: 13px; font-weight: 600; color: ${color.inkFaint}; flex-shrink: 0; }
  .dsf-type-meta b { color: ${color.inkSoft}; }
  .dsf-weights { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
  .dsf-weight { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; border: 1px solid ${color.line}; background: ${color.surfaceRaised}; border-radius: 14px; padding: 12px 16px; transition: transform .15s; }
  .dsf-weight:hover { transform: translateY(-3px); }
  .dsf-weight-l { font-size: 12px; font-weight: 600; color: ${color.inkFaint}; }

  /* spacing + radius */
  .dsf-space-row { display: flex; align-items: center; gap: 14px; padding: 6px 0; }
  .dsf-space-n { font-size: 13px; font-weight: 700; color: ${color.inkSoft}; min-width: 26px; }
  .dsf-space-bar { height: 12px; background: ${color.brandBright}; border-radius: 4px; }
  .dsf-space-v { font-size: 13px; font-weight: 600; color: ${color.inkFaint}; }
  .dsf-radii { display: flex; flex-wrap: wrap; gap: 14px; }
  .dsf-radius { text-align: center; }
  .dsf-radius-box { width: 58px; height: 58px; background: ${color.brand}; margin-bottom: 6px; }
  .dsf-radius span { display: block; font-size: 12.5px; font-weight: 700; }
  .dsf-radius small { font-size: 12px; color: ${color.inkFaint}; }

  /* elevation */
  .dsf-elevs { display: flex; flex-wrap: wrap; gap: 28px; }
  .dsf-elev { text-align: center; }
  .dsf-elev-box { width: 120px; height: 78px; background: ${color.surfaceRaised}; border-radius: 16px; margin-bottom: 12px; }
  .dsf-elev span { font-size: 12.5px; font-weight: 600; color: ${color.inkSoft}; }

  /* motion */
  .dsf-motion-row { display: flex; align-items: center; gap: 18px; padding: 14px 0; border-bottom: 1px solid ${color.line}; }
  .dsf-motion-row:last-child { border-bottom: none; }
  .dsf-motion-name { font-size: 13.5px; font-weight: 700; min-width: 130px; }
  .dsf-track { flex: 1; height: 10px; background: ${color.brand}14; border-radius: 100px; position: relative; }
  .dsf-dot { position: absolute; top: -5px; left: 0; width: 20px; height: 20px; border-radius: 50%; background: ${color.brand}; box-shadow: ${shadow.e2}; transition: left .7s; }
  .dsf-motion-row:hover .dsf-dot { left: calc(100% - 20px); }
  .dsf-motion-curve { font-size: 11.5px; font-weight: 600; color: ${color.inkFaint}; min-width: 150px; text-align: right; font-variant-numeric: tabular-nums; }

  /* components */
  .dsf-comp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
  .dsf-card { background: ${color.surfaceRaised}; border: 1px solid ${color.line}; border-radius: 20px; padding: 22px; box-shadow: ${shadow.e1}; }
  .dsf-live { font-size: 9.5px; font-weight: 800; letter-spacing: 0.08em; color: ${color.brand}; background: ${color.brand}1e; padding: 2px 6px; border-radius: 100px; vertical-align: middle; margin-left: 6px; }
  .dsf-btn-row { display: flex; flex-wrap: wrap; gap: 10px; }
  .dsf-btn { height: 44px; padding: 0 20px; border-radius: 100px; font-size: 14.5px; font-weight: 700; border: 1px solid transparent; transition: transform .12s, filter .15s, box-shadow .15s; }
  .dsf-btn:active { transform: scale(0.96); }
  .dsf-btn-primary { background: ${color.brand}; color: #fff; box-shadow: ${shadow.e2}; }
  .dsf-btn-primary:hover { filter: brightness(1.08); }
  .dsf-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
  .dsf-btn-secondary { background: ${color.surface}; color: ${color.ink}; border-color: ${color.lineStrong}; }
  .dsf-btn-secondary:hover { background: ${color.brand}0e; }
  .dsf-btn-ghost { background: none; color: ${color.brand}; }
  .dsf-btn-ghost:hover { background: ${color.brand}12; }
  .dsf-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; text-align: left; background: none; border: none; padding: 12px 0; border-top: 1px solid ${color.line}; font-size: 14px; font-weight: 600; color: ${color.ink}; }
  .dsf-toggle-row:first-of-type { border-top: none; }
  .dsf-switch { width: 44px; height: 26px; border-radius: 100px; background: ${color.inkFaint}44; position: relative; transition: background .22s; flex-shrink: 0; }
  .dsf-switch.on { background: ${color.brand}; }
  .dsf-knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: left .22s ${motion.easing.spring}; }
  .dsf-switch.on .dsf-knob { left: 21px; }
  .dsf-pills { display: flex; flex-wrap: wrap; gap: 8px; }
  .dsf-pill { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 13px; border-radius: 100px; font-size: 13px; font-weight: 700; }
  .dsf-pill-dot { width: 8px; height: 8px; border-radius: 50%; }
  .dsf-input { width: 100%; height: 46px; border-radius: 12px; border: 1px solid ${color.lineStrong}; background: ${color.surface}; padding: 0 16px; font-size: 15px; font-weight: 500; color: ${color.ink}; outline: none; transition: border-color .18s, box-shadow .18s; }
  .dsf-input:focus { border-color: ${color.brand}; box-shadow: 0 0 0 3px ${color.brand}22; }

  .dsf-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 72px; padding-top: 28px; border-top: 1px solid ${color.line}; font-size: 13px; font-weight: 600; color: ${color.inkFaint}; }
  .dsf-footer code { background: ${color.brand}12; color: ${color.brand}; padding: 2px 7px; border-radius: 6px; font-size: 12.5px; }

  /* copy toast */
  .dsf-toast { position: fixed; left: 50%; bottom: 28px; transform: translate(-50%, 20px); z-index: 20;
    display: flex; align-items: center; gap: 9px; padding: 12px 18px; border-radius: 100px;
    background: ${color.ink}; color: #fff; font-size: 13.5px; font-weight: 600; box-shadow: ${shadow.e4};
    opacity: 0; pointer-events: none; transition: opacity .22s, transform .22s ${motion.easing.spring}; }
  .dsf-toast.show { opacity: 1; transform: translate(-50%, 0); }
  .dsf-toast b { font-weight: 800; }
  .dsf-toast-swatch { width: 16px; height: 16px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.3); }

  @media (max-width: 640px) { .dsf-nav { display: none; } }
  @media (prefers-reduced-motion: reduce) { .dsf-root *, .dsf-dot { animation: none !important; transition: none !important; } }
`;

export default function VerdureApp() {
  const realHour = new Date().getHours() + new Date().getMinutes() / 60;
  const [hour, setHour] = useState(realHour);
  const [auto, setAuto] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [plants, setPlants] = useState(INITIAL);
  const [favorites, setFavorites] = useState({}); // id -> true
  const toggleFavorite = (id) => setFavorites((f) => ({ ...f, [id]: !f[id] }));
  const [liveActivity, setLiveActivity] = useState(null);
  const [signedIn, setSignedIn] = useState(false);
  const [account, setAccount] = useState(null); // { name, email } from sign-in
  const [unsavedNudge, setUnsavedNudge] = useState(null); // { nickname, plant } when user skipped sign-in with a scanned plant
  const [resumeSignin, setResumeSignin] = useState(null); // plant data to resume sign-in with (from nudge tap)
  useEffect(() => {
    if (!liveActivity) return;
    const t = setTimeout(() => setLiveActivity(null), 4200);
    return () => clearTimeout(t);
  }, [liveActivity]);
  const [doneTasks, setDoneTasks] = useState({});
  const markTaskDone = (id) => setDoneTasks((d) => ({ ...d, [id]: true }));
  const [tab, setTab] = useState("home"); // home | rooms | reminders | profile
  const [phase, setPhase] = useState("splash"); // splash | onboarding | app
  const [stack, setStack] = useState([]); // navigation stack of overlays on top of the current tab
  const rafRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!auto) return;
    let last = performance.now();
    const loop = (now) => { const dt = (now - last) / 1000; last = now; setHour((h) => (h + dt * 2.2) % 24); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [auto]);

  // Scale the phone to fill the viewport at any window size (preview framing).
  const [phoneScale, setPhoneScale] = useState(1);
  const [dsFull, setDsFull] = useState(false); // full-screen design system
  useEffect(() => {
    const PW = 402, PH = 874, PAD = 20; // frame footprint + a little breathing room
    const fit = () => setPhoneScale(0.98 * Math.min((window.innerWidth - PAD) / PW, (window.innerHeight - PAD) / PH));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const top = stack[stack.length - 1] || null;
  const [exiting, setExiting] = useState(null);
  const selectedPlant = top?.type === "detail" ? plants.find((p) => p.id === top.id) : null;
  const exitingPlant = exiting?.type === "detail" ? plants.find((p) => p.id === exiting.id) : null;

  function push(entry) { setStack((s) => [...s, entry]); }
  function back() {
    setStack((s) => {
      const leaving = s[s.length - 1];
      if (leaving) {
        setExiting(leaving);
        setTimeout(() => setExiting(null), 340);
      }
      return s.slice(0, -1);
    });
  }
  function resetTo(t) { setStack([]); setExiting(null); setTab(t); }

  function openPlant(id) { push({ type: "detail", id }); }
  function openAllPlants() { push({ type: "allplants" }); }
  function openAdd() { push({ type: "add" }); }
  function waterPlant(id) {
    const prevP = plants.find((x) => x.id === id);
    setPlants((prev) => prev.map((p) => p.id === id ? { ...p, health: Math.min(99, p.health + 10), status: statusOf(Math.min(99, p.health + 10)), lastWatered: "0 days ago" } : p));
    if (prevP) {
      const gain = Math.min(99, prevP.health + 10) - prevP.health;
      setLiveActivity({ nickname: prevP.nickname, gain, every: waterEveryFor(prevP.speciesKey), at: Date.now() });
    }
  }
  function restorePlant(snap) {
    setPlants((prev) => prev.map((p) => p.id === snap.id ? { ...p, health: snap.health, status: snap.status, lastWatered: snap.lastWatered } : p));
  }
  // Water via a to-do task: waters + ticks the task in one go.
  function waterTask(plantId, taskId) {
    const prevP = plants.find((x) => x.id === plantId);
    if (!prevP) return;
    const nh = Math.min(99, prevP.health + 10);
    setPlants((prev) => prev.map((p) => p.id === plantId ? { ...p, health: nh, status: statusOf(nh), lastWatered: "0 days ago" } : p));
    setDoneTasks((d) => ({ ...d, [taskId]: true }));
    setLiveActivity({ nickname: prevP.nickname, gain: nh - prevP.health, every: waterEveryFor(prevP.speciesKey), at: Date.now() });
  }
  function waterTasks(list) {
    const ids = list.map((t) => t.plant.id);
    setPlants((prev) => prev.map((p) => {
      if (!ids.includes(p.id)) return p;
      const nh = Math.min(99, p.health + 10);
      return { ...p, health: nh, status: statusOf(nh), lastWatered: "0 days ago" };
    }));
    setDoneTasks((d) => { const n = { ...d }; list.forEach((t) => { n[t.id] = true; }); return n; });
  }
  function addJournalPhoto(id) {
    setPlants((prev) => prev.map((p) => p.id === id ? { ...p, journal: [{ id: `j-${Date.now()}`, when: "Just now", note: "Progress photo added", health: p.health }, ...p.journal] } : p));
  }
  function movePlant(id, room) {
    setPlants((prev) => prev.map((p) => p.id === id ? { ...p, room } : p));
  }
  function addPlant({ speciesKey, health, room, nickname }) {
    const id = `new-${Date.now()}`;
    setPlants((prev) => [...prev, makePlant(id, speciesKey, health, room, nickname)]);
    setStack([]); setTab("home");
  }
  function removePlant(id) {
    setPlants((prev) => prev.filter((p) => p.id !== id));
    setStack([]); // pop out of the detail overlay back to the underlying tab
  }

  // ---- account actions (signed-in) ----
  function updateAccount(patch) { setAccount((a) => ({ ...(a || {}), ...patch })); }
  function deleteAccount() {
    setSignedIn(false); setAccount(null); setStack([]); setTab("home"); setPhase("onboarding");
  }
  function goSignIn() { setResumeSignin(unsavedNudge?.plant || { signInOnly: true }); setPhase("onboarding"); }

  const isDarkChrome = tab === "home" || top?.type === "add";
  const NAV = [
    { id: "home", label: "Garden", icon: <><path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></> },
    { id: "rooms", label: "Rooms", icon: <><path d="M3 21V9l9-6 9 6v12M3 21h18M9 21v-6h6v6" /></> },
    { id: "reminders", label: "Activity", icon: <><path d="M3 12h4l2.5-7 5 14L17 12h4" /></> },
    { id: "profile", label: "Profile", icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></> },
  ];
  // The sliding pill ("glider") travels + stretches between tabs. Its position is
  // measured from the active tab's box. If that measurement hasn't landed yet (or
  // can't), `ready` stays false and the active tab keeps its OWN pill (a plain
  // background — see .nav-item.active) so it's always legible and never dark-on-dark.
  // Once the glider is ready, the bar gets `has-glider` and the per-tab background
  // steps aside so the single sliding pill is what you see.
  const navWrapRef = useRef(null);
  const tabRefs = useRef({});
  const [glider, setGlider] = useState({ left: 0, width: 0, ready: false });
  useLayoutEffect(() => {
    let raf1 = 0, raf2 = 0;
    const measure = () => {
      const el = tabRefs.current[tab];
      if (!el) return;
      // offsetLeft/offsetWidth are LAYOUT metrics — unaffected by the preview
      // scale transform on the phone shell — and are relative to the glider's
      // own offset parent (the nav bar). Using getBoundingClientRect here would
      // return scaled pixels that then get scaled again inside the transformed
      // subtree, sizing the pill too small (label overflows).
      const width = el.offsetWidth;
      if (width === 0) return; // not laid out yet — a later pass will catch it
      setGlider({ left: el.offsetLeft, width, ready: true });
    };
    // measure now (pre-paint), next two frames, after font load, and after a settle —
    // whichever lands first flips `ready`; the rest keep it snapped as the label reflows.
    measure();
    raf1 = requestAnimationFrame(() => { measure(); raf2 = requestAnimationFrame(measure); });
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {});
    const settle = setTimeout(measure, 160);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(settle); window.removeEventListener("resize", measure); };
  }, [tab, stack]);

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", background: "transparent", minHeight: "100vh", fontFamily: "Manrope, sans-serif" }}>
      {dsFull && <DesignSystemFullScreen onClose={() => setDsFull(false)} />}
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        h1, h2, h3, h4, h5, h6 { margin: 0; font-size: inherit; font-weight: inherit; line-height: inherit; }
        /* keyboard focus only — pointer taps stay clean */
        .v-phone :focus-visible:not(input):not(textarea):not(select) { outline: 2.5px solid ${T.mossBright}; outline-offset: 2px; border-radius: 8px; }
        .v-phone .dz :focus-visible:not(input):not(textarea), .v-phone .apx :focus-visible:not(input):not(textarea), .v-phone .ap-viewfinder :focus-visible:not(input):not(textarea) { outline-color: ${palette.onDarkAlt}; }
        .v-phone { width: 402px; height: 874px; border-radius: 55px; overflow: hidden; position: relative; background: ${T.bg};
          box-shadow: 0 0 0 9px ${color.chrome}, 0 40px 80px rgba(0,0,0,0.6); }
        /* The app UI is authored for a 390x844 canvas (its original tuning). Render
           it at that size and scale to the iPhone 17 Pro's 402x874 screen so density,
           wrapping, and proportions match the original inside the larger frame. */
        .v-app { position: absolute; top: 0; left: 0; width: 390px; height: 844px;
          transform-origin: top left; transform: scale(${402/390}, ${874/844}); }
        .v-island { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); width: 120px; height: 34px; background: ${color.chrome}; border-radius: 20px; z-index: 80; }

        /* ---------- HARDWARE BUTTONS (iPhone 17 Pro) ---------- */
        .v-stage { width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; }
        .v-phone-shell { position: relative; transform-origin: center; }
        .v-btn { position: absolute; width: 4px; background: linear-gradient(90deg, ${color.chromeDeep}, ${palette.black700} 55%, ${color.chromeDeep}); box-shadow: 0 1px 2px rgba(0,0,0,0.4); z-index: 5; }
        .v-btn.left { left: -12px; border-radius: 3px 0 0 3px; }
        .v-btn.right { right: -12px; border-radius: 0 3px 3px 0; }
        .v-btn-action { top: 150px; height: 34px; }   /* Action button */
        .v-btn-volup  { top: 204px; height: 58px; }    /* Volume up */
        .v-btn-voldn  { top: 274px; height: 58px; }    /* Volume down */
        .v-btn-side   { top: 210px; height: 96px; }    /* Side / power button */
        .v-btn-cam    { top: 338px; height: 42px; }    /* Camera Control */

        /* ---------- DYNAMIC ISLAND (live activity) ---------- */
        .di-wrap { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 60; cursor: pointer;
          background: ${color.chrome}; border-radius: 20px; overflow: hidden; transition: width .38s cubic-bezier(.3,1.3,.4,1), height .38s cubic-bezier(.3,1.3,.4,1), border-radius .38s ease;
          width: 120px; height: 34px; }
        .di-wrap:not(.open) { width: 210px; }
        .di-wrap.open { width: 300px; height: 78px; border-radius: 24px; }
        .di-pill { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 13px; }
        .di-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .di-dot.urgent { background: ${color.needsCareSoft}; box-shadow: 0 0 8px ${color.needsCareSoft}; animation: diPulse 1.6s ease-in-out infinite; }
        .di-dot.water { background: ${color.water}; box-shadow: 0 0 8px ${color.water}; animation: diPulse 1.6s ease-in-out infinite; }
        .di-dot.save { background: ${color.watchSoft}; box-shadow: 0 0 8px ${color.watchSoft}; }
        .di-wrap.nudge { width: 236px; }
        .di-chev { flex-shrink: 0; }
        @keyframes diPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .di-mini { font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 600; color: ${color.onDark}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .di-gain { font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 800; color: ${color.chrome}; background: ${color.waterSoft}; border-radius: 100px; min-width: 22px; height: 18px; display: flex; align-items: center; justify-content: center; padding: 0 6px; }
        .di-expanded { padding: 14px 18px; opacity: 0; animation: diFade .3s ease .12s forwards; }
        @keyframes diFade { to { opacity: 1; } }
        .di-exp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .di-live-ic { display: flex; flex-shrink: 0; }
        .di-exp-title { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 800; color: ${color.onDark}; flex: 1; }
        .di-exp-gain { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 800; color: ${color.waterSoft}; }
        .di-exp-sub { font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 500; color: rgba(234,240,228,0.55); }

        /* ---------- SPLASH ---------- */
        .sp-root { position: absolute; inset: 0; z-index: 70; background: radial-gradient(120% 100% at 50% 30%, ${color.brandDeep} 0%, ${palette.black780} 70%); display: flex; flex-direction: column; align-items: center; justify-content: center;
          transition: opacity .5s ease; }
        .sp-root.leaving { opacity: 0; }
        .sp-glowfield { position: absolute; top: 26%; left: 50%; width: 300px; height: 300px; transform: translate(-50%,-50%); background: radial-gradient(circle, rgba(90,140,90,0.28), transparent 65%); animation: spGlow 3s ease-in-out infinite; }
        @keyframes spGlow { 0%,100% { opacity: 0.6; transform: translate(-50%,-50%) scale(1); } 50% { opacity: 1; transform: translate(-50%,-50%) scale(1.12); } }
        .sp-mark { position: relative; z-index: 2; }
        .sp-ring { animation: spRing 2.4s ease-out forwards; transform-origin: center; opacity: 0; }
        @keyframes spRing { 0% { opacity: 0; transform: scale(0.6) rotate(-40deg); } 40% { opacity: 1; } 100% { opacity: 1; transform: scale(1) rotate(0); } }
        .sp-stem { stroke-dasharray: 34; stroke-dashoffset: 34; animation: spDraw 0.9s ease-out .35s forwards; }
        @keyframes spDraw { to { stroke-dashoffset: 0; } }
        .sp-leaf { opacity: 0; transform-box: fill-box; transform-origin: bottom center; }
        .sp-leaf-l { animation: spLeaf .6s cubic-bezier(.2,1.5,.4,1) 1s forwards; }
        .sp-leaf-r { animation: spLeaf .6s cubic-bezier(.2,1.5,.4,1) 1.2s forwards; }
        @keyframes spLeaf { 0% { opacity: 0; transform: scale(0.2) rotate(-10deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
        .sp-seed { animation: spSeed .5s ease-out forwards; opacity: 0; }
        @keyframes spSeed { to { opacity: 1; } }
        .sp-word { position: relative; z-index: 2; font-family: 'Manrope', sans-serif; font-size: 34px; font-weight: 700; letter-spacing: 0.24em; padding-left: 0.24em; color: ${color.onDark}; margin-top: 26px; opacity: 0; animation: spRise .7s ease-out 1.4s forwards; }
        .sp-rule { position: relative; z-index: 2; width: 28px; height: 1px; background: rgba(234,240,228,0.32); margin-top: 9px; opacity: 0; animation: spRise .7s ease-out 1.6s forwards; }
        .sp-tag { position: relative; z-index: 2; font-family: 'Manrope', sans-serif; text-transform: uppercase; font-size: 10.5px; font-weight: 600; letter-spacing: 0.28em; padding-left: 0.28em; color: rgba(234,240,228,0.5); margin-top: 8px; opacity: 0; animation: spRise .7s ease-out 1.8s forwards; }
        @keyframes spRise { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }

        /* ---------- ONBOARDING ---------- */
        /* ===== SCAN-FIRST ONBOARDING ===== */
        .ob2-root { position: absolute; inset: 0; z-index: 65; overflow: hidden; }
        .ob2-veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(11,12,9,0.15) 0%, rgba(11,12,9,0.45) 60%, rgba(11,12,9,0.72) 100%); z-index: 1; }
        .ob2-welcome, .ob2-signin { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 34px; text-align: center; }
        .ob2-welcome { opacity: 0; transform: translateY(14px); transition: opacity .9s ease, transform .9s ease; }
        .ob2-welcome.in { opacity: 1; transform: translateY(0); }
        .ob2-mark { width: 124px; height: 124px; border-radius: 34px; background: rgba(255,255,255,0.1); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; margin-bottom: 30px; box-shadow: 0 16px 44px rgba(0,0,0,0.3); }
        .ob2-stem { stroke-dasharray: 34; stroke-dashoffset: 34; animation: spDraw .9s ease-out .5s forwards; }
        .ob2-leaf { opacity: 0; transform-box: fill-box; transform-origin: bottom center; }
        .ob2-leaf-l { animation: spLeaf .6s cubic-bezier(.2,1.5,.4,1) 1.05s forwards; }
        .ob2-leaf-r { animation: spLeaf .6s cubic-bezier(.2,1.5,.4,1) 1.25s forwards; }
        .ob2-w-title { font-family: 'Manrope', sans-serif; font-size: 30px; font-weight: 800; letter-spacing: -0.02em; color: ${palette.white}; margin-bottom: 14px; text-shadow: 0 2px 20px rgba(0,0,0,0.3); }
        .ob2-w-sub { font-family: 'Manrope', sans-serif; font-size: 15.5px; font-weight: 500; color: rgba(255,255,255,0.82); line-height: 1.55; max-width: 310px; margin-bottom: 34px; text-shadow: 0 1px 10px rgba(0,0,0,0.3); }
        .ob2-scan-btn { display: flex; align-items: center; justify-content: center; gap: 10px; height: 56px; padding: 0 30px; border-radius: 100px; border: none; background: ${palette.white}; color: ${T.ink}; font-family: 'Manrope', sans-serif; font-size: 16.5px; font-weight: 700; cursor: pointer; box-shadow: 0 12px 34px rgba(0,0,0,0.28); transition: transform .16s ease; }
        .ob2-scan-btn:active { transform: scale(0.96); }
        .ob2-w-foot { font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.62); margin-top: 18px; }
        /* earned sign-in */
        .ob2-signin { animation: ob2In .6s cubic-bezier(.2,.9,.3,1); }
        @keyframes ob2In { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
        .ob2-si-plant { margin-bottom: 20px; filter: drop-shadow(0 18px 40px rgba(0,0,0,0.4)); animation: ob2Plant .7s cubic-bezier(.2,1.3,.35,1); }
        @keyframes ob2Plant { 0% { opacity: 0; transform: scale(0.7); } 100% { opacity: 1; transform: scale(1); } }
        .ob2-si-kicker { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.65); margin-bottom: 6px; }
        .ob2-si-name { font-family: 'Manrope', sans-serif; font-size: 32px; font-weight: 800; letter-spacing: -0.02em; color: ${palette.white}; margin-bottom: 12px; text-shadow: 0 2px 20px rgba(0,0,0,0.35); }
        .ob2-si-sub { font-family: 'Manrope', sans-serif; font-size: 14.5px; font-weight: 500; color: rgba(255,255,255,0.8); line-height: 1.55; max-width: 300px; margin-bottom: 28px; text-shadow: 0 1px 10px rgba(0,0,0,0.3); }
        .ob2-si-btns { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 320px; }
        .ob2-sso { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 52px; border-radius: 100px; font-family: 'Manrope', sans-serif; font-size: 15.5px; font-weight: 700; cursor: pointer; transition: transform .15s ease; border: 1px solid transparent; }
        .ob2-sso:active { transform: scale(0.98); }
        .ob2-sso.apple { background: ${palette.white}; color: #111; }
        .ob2-sso.google { background: rgba(255,255,255,0.14); color: ${palette.white}; border-color: rgba(255,255,255,0.28); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .ob2-sso.email { background: transparent; color: ${palette.white}; border-color: rgba(255,255,255,0.3); }
        .ob2-si-skip { margin-top: 18px; background: none; border: none; color: rgba(255,255,255,0.7); font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 600; cursor: pointer; }
        .ob2-si-mark { width: 108px; height: 108px; border-radius: 30px; background: rgba(255,255,255,0.1); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 16px 44px rgba(0,0,0,0.3); }
        .ob2-email { display: flex; flex-direction: column; width: 100%; max-width: 320px; margin-top: 8px; }
        .ob2-email.in { animation: ob2In .4s cubic-bezier(.2,.9,.3,1); }
        .ob2-email-cap { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.85); margin-bottom: 12px; text-align: center; }
        .ob2-input { width: 100%; height: 54px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.28); background: rgba(255,255,255,0.12); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); padding: 0 18px; font-family: 'Manrope', sans-serif; font-size: 16px; font-weight: 500; color: ${palette.white}; outline: none; margin-bottom: 12px; transition: border-color .2s ease; }
        .ob2-input::placeholder { color: rgba(255,255,255,0.5); }
        .ob2-input:focus { border-color: rgba(255,255,255,0.7); }
        .ob2-email-next { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 52px; border-radius: 100px; border: none; background: ${palette.white}; color: ${T.ink}; font-family: 'Manrope', sans-serif; font-size: 15.5px; font-weight: 700; cursor: pointer; transition: transform .15s ease; }
        .ob2-email-next:active { transform: scale(0.98); }
        .ob2-email-next:disabled { opacity: 0.4; cursor: default; }
        .ob2-email-back { margin-top: 14px; background: none; border: none; color: rgba(255,255,255,0.7); font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; }
        .v-screen { position: absolute; inset: 0; }
        .v-screen.light { background: ${T.bg}; }
        .v-screen.dark { background: ${color.chrome}; }
        .v-status { position: absolute; top: 0; left: 0; right: 0; height: 54px; display: flex; align-items: center; justify-content: space-between; padding: 8px 30px 0; z-index: 40; font-size: 15px; font-weight: 600; }

        .vd-sky { position: absolute; inset: 0; transition: background .25s linear; }
        .vd-stars { position: absolute; inset: 0; pointer-events: none; }
        .vd-star { position: absolute; border-radius: 50%; background: ${palette.white}; }
        .vd-celestial { position: absolute; border-radius: 50%; pointer-events: none; transform: translate(-50%,-50%); transition: background .25s linear, box-shadow .25s linear, opacity .4s linear; z-index: 2; }
        .vd-horizon { position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none; z-index: 1; transition: opacity .5s linear; }
        .vd-content { position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column; }
        .vd-head { padding: 66px ${space.gutter}px 0; }
        .vd-head-top { display: flex; align-items: center; justify-content: space-between; }
        .vd-time { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.14em; display: flex; align-items: center; gap: 8px; }
        .vd-phase-dot { width: 6px; height: 6px; border-radius: 50%; }
        .vd-add-btn { display: flex; align-items: center; gap: 6px; padding: 8px 14px 8px 11px; border-radius: 100px; cursor: pointer;
          border: 1px solid; font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 600; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .vd-greeting { font-family: 'Manrope', sans-serif; font-size: 38px; font-weight: 700; line-height: 1.02; margin-top: 16px; letter-spacing: -0.02em; opacity: 0; transform: translateY(14px); transition: opacity .9s cubic-bezier(.2,.8,.2,1), transform .9s cubic-bezier(.2,.8,.2,1); }
        .vd-greeting.in { opacity: 1; transform: translateY(0); }
        .vd-greeting em { font-style: italic; font-weight: 400; }
        .vd-sub { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 500; line-height: 1.5; margin-top: 12px; max-width: 300px; opacity: 0; transform: translateY(10px); transition: opacity .9s ease .15s, transform .9s ease .15s; }
        .vd-sub.in { opacity: 1; transform: translateY(0); }

        .vd-today { margin-top: 14px; opacity: 0; transform: translateY(10px); transition: opacity .9s ease .3s, transform .9s ease .3s; }
        .vd-today.in { opacity: 1; transform: translateY(0); }
        .vd-brief-wrap { margin-top: 12px; opacity: 0; transform: translateY(10px); transition: opacity .9s ease .3s, transform .9s ease .3s; }
        .vd-brief-wrap.in { opacity: 1; transform: translateY(0); }
        /* guest sign-in banner — inline on home, glass to match the briefing bar */
        .vd-guest { margin-top: 12px; display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 14px; border: 1px solid; border-radius: 14px; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); box-shadow: 0 6px 20px rgba(20,28,20,0.1); opacity: 0; transform: translateY(10px); transition: opacity .9s ease .4s, transform .9s ease .4s; }
        .vd-guest.in { opacity: 1; transform: translateY(0); }
        .vd-guest-ic { flex-shrink: 0; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
        .vd-guest-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .vd-guest-title { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 700; }
        .vd-guest-sub { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 500; line-height: 1.35; }
        .vd-guest-cta { flex-shrink: 0; font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 700; color: ${palette.white}; background: ${T.moss}; border: none; padding: 8px 14px; border-radius: 100px; cursor: pointer; }
        .vd-brief-card { border: none; border-radius: 14px; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); box-shadow: 0 6px 20px rgba(20,28,20,0.12); overflow: hidden; opacity: 0.92; }
        .vd-brief-card.open { opacity: 1; }
        .vd-brief-card.open { border-radius: 14px; }
        .vd-brief-head { display: flex; align-items: center; gap: 11px; width: 100%; min-height: 52px; padding: 13px 16px; border: none; background: transparent; cursor: pointer; text-align: left; color: inherit; font: inherit; }
        .vd-brief-static { cursor: default; }
        .vd-brief-ic { flex-shrink: 0; display: flex; }
        .vd-brief-text { flex: 1; min-width: 0; font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: inherit; }
        .vd-brief-sub { font-weight: 500; }
        /* collapsed visual summary — semantic task chips (icon + count) */
        .vd-brief-chips { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; margin-right: 2px; }
        .vd-brief-chip { height: 26px; min-width: 26px; padding: 0 7px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; gap: 3px; }
        .vd-brief-chip svg { width: 15px; height: 15px; }
        .vd-brief-chip-n { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; line-height: 1; }
        .vd-brief-chev { flex-shrink: 0; opacity: 0.6; transition: transform .3s ease; }
        .vd-brief-reveal { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .32s cubic-bezier(.3,.8,.3,1), opacity .28s ease; }
        .vd-brief-reveal.open { grid-template-rows: 1fr; opacity: 1; }
        .vd-brief-reveal-inner { overflow: hidden; min-height: 0; }
        .vd-brief-items { padding: 2px 8px 8px; }
        /* compact item rows inside the card */
        .vd-bi { display: flex; align-items: flex-start; gap: 10px; padding: 9px 8px; border-radius: 12px; cursor: pointer; }
        .vd-bi + .vd-bi { margin-top: 2px; }
        .vd-bi:hover { background: rgba(127,127,127,0.06); }
        .vd-bi-ic { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .vd-bi-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .vd-bi-title { font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 700; color: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vd-bi-sub { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 500; opacity: 0.58; line-height: 1.35; margin-top: 1px; }
        .vd-bi-act { flex-shrink: 0; padding: 6px 13px; border-radius: 100px; border: none; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; cursor: pointer; align-self: center; }
        .vd-bi-check { position: relative; flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; border: 1.6px solid currentColor; background: transparent; color: inherit; opacity: 0.4; display: flex; align-items: center; justify-content: center; cursor: pointer; align-self: center; overflow: hidden; transition: opacity .2s ease, border-color .3s ease; }
        .vd-bi-check:active { transform: scale(0.92); }
        .vd-bi-check-fill { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: ${T.mossBright}; }
        .vd-bi-check-tick { position: relative; z-index: 1; transition: opacity .18s ease; }
        .vd-bi.completing { overflow: hidden; cursor: default; animation: biCollapse .45s cubic-bezier(.4,0,.2,1) 1s forwards; }
        .vd-bi.completing .vd-bi-check { opacity: 1; border-color: transparent; }   /* circle stroke removed on click */
        .vd-bi.completing .vd-bi-check-fill { animation: potFill 1s cubic-bezier(.45,.05,.35,1) forwards; }  /* slow rise, like filling a pot */
        @keyframes potFill { 0% { height: 0; } 100% { height: 100%; } }
        @keyframes biCollapse {
          0%   { opacity: 1; max-height: 72px; padding-top: 9px; padding-bottom: 9px; }
          32%  { opacity: 1; max-height: 72px; padding-top: 9px; padding-bottom: 9px; }
          100% { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; transform: translateX(8px); }
        }
        .vd-bi-batch { background: rgba(76,115,80,0.1); }
        .vd-access { display: flex; gap: 10px; margin-top: 16px; opacity: 0; transform: translateY(10px); transition: opacity .9s ease .26s, transform .9s ease .26s; }
        .vd-access.in { opacity: 1; transform: translateY(0); }
        .vd-access-btn { flex: 1; display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 14px; border: 1px solid; cursor: pointer; opacity: 0.92;
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); font-family: 'Manrope', sans-serif; }
        .vd-access-lbl { font-size: 13.5px; font-weight: 700; }
        .vd-access-num { margin-left: auto; font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; opacity: 0.68; font-variant-numeric: tabular-nums; }
        .vd-today-more { width: 100%; padding: 9px; margin-top: 2px; border: none; background: transparent; cursor: pointer;
          font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 700; color: inherit; opacity: 0.75; }
        .vd-today-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 11px; }
        .vd-today-title { font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 800; color: inherit; }
        .vd-today-count { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 600; opacity: 0.6; }
        .vd-task { display: flex; align-items: center; gap: 12px; padding: 12px 13px; margin-bottom: 8px; border-radius: 16px; cursor: pointer;
          background: rgba(251,249,244,0.82); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(28,36,25,0.06); box-shadow: 0 6px 18px rgba(20,28,20,0.1); }
        .vd-task-ic { width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .vd-task-body { flex: 1; min-width: 0; }
        .vd-task-title { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; color: ${T.ink}; }
        .vd-task-why { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkFaint}; line-height: 1.35; margin-top: 2px; }
        .vd-task-act { flex-shrink: 0; padding: 8px 15px; border-radius: 100px; border: none; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 700; cursor: pointer; }
        .vd-task-check { flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%; border: 1px solid ${T.line}; background: ${T.bg}; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .vd-today-batch { display: flex; align-items: center; gap: 12px; padding: 13px; margin-bottom: 8px; border-radius: 16px;
          background: rgba(251,249,244,0.9); backdrop-filter: blur(16px); border: 1px solid rgba(76,115,80,0.22); box-shadow: 0 6px 18px rgba(20,28,20,0.1); }
        .vd-tb-ic { width: 38px; height: 38px; border-radius: 11px; background: ${T.mossBright}18; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .vd-tb-body { flex: 1; min-width: 0; }
        .vd-tb-title { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 800; color: ${T.ink}; }
        .vd-tb-sub { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkSoft}; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vd-tb-go { flex-shrink: 0; padding: 9px 14px; border-radius: 12px; border: none; background: ${T.moss}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 700; cursor: pointer; }
        .vd-today-clear { display: flex; align-items: center; gap: 13px; padding: 15px; border-radius: 16px;
          background: rgba(251,249,244,0.72); backdrop-filter: blur(16px); border: 1px solid rgba(28,36,25,0.06); }
        .vd-today-clear-ic { width: 40px; height: 40px; border-radius: 12px; background: ${T.moss}14; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .vd-today-clear-t { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; color: ${T.ink}; }
        .vd-today-clear-s { font-family: 'Manrope', sans-serif; font-size: 12px; color: ${T.inkFaint}; margin-top: 2px; }

        .vd-shelf { flex: 1; position: relative; }
        .vd-sway { animation-name: vdSway; animation-timing-function: ease-in-out; animation-iteration-count: infinite; will-change: transform; }
        @keyframes vdSway { 0%, 100% { transform: rotate(-1.1deg); } 50% { transform: rotate(1.1deg); } }
        .vd-fireflies { position: absolute; inset: 0; pointer-events: none; z-index: 40; transition: opacity 1s ease; }
        .vd-firefly { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: ${palette.amber100};
          box-shadow: 0 0 8px 2px rgba(255,225,140,0.8); animation-name: vdFirefly; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
        @keyframes vdFirefly {
          0% { transform: translate(0, 0); opacity: 0; }
          20% { opacity: 0.9; }
          50% { transform: translate(14px, -18px); opacity: 0.5; }
          80% { opacity: 0.9; }
          100% { transform: translate(-6px, -34px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .vd-sway, .vd-firefly { animation: none !important; } }
        /* Catch-all: honor the OS "Reduce Motion" setting across ALL animations and
           transitions. Only active when the user has opted in — no effect otherwise.
           Snaps animations to their end state (0.01ms) rather than removing them, so
           nothing that depends on an end state breaks. */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
        /* (comprehensive reduced-motion handling near end of stylesheet) */
        .vd-ground { position: absolute; left: 0; right: 0; bottom: 0; height: 200px; pointer-events: none; }
        .vd-plant { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; cursor: pointer; transition: transform .5s cubic-bezier(.2,.8,.2,1), opacity .5s ease; }
        .vd-plant-shadow { position: absolute; bottom: -4px; left: 50%; height: 12px; border-radius: 50%; background: rgba(0,0,0,0.28); filter: blur(5px); transition: all .25s linear; }
        .vd-plant-glow { position: absolute; top: 36%; left: 50%; width: 150px; height: 150px; border-radius: 50%; transform: translate(-50%,-50%); pointer-events: none; transition: opacity .25s linear; }
        .vd-plant-alert { position: absolute; top: 18%; right: 22%; width: 20px; height: 20px; border-radius: 50%; background: ${T.clay}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 4px rgba(181,96,47,0.25); animation: alertBob 2s ease-in-out infinite; }
        @keyframes alertBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        .vd-plant-label { position: absolute; bottom: 100%; left: 50%; margin-bottom: 6px; transform-origin: center bottom; font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; padding: 4px 11px; border-radius: 100px; backdrop-filter: blur(8px); opacity: 0; transition: opacity .25s ease; white-space: nowrap; }
        .vd-plant:hover .vd-plant-label { opacity: 1; }

        /* profile */
        .pf-hero { display: flex; flex-direction: column; align-items: center; padding: 16px ${space.gutter}px 0; }
        /* signed-out profile */
        .pf-out { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 32px; }
        .pf-out-mark { width: 96px; height: 96px; border-radius: 28px; background: ${T.card}; border: 1px solid ${T.line}; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; box-shadow: 0 12px 30px rgba(28,36,25,0.08); }
        .pf-out-title { font-family: 'Manrope', sans-serif; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; color: ${T.ink}; margin-bottom: 12px; }
        .pf-out-sub { font-family: 'Manrope', sans-serif; font-size: 14.5px; font-weight: 500; color: ${T.inkSoft}; line-height: 1.55; max-width: 310px; margin-bottom: 26px; }
        .pf-out-perks { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; margin-bottom: 30px; }
        .pf-out-perk { display: flex; align-items: center; gap: 11px; font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 600; color: ${T.ink}; }
        .pf-out-perk-ic { width: 26px; height: 26px; border-radius: 8px; background: ${T.moss}14; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .pf-out-btn { width: 100%; max-width: 320px; height: 54px; border-radius: 100px; border: none; background: ${T.ink}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 16px; font-weight: 700; cursor: pointer; transition: transform .15s ease; }
        .pf-out-btn:active { transform: scale(0.97); }
        .pf-avatar { width: 72px; height: 72px; border-radius: 50%; background: ${T.moss}18; display: flex; align-items: center; justify-content: center; font-size: 34px; }
        .pf-name { font-family: 'Manrope', sans-serif; font-size: 23px; font-weight: 700; color: ${T.ink}; margin-top: 12px; }
        .pf-sub { font-family: 'Manrope', sans-serif; font-size: 13px; color: ${T.inkFaint}; margin-top: 3px; }
        .pf-list { margin: 24px ${space.gutter}px 0; background: ${T.card}; border-radius: 18px; border: 1px solid ${T.line}; overflow: hidden; }
        .pf-row { display: flex; align-items: center; gap: 13px; width: 100%; padding: 14px 16px; border: none; background: transparent; border-top: 1px solid ${T.line}; cursor: pointer; }
        .pf-row:first-child { border-top: none; }
        .pf-row-icon { width: 34px; height: 34px; border-radius: 10px; background: ${T.moss}12; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .pf-row-text { flex: 1; text-align: left; }
        .pf-row-label { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 600; color: ${T.ink}; }
        .pf-row-sub { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkFaint}; margin-top: 1px; }

        /* ---- redesigned profile (pf2-) ---- */
        .pf3-avatar { width: 78px; height: 78px; border-radius: 50%; overflow: hidden; box-shadow: 0 10px 26px ${T.moss}44; }
        .pf3-badge { display: inline-flex; align-items: center; gap: 5px; margin-top: 12px; padding: 5px 12px; border-radius: 100px; background: ${T.moss}14; color: ${T.moss}; font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; }
        .pf3-badge-tap { border: none; cursor: pointer; }
        .pf3-sec-lbl { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: ${T.inkFaint}; margin: 24px ${space.gutter}px 10px; }

        .pf3-celebrate { position: absolute; inset: 0; z-index: 80; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 40px;
          background: rgba(237,238,230,0.86); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); animation: dzFade .3s ease; cursor: pointer; }
        .pf3-cel-burst { position: absolute; top: 42%; left: 50%; width: 0; height: 0; }
        .pf3-confetti { position: absolute; width: 8px; height: 8px; border-radius: 2px; left: 0; top: 0;
          transform: rotate(var(--a)) translateY(0); opacity: 0; animation: pfConfetti .9s ease-out var(--d) forwards; }
        @keyframes pfConfetti { 0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scale(1); } 100% { opacity: 0; transform: rotate(var(--a)) translateY(-110px) scale(.4); } }
        .pf3-cel-badge { width: 84px; height: 84px; border-radius: 26px; background: linear-gradient(150deg, ${T.moss}, ${T.mossBright}); display: flex; align-items: center; justify-content: center;
          box-shadow: 0 16px 40px ${T.moss}55; animation: pfBadgePop .6s cubic-bezier(.2,1.6,.35,1); }
        @keyframes pfBadgePop { 0% { transform: scale(0) rotate(-20deg); } 60% { transform: scale(1.18) rotate(6deg); } 100% { transform: scale(1) rotate(0); } }
        .pf3-cel-kicker { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: ${T.moss}; margin-top: 22px; }
        .pf3-cel-name { font-family: 'Manrope', sans-serif; font-size: 26px; font-weight: 800; color: ${T.ink}; margin-top: 6px; text-align: center; }
        .pf3-cel-sub { font-family: 'Manrope', sans-serif; font-size: 13.5px; color: ${T.inkSoft}; margin-top: 6px; text-align: center; }
        .pf3-cel-btn { margin-top: 26px; padding: 13px 40px; border-radius: 100px; border: none; background: ${T.ink}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 14.5px; font-weight: 700; cursor: pointer; }
        .pf3-tierbar { display: block; width: calc(100% - 48px); margin: 14px ${space.gutter}px 0; padding: 0; border: none; background: transparent; cursor: pointer; }
        .pf3-tierbar-track { height: 6px; border-radius: 100px; background: ${T.card}; border: 1px solid ${T.line}; overflow: hidden; }
        .pf3-tierbar-fill { height: 100%; border-radius: 100px; background: linear-gradient(90deg, ${T.moss}, ${T.mossBright}); transition: width 1s cubic-bezier(.3,.8,.3,1); }
        .pf3-tierbar-cap { font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 600; color: ${T.inkSoft}; margin-top: 7px; text-align: center; }

        .pf3-mile-head { display: flex; align-items: baseline; justify-content: space-between; margin: 26px ${space.gutter}px 10px; }
        .pf3-mile-all { border: none; background: transparent; cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 700; color: ${T.moss}; }

        .pf3-next { display: flex; align-items: center; gap: 13px; width: calc(100% - 48px); margin: 0 ${space.gutter}px 12px; padding: 14px; border-radius: 16px; cursor: pointer; text-align: left;
          background: linear-gradient(120deg, ${T.moss}16, ${T.mossBright}0a); border: 1px solid ${T.moss}2c; }
        .pf3-next-ic { width: 42px; height: 42px; border-radius: 12px; background: ${T.moss}18; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .pf3-next-body { flex: 1; min-width: 0; }
        .pf3-next-kicker { font-family: 'Manrope', sans-serif; font-size: 9.5px; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: ${T.moss}; }
        .pf3-next-label { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; color: ${T.ink}; margin: 2px 0 7px; }
        .pf3-next-bar { height: 4.5px; border-radius: 100px; background: ${T.moss}1c; overflow: hidden; }
        .pf3-next-fill { height: 100%; border-radius: 100px; background: ${T.moss}; transition: width 1s cubic-bezier(.3,.8,.3,1); }
        .pf3-next-pct { font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 800; color: ${T.moss}; flex-shrink: 0; }

        .pf3-earned-strip { display: flex; gap: 7px; margin: 0 ${space.gutter}px; }
        .pf3-chip { position: relative; width: 36px; height: 36px; border-radius: 11px; background: ${T.card}; border: 1px solid ${T.line}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .pf3-chip.got { background: linear-gradient(150deg, ${T.moss}, ${T.mossBright}); border-color: transparent; }
        .pf3-chip-tip { position: absolute; bottom: calc(100% + 9px); left: 50%; transform: translateX(-50%) translateY(4px); width: max-content; max-width: 170px; padding: 8px 11px; border-radius: 10px; background: ${T.ink}; opacity: 0; pointer-events: none; transition: opacity .2s ease, transform .2s ease; z-index: 30; }
        .pf3-chip:hover .pf3-chip-tip { opacity: 1; transform: translateX(-50%) translateY(0); }
        .pf3-chip-tip::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: ${T.ink}; }
        .pf3-chip-tip-name { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; color: ${palette.white}; }
        .pf3-chip-tip-sub { font-family: 'Manrope', sans-serif; font-size: 10.5px; color: rgba(255,255,255,0.7); margin-top: 2px; line-height: 1.35; }

        /* tier ladder (hotel-style) */
        .pf3-tierhero { display: flex; align-items: center; gap: 16px; margin: 20px 0 6px; padding: 16px; border-radius: 18px; background: linear-gradient(120deg, ${T.moss}14, ${T.mossBright}08); border: 1px solid ${T.moss}22; }
        .pf3-tierhero-ring { position: relative; width: 72px; height: 72px; flex-shrink: 0; }
        .pf3-tierhero-num { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: 'Manrope', sans-serif; font-size: 22px; font-weight: 800; color: ${T.ink}; line-height: 1; }
        .pf3-tierhero-num span { font-size: 9px; font-weight: 600; color: ${T.inkFaint}; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
        .pf3-tierhero-kicker { font-family: 'Manrope', sans-serif; font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: ${T.moss}; }
        .pf3-tierhero-next { font-family: 'Manrope', sans-serif; font-size: 19px; font-weight: 800; color: ${T.ink}; margin: 3px 0 4px; }
        .pf3-tierhero-sub { font-family: 'Manrope', sans-serif; font-size: 12px; color: ${T.inkSoft}; }
        .pf3-ladder { margin-top: 18px; }
        .pf3-tier { display: flex; gap: 14px; }
        .pf3-tier-rail { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
        .pf3-tier-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid ${T.line}; background: ${T.bg}; margin-top: 2px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .pf3-tier-line { width: 2px; flex: 1; background: ${T.line}; margin: 3px 0; }
        .pf3-tier.done .pf3-tier-dot, .pf3-tier.current .pf3-tier-dot { border-color: ${T.moss}; background: ${T.moss}; }
        .pf3-tier.done .pf3-tier-line { background: ${T.moss}; }
        .pf3-tier-body { padding-bottom: 20px; }
        .pf3-tier.locked .pf3-tier-body { opacity: 0.5; }
        .pf3-tier-top { display: flex; align-items: center; gap: 8px; }
        .pf3-tier-name { font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 800; color: ${T.ink}; }
        .pf3-tier-here { padding: 2px 8px; border-radius: 100px; background: ${T.moss}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 9px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; }
        .pf3-tier-need { font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 600; color: ${T.moss}; margin-top: 2px; }
        .pf3-tier-perk { font-family: 'Manrope', sans-serif; font-size: 12.5px; color: ${T.inkSoft}; margin-top: 4px; line-height: 1.4; }

        .pf3-badges { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0 ${space.gutter}px; }
        .pf3-badge-card { position: relative; padding: 14px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; overflow: hidden; }
        .pf3-badge-card.got { background: linear-gradient(150deg, ${T.moss}, ${T.mossBright}); border-color: transparent; box-shadow: 0 6px 18px ${T.moss}33; }
        .pf3-badge-card.got::after { content: ''; position: absolute; top: -40%; left: -30%; width: 60%; height: 180%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent); transform: rotate(20deg); }
        .pf3-badge-card.locked { opacity: 0.9; }
        .pf3-badge-check { position: absolute; top: 12px; right: 12px; width: 20px; height: 20px; border-radius: 50%; background: rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center; }
        .pf3-badge-ic { width: 38px; height: 38px; border-radius: 11px; background: ${T.moss}12; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
        .pf3-badge-card.got .pf3-badge-ic { background: rgba(255,255,255,0.2); }
        .pf3-badge-card.locked .pf3-badge-ic { background: ${T.line}; }
        .pf3-badge-label { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 700; color: ${T.ink}; }
        .pf3-badge-card.got .pf3-badge-label { color: ${palette.white}; }
        .pf3-badge-sub { font-family: 'Manrope', sans-serif; font-size: 11px; color: ${T.inkFaint}; margin-top: 2px; line-height: 1.35; }
        .pf3-badge-card.got .pf3-badge-sub { color: rgba(255,255,255,0.82); }
        .pf3-badge-prog { display: flex; align-items: center; gap: 7px; margin-top: 10px; }
        .pf3-badge-prog-bar { flex: 1; height: 5px; border-radius: 100px; background: ${T.bg}; overflow: hidden; }
        .pf3-badge-prog-bar > div { height: 100%; border-radius: 100px; background: ${T.inkFaint}; }
        .pf3-badge-prog span { font-family: 'Manrope', sans-serif; font-size: 10px; font-weight: 700; color: ${T.inkFaint}; }
        .pf3-signout { display: block; width: calc(100% - 48px); margin: 22px ${space.gutter}px 0; padding: 14px; border-radius: 14px; border: 1px solid ${T.line}; background: transparent; cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; color: ${T.clay}; }

        .pf2-hero { display: flex; flex-direction: column; align-items: center; padding: 16px ${space.gutter}px 0; }
        .pf2-crest { position: relative; width: 88px; height: 88px; display: flex; align-items: center; justify-content: center; }
        .pf2-crest-mid { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .pf2-name { font-family: 'Manrope', sans-serif; font-size: 24px; font-weight: 800; color: ${T.ink}; margin-top: 14px; letter-spacing: -0.01em; }
        .pf2-sub { font-family: 'Manrope', sans-serif; font-size: 13px; color: ${T.inkSoft}; margin-top: 4px; text-align: center; }
        .pf2-sub b { font-weight: 700; }

        .pf2-vitals { display: flex; align-items: center; margin: 22px ${space.gutter}px 0; padding: 16px 8px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 18px; }
        .pf2-vital { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .pf2-vital-num { font-family: 'Manrope', sans-serif; font-size: 24px; font-weight: 800; color: ${T.ink}; line-height: 1; }
        .pf2-vital-lbl { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 500; color: ${T.inkFaint}; }
        .pf2-vital-div { width: 1px; height: 30px; background: ${T.line}; }

        .pf2-mood { margin: 12px ${space.gutter}px 0; padding: 15px 16px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 18px; }
        .pf2-mood-bar { display: flex; height: 8px; border-radius: 100px; overflow: hidden; gap: 2px; }
        .pf2-mood-bar > div { border-radius: 2px; transition: flex .5s ease; }
        .pf2-mood-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 11px; }
        .pf2-mood-legend span { display: inline-flex; align-items: center; gap: 6px; font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 600; color: ${T.inkSoft}; }
        .pf2-mood-legend i { width: 8px; height: 8px; border-radius: 50%; }

        .pf2-star { display: flex; align-items: center; gap: 13px; margin: 12px ${space.gutter}px 0; padding: 13px 15px; border-radius: 18px;
          background: linear-gradient(120deg, ${T.moss}14, ${T.moss}08); border: 1px solid ${T.moss}22; }
        .pf2-star-photo { border-radius: 50%; flex-shrink: 0; }
        .pf2-star-body { flex: 1; min-width: 0; }
        .pf2-star-kicker { font-family: 'Manrope', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${T.moss}; }
        .pf2-star-name { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; color: ${T.ink}; margin-top: 3px; }
        .pf2-star-badge { width: 34px; height: 34px; border-radius: 50%; background: ${T.moss}14; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

        .pf2-sec { margin-top: 22px; }
        .pf2-sec-lbl { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: ${T.inkFaint}; margin: 0 ${space.gutter}px 9px; }
        .pf2-list { margin: 0 ${space.gutter}px; background: ${T.card}; border-radius: 18px; border: 1px solid ${T.line}; overflow: hidden; }
        .pf2-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; border: none; background: transparent; border-top: 1px solid ${T.line}; cursor: pointer; }
        .pf2-row:first-child { border-top: none; }
        .pf2-row-icon { width: 34px; height: 34px; border-radius: 10px; background: ${T.moss}12; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .pf2-row-text { flex: 1; text-align: left; }
        .pf2-row-label { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 600; color: ${T.ink}; }
        .pf2-row-sub { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkFaint}; margin-top: 1px; }

        /* profile bottom sheets */
        .pf2-scrim { position: absolute; inset: 0; background: rgba(20,26,20,0.4); z-index: 60; animation: dzFade .25s ease; }
        .pf2-sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 61; background: ${T.bg}; border-radius: 26px 26px 0 0; padding: 10px 22px calc(28px + env(safe-area-inset-bottom)); box-shadow: 0 -16px 40px rgba(0,0,0,0.2); animation: sheetUp .34s cubic-bezier(.2,.85,.25,1); }
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .pf2-sheet-grab { width: 38px; height: 4px; border-radius: 100px; background: ${T.line}; margin: 0 auto 16px; }
        .pf2-sheet-title { font-family: 'Manrope', sans-serif; font-size: 19px; font-weight: 800; color: ${T.ink}; }
        .pf2-sheet-sub { font-family: 'Manrope', sans-serif; font-size: 12.5px; color: ${T.inkFaint}; margin-top: 4px; line-height: 1.45; }
        .pf2-sheet-note { font-family: 'Manrope', sans-serif; font-size: 12px; color: ${T.inkSoft}; margin-top: 14px; line-height: 1.5; padding: 12px 14px; background: ${T.moss}0d; border-radius: 12px; }
        .pf2-toggle-row { display: flex; align-items: center; gap: 12px; padding: 15px 0; background: none; border: 0; border-top: 1px solid ${T.line}; width: 100%; text-align: left; font-family: inherit; cursor: pointer; }
        .pf2-toggle-row:first-of-type { margin-top: 8px; }
        .pf2-toggle-text { flex: 1; }
        .pf2-toggle-label { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; color: ${T.ink}; }
        .pf2-toggle-sub { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkFaint}; margin-top: 2px; }
        .pf2-switch { width: 46px; height: 28px; border-radius: 100px; background: ${T.line}; flex-shrink: 0; position: relative; transition: background .25s ease; }
        .pf2-switch.on { background: ${T.moss}; }
        .pf2-switch-knob { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: ${palette.white}; box-shadow: 0 1px 3px rgba(0,0,0,0.25); transition: left .25s cubic-bezier(.3,1.4,.5,1); }
        .pf2-switch.on .pf2-switch-knob { left: 21px; }
        .pf2-climate-now { display: flex; gap: 10px; margin-top: 18px; }
        .pf2-climate-item { flex: 1; padding: 14px 10px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 14px; text-align: center; }
        .pf2-climate-v { font-family: 'Manrope', sans-serif; font-size: 17px; font-weight: 800; color: ${T.ink}; }
        .pf2-climate-l { font-family: 'Manrope', sans-serif; font-size: 10.5px; color: ${T.inkFaint}; margin-top: 4px; }
        .pf2-about-mark { width: 60px; height: 60px; border-radius: 18px; background: ${T.moss}14; display: flex; align-items: center; justify-content: center; margin: 4px auto 14px; }
        .pf2-about-rows { margin-top: 20px; }
        .pf2-about-row { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 15px 2px; border: none; border-top: 1px solid ${T.line}; background: transparent; cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 600; color: ${T.ink}; }
        .pf2-about-row.danger { color: ${T.clay}; }
        .pf2-acct-back { display: inline-flex; align-items: center; gap: 4px; border: none; background: transparent; cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 700; color: ${T.inkSoft}; padding: 0; margin-bottom: 14px; }
        .pf2-acct-input { width: 100%; height: 50px; margin-top: 18px; padding: 0 16px; border-radius: 13px; border: 1.5px solid ${T.line}; background: ${T.bg}; font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 600; color: ${T.ink}; outline: none; }
        .pf2-acct-input:focus { border-color: ${T.inkSoft}; }
        .pf2-acct-save { width: 100%; height: 50px; margin-top: 16px; border-radius: 13px; border: none; background: ${T.moss}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 14.5px; font-weight: 700; cursor: pointer; }
        .pf2-acct-save:disabled { opacity: 0.45; cursor: default; }
        .pf2-acct-delete { width: 100%; height: 50px; margin-top: 20px; border-radius: 13px; border: none; background: ${T.clay}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 14.5px; font-weight: 700; cursor: pointer; }
        .pf2-acct-cancel { width: 100%; height: 46px; margin-top: 10px; border-radius: 13px; border: none; background: transparent; color: ${T.inkSoft}; font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; }
        .pf2-acct-msg { display: flex; align-items: center; gap: 8px; margin-top: 16px; padding: 12px 14px; border-radius: 12px; background: ${T.mossBright}12; font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 700; color: ${T.moss}; }

        /* external demo controls (below the phone, not part of the app) */
        .demo-panel { width: 402px; margin: 40px 0 48px; padding: 14px 18px; border-radius: 18px;
          background: rgba(255,255,255,0.55); border: 1px solid rgba(28,36,25,0.12); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
        .demo-head { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; }
        .demo-badge { font-family: 'Manrope', sans-serif; font-size: 9px; font-weight: 600; letter-spacing: 0.1em;
          color: ${palette.white}; background: ${palette.moss500}; padding: 3px 7px; border-radius: 5px; }
        .demo-title { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: rgba(28,36,25,0.55); }
        .demo-row { display: flex; align-items: center; gap: 12px; }
        .demo-clock { font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 600; color: rgba(28,36,25,0.85);
          min-width: 44px; }
        .demo-scrub { flex: 1; -webkit-appearance: none; appearance: none; height: 4px; border-radius: 4px; outline: none; cursor: pointer; background: rgba(28,36,25,0.18); }
        .demo-scrub::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: ${palette.moss500}; box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
        .demo-scrub::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: ${palette.moss500}; border: none; }
        .demo-play { display: flex; align-items: center; gap: 6px; font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 600;
          color: ${palette.white}; background: ${palette.moss500}; border: none; padding: 8px 14px; border-radius: 100px; cursor: pointer; white-space: nowrap; }
        .demo-divider { height: 1px; background: rgba(28,36,25,0.1); margin: 14px 0; }
        .demo-jumps { display: flex; flex-wrap: wrap; gap: 7px; }
        .demo-jump { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 600; color: rgba(28,36,25,0.82);
          background: rgba(28,36,25,0.05); border: 1px solid rgba(28,36,25,0.14); padding: 7px 13px; border-radius: 100px; cursor: pointer; transition: background .15s ease, transform .12s ease; }
        .demo-jump:hover { background: rgba(28,36,25,0.1); }
        .demo-jump:active { transform: scale(0.95); }

        /* nav — one continuous full-width bar; a single white pill slides across it */
        .nav-wrap { position: absolute; bottom: 20px; left: 16px; right: 16px; height: 60px; z-index: 55; }
        .nav-bar { position: relative; display: flex; align-items: center; justify-content: space-between; width: 100%; height: 100%;
          padding: 6px 6px; border-radius: 38px; background: ${palette.black600}; box-shadow: 0 12px 30px rgba(0,0,0,0.32); }
        /* the sliding pill: travels + stretches between tabs */
        .nav-glider { position: absolute; top: 6px; height: 48px; border-radius: 32px; background: ${color.surfaceAlt}; z-index: 1;
          box-shadow: 0 2px 12px rgba(0,0,0,0.28), inset 0 1px 2px rgba(255,255,255,0.9);
          transition: left .55s cubic-bezier(.34,1.5,.5,1), width .55s cubic-bezier(.34,1.5,.5,1), opacity .3s ease; }
        .nav-item { position: relative; z-index: 2; height: 48px; display: flex; align-items: center; justify-content: center; gap: 7px;
          border: none; background: transparent; cursor: pointer; color: ${color.surfaceAlt}; border-radius: 32px;
          transition: color .35s ease, background-color .35s ease, box-shadow .35s ease; white-space: nowrap; flex-shrink: 0; padding: 0 12px; }
        /* FALLBACK pill: lives on the active button so the tab is legible even if the
           slide never initializes. Suppressed once the glider is ready (has-glider),
           so with the slide running there's only the one sliding pill. */
        .nav-item.active { color: ${palette.black600}; padding: 0 20px; background: ${color.surfaceAlt};
          box-shadow: 0 2px 12px rgba(0,0,0,0.28), inset 0 1px 2px rgba(255,255,255,0.9); }
        .nav-bar.has-glider .nav-item.active { background: transparent; box-shadow: none; }
        .nav-item-ic { position: relative; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0; }
        .nav-dot { position: absolute; top: -1px; right: -2px; width: 8px; height: 8px; border-radius: 50%; background: ${T.clay}; box-shadow: 0 0 0 2px ${palette.black600}; }
        .nav-item-lbl { font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 600;
          animation: navLblIn .4s cubic-bezier(.2,.85,.25,1); white-space: nowrap; }
        /* label fades in as the tab becomes active */
        @keyframes navLblIn { 0% { opacity: 0; } 100% { opacity: 1; } }

        /* detail */
        .dt-scroll { position: absolute; top: 54px; bottom: 0; left: 0; right: 0; overflow-y: auto; overflow-x: hidden; padding-bottom: 104px; }
        .dt-scroll::-webkit-scrollbar { display: none; }
        /* hero variant: photo bleeds to the very top, under the status area */
        .dt-scroll-hero { top: 0; }
        /* ---------- IMMERSIVE CANVAS: photo + dark treatment as the whole background ---------- */
        .dz { position: absolute; inset: 0; overflow: hidden; background: ${palette.black750}; }
        .dz-photo { position: absolute; top: 0; left: 0; right: 0; height: 78%; transition: transform .6s cubic-bezier(.2,1.4,.3,1), filter .6s ease; }
        .dz-photo.watered { transform: scale(1.035); filter: brightness(1.12) saturate(1.12); }
        .dz-waterfx { position: absolute; top: 0; left: 0; right: 0; height: 78%; pointer-events: none; z-index: 3; overflow: hidden; }
        .dz-drop { position: absolute; top: -6%; width: 7px; height: 11px; background: rgba(180,220,255,0.9); border-radius: 60% 60% 60% 60% / 75% 75% 55% 55%;
          box-shadow: 0 0 6px rgba(150,200,255,0.6); animation: dzDrop 1s cubic-bezier(.5,0,.75,.5) forwards; }
        .dz-drop1 { left: 38%; animation-delay: 0s; }
        .dz-drop2 { left: 52%; animation-delay: .12s; }
        .dz-drop3 { left: 46%; animation-delay: .22s; }
        .dz-drop4 { left: 60%; animation-delay: .32s; }
        .dz-drop5 { left: 42%; animation-delay: .42s; }
        @keyframes dzDrop { 0% { transform: translateY(0) scaleY(.8); opacity: 0; } 15% { opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(340px) scaleY(1.25); opacity: 0; } }
        .dz-perkglow { position: absolute; inset: 0; background: radial-gradient(60% 50% at 50% 60%, rgba(120,200,140,0.28), transparent 70%); opacity: 0; animation: dzPerk 1.4s ease-out forwards; }
        @keyframes dzPerk { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
        .dz-vital-num.pop { animation: dzHealthPop .7s cubic-bezier(.2,1.6,.35,1); }
        @keyframes dzHealthPop { 0% { transform: scale(1); } 40% { transform: scale(1.35); } 100% { transform: scale(1); } }
        .dz-photo > div { width: 100% !important; height: 100% !important; border-radius: 0 !important; background: transparent !important; }
        .dz-photo img { object-fit: cover; object-position: 50% 35% !important; }
        /* silhouette (no real photo): contain it so leaves fill without being cropped */
        .dz-photo svg { width: 100% !important; height: 100% !important; object-fit: contain; }
        .dz-veil { position: absolute; inset: 0; pointer-events: none; background:
          linear-gradient(180deg, rgba(15,22,16,0.45) 0%, rgba(15,22,16,0) 18%, rgba(15,22,16,0) 40%, rgba(15,22,16,0.55) 62%, rgba(15,22,16,0.95) 76%, ${palette.black750} 84%, ${palette.black750} 100%); }
        .dz-statuswash { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
        .dz-scroll { position: absolute; inset: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; z-index: 2; padding-bottom: 40px; }
        .dz-scroll::-webkit-scrollbar { display: none; }
        .dz-spacer { height: 360px; }
        .dz-top { position: absolute; top: 0; left: 0; right: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; padding: 52px 18px 0; }
        .dz-icon { width: 40px; height: 40px; border-radius: 50%; border: none; background: rgba(255,255,255,0.16); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .dz-top-right { position: relative; display: flex; align-items: center; gap: 10px; }
        /* remove confirmation — a Verdure bottom sheet, matching health/care/journal */
        .dz-sheet-confirm { max-height: none; }
        .dz-confirm-body { padding: 6px ${space.gutter}px 26px; text-align: center; }
        .dz-confirm-ic { width: 52px; height: 52px; border-radius: 50%; background: ${T.clay}14; display: flex; align-items: center; justify-content: center; margin: 6px auto 16px; }
        .dz-sheet-confirm .dz-sheet-sub { text-align: center; max-width: 300px; margin: 8px auto 0; line-height: 1.5; }
        .dz-confirm-keep { width: 100%; height: 52px; margin-top: 22px; border-radius: 15px; border: none; background: ${T.moss}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; }
        .dz-confirm-remove { width: 100%; height: 48px; margin-top: 9px; border-radius: 15px; border: none; background: transparent; color: ${T.clay}; font-family: 'Manrope', sans-serif; font-size: 14.5px; font-weight: 700; cursor: pointer; }
        .dz-menu-scrim { position: fixed; inset: 0; z-index: 8; }
        .dz-menu { position: absolute; top: 48px; right: 0; z-index: 9; min-width: 210px; background: ${T.card}; border-radius: 14px; padding: 6px; box-shadow: 0 16px 40px rgba(0,0,0,0.3); animation: dzMenuIn .16s ease; transform-origin: top right; }
        @keyframes dzMenuIn { 0% { opacity: 0; transform: scale(.94); } 100% { opacity: 1; transform: scale(1); } }
        .dz-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 11px 12px; border: none; background: transparent; border-radius: 10px; cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 600; color: ${T.ink}; text-align: left; }
        .dz-menu-item:hover { background: ${T.bg}; }
        .dz-menu-item.danger { color: ${T.clay}; }
        /* identity sits low, after a flexible spacer that keeps the photo breathing above */
        .dz-id { padding: 0 ${space.gutter}px; opacity: 0; transform: translateY(14px); transition: opacity .7s ease, transform .7s ease; }
        .dz-id.in { opacity: 1; transform: translateY(0); }
        .dz-pulse-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .dz-pulse { width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 0 4px rgba(255,255,255,0.14); animation: dtpulse 1.8s ease-in-out infinite; }
        .dz-pulse-lbl { font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 700; color: rgba(255,255,255,0.92); }
        .dz-name { font-family: 'Manrope', sans-serif; font-size: 46px; font-weight: 800; color: ${palette.white}; line-height: 0.98; letter-spacing: -0.025em; }
        .dz-latin { font-family: 'Manrope', sans-serif; font-size: 14px; color: rgba(255,255,255,0.72); margin-top: 8px; }
        /* headline + the single action */
        .dz-call { padding: 22px ${space.gutter}px 0; opacity: 0; transform: translateY(14px); transition: opacity .7s ease .1s, transform .7s ease .1s; }
        .dz-call.in { opacity: 1; transform: translateY(0); }
        .dz-headline { font-family: 'Manrope', sans-serif; font-size: 17px; font-weight: 600; color: rgba(255,255,255,0.95); line-height: 1.4; margin-bottom: 16px; }
        .dz-action { display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; height: 56px; border-radius: 18px; border: none; cursor: pointer; background: ${palette.white}; transition: background .3s ease; }
        .dz-action.urgent { justify-content: space-between; padding: 0 20px; background: linear-gradient(135deg, ${palette.clay450}, ${palette.clay700}); box-shadow: 0 10px 26px rgba(169,78,47,0.4); }
        .dz-action.urgent .dz-action-main { color: ${palette.white}; }
        .dz-action-steps { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.18); padding: 4px 10px; border-radius: 100px; }
        .dz-status.subtle { margin-top: 10px; background: rgba(255,255,255,0.05); }
        .dz-action.done { background: ${T.mossBright}; }
        .dz-action-main { display: flex; align-items: center; gap: 9px; font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 700; color: ${T.ink}; }
        .dz-action.done .dz-action-main { color: ${palette.white}; }
        .dz-action.done .dz-action-main svg { stroke: ${palette.white}; }
        /* explore — grouped list of rows, one frosted card */
        .dz-explore { margin: 16px ${space.gutter}px 30px; border-radius: 20px; overflow: hidden;
          background: rgba(255,255,255,0.08); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border: 1px solid rgba(255,255,255,0.12);
          opacity: 0; transform: translateY(14px); transition: opacity .7s ease .2s, transform .7s ease .2s; }
        .dz-explore.in { opacity: 1; transform: translateY(0); }
        .dz-row { display: flex; align-items: center; gap: 14px; width: 100%; padding: 15px 16px; border: none; background: transparent; cursor: pointer; text-align: left; }
        .dz-row-ic { width: 40px; height: 40px; border-radius: 12px; background: rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .dz-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .dz-row-lbl { font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 700; color: ${palette.white}; }
        .dz-row-prev { font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 500; color: rgba(255,255,255,0.62); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dz-row-arr { flex-shrink: 0; }
        .dz-row-sep { height: 1px; background: rgba(255,255,255,0.1); margin-left: 70px; }

        /* ---------- BOTTOM SHEETS ---------- */
        .dz-sheet-scrim { position: absolute; inset: 0; background: rgba(10,14,10,0.5); z-index: 60; animation: dzFade .25s ease; }
        @keyframes dzFade { from { opacity: 0; } to { opacity: 1; } }
        .dz-sheet { position: absolute; left: 0; right: 0; bottom: 0; max-height: 82%; background: ${T.bg}; border-radius: 28px 28px 0 0; z-index: 61;
          display: flex; flex-direction: column; animation: dzSheetUp .4s cubic-bezier(.2,.85,.25,1); box-shadow: 0 -12px 40px rgba(0,0,0,0.3); }
        @keyframes dzSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .dz-sheet-grip { width: 40px; height: 5px; border-radius: 3px; background: ${T.line}; margin: 12px auto 4px; flex-shrink: 0; }
        .dz-sheet-scroll { overflow-y: auto; padding: 12px ${space.gutter}px 30px; flex: 1; min-height: 0; }
        .dz-sheet-scroll::-webkit-scrollbar { display: none; }
        .dz-sheet-titlerow { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .dz-sheet-title { font-family: 'Manrope', sans-serif; font-size: 24px; font-weight: 800; color: ${T.ink}; letter-spacing: -0.01em; }
        .dz-sheet-lead { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 600; color: ${T.inkSoft}; margin: 6px 0 18px; }
        .dt-match-note { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkFaint}; margin-top: 7px; }

        /* calm status line (not a button) when no watering is due */
        .dz-status { display: flex; align-items: center; gap: 9px; padding: 14px 16px; border-radius: 16px;
          background: rgba(255,255,255,0.1); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.14);
          font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.9); }
        .dz-status.done { color: ${T.mossBright}; }
        .dz-status-done-txt { flex: 1; min-width: 0; }
        .dz-status-undo { flex-shrink: 0; margin-left: auto; font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 700; color: ${palette.white}; background: rgba(255,255,255,0.16); border: none; padding: 6px 13px; border-radius: 100px; cursor: pointer; }
        .dz-status-log { margin-left: auto; font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; color: ${palette.white}; background: rgba(255,255,255,0.16); border: none; padding: 6px 12px; border-radius: 100px; cursor: pointer; }

        /* door affordance */

        /* care-guide cards */
        .cg-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .cg-card { padding: 14px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; }
        .cg-card-wide { grid-column: 1 / -1; }
        .cg-card-key { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${T.moss}; margin-bottom: 7px; }
        .cg-card-val { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 500; color: ${T.ink}; line-height: 1.5; }

        /* pinned sheet CTA */
        .dz-sheet-scroll-pinned { padding-bottom: 12px; }
        .dz-sheet-cta { flex-shrink: 0; padding: 12px ${space.gutter}px calc(24px + env(safe-area-inset-bottom)); border-top: 1px solid ${T.line}; background: ${T.bg}; }
        .dz-cta-btn { display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; height: 54px; border-radius: 16px; border: none; cursor: pointer; background: ${T.moss}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 700; }

        /* journal redesign */
        .jn-chart { background: ${T.card}; border: 1px solid ${T.line}; border-radius: 18px; padding: 16px 16px 10px; margin: 6px 0 24px; }
        .jn-chart-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
        .jn-chart-lbl { font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 700; color: ${T.ink}; }
        .jn-chart-now { font-family: 'Manrope', sans-serif; font-size: 22px; font-weight: 800; }
        .jn-chart-now-u { font-size: 11px; font-weight: 600; color: ${T.inkFaint}; }
        .jn-tl-lbl { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${T.inkFaint}; margin-bottom: 14px; }
        .jn-timeline { display: flex; flex-direction: column; }
        .jn-row { display: flex; gap: 14px; }
        .jn-marker { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; padding-top: 16px; }
        .jn-dot { width: 11px; height: 11px; border-radius: 50%; z-index: 1; box-shadow: 0 0 0 3px ${T.bg}; }
        .jn-line { flex: 1; width: 2px; background: ${T.line}; margin-top: 2px; }
        .jn-card { flex: 1; display: flex; align-items: center; gap: 13px; padding: 12px; margin-bottom: 12px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; }
        .jn-photo { border-radius: 12px; overflow: hidden; flex-shrink: 0; }
        .jn-body { flex: 1; min-width: 0; }
        .jn-note { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 600; color: ${T.ink}; line-height: 1.35; }
        .jn-when { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkFaint}; margin-top: 3px; }
        .jn-health { font-family: 'Manrope', sans-serif; font-size: 17px; font-weight: 800; flex-shrink: 0; }

        /* TIER 1 — canvas vitals strip */
        .dz-vitals { display: flex; align-items: center; margin: 20px ${space.gutter}px 0; padding: 14px 4px; border-radius: 16px;
          background: rgba(255,255,255,0.1); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.14);
          opacity: 0; transform: translateY(12px); transition: opacity .7s ease .15s, transform .7s ease .15s; }
        .dz-vitals.in { opacity: 1; transform: translateY(0); }
        .dz-vital { flex: 1; text-align: center; }
        .dz-vital-num { display: inline-block; font-family: 'Manrope', sans-serif; font-size: 20px; font-weight: 800; color: ${palette.white}; line-height: 1; }
        .dz-vital-lbl { font-family: 'Manrope', sans-serif; font-size: 10.5px; font-weight: 500; color: rgba(255,255,255,0.65); margin-top: 5px; }
        .dz-vital-div { width: 1px; height: 30px; background: rgba(255,255,255,0.16); }

        /* trend band */
        .dz-trend { display: flex; align-items: center; gap: 14px; margin: 10px ${space.gutter}px 0; padding: 12px 16px; border-radius: 16px;
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
          opacity: 0; transform: translateY(12px); transition: opacity .7s ease .2s, transform .7s ease .2s; }
        .dz-trend.in { opacity: 1; transform: translateY(0); }
        .dz-trend-l { flex: 1; min-width: 0; }
        .dz-trend-dir { display: flex; align-items: center; gap: 6px; font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 800; }
        .dz-trend-sub { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: rgba(255,255,255,0.6); margin-top: 3px; }
        .dz-trend-spark { width: 92px; flex-shrink: 0; }

        /* rhythm band */
        .dz-rhythm { display: flex; align-items: center; margin: 10px ${space.gutter}px 0; padding: 13px 12px; border-radius: 16px;
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
          opacity: 0; transform: translateY(12px); transition: opacity .7s ease .25s, transform .7s ease .25s; }
        .dz-rhythm.in { opacity: 1; transform: translateY(0); }
        .dz-rhythm-step { flex: 1; text-align: center; }
        .dz-rhythm-k { font-family: 'Manrope', sans-serif; font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.04em; }
        .dz-rhythm-v { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 700; color: ${palette.white}; margin-top: 4px; }
        .dz-rhythm-arrow { flex-shrink: 0; display: flex; padding: 0 2px; }


        /* sheet subtitle */
        .dz-sheet-sub { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 600; color: ${T.inkSoft}; margin-top: 5px; }

        /* TIER 2 — verdict + digest */
        .dz-verdict { margin: 18px 0 0; display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 14px; border: 1px solid; border-radius: 16px; }
        .dz-verdict-ic { flex-shrink: 0; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
        .dz-verdict-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .dz-verdict-title { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 700; color: ${T.ink}; }
        .dz-verdict-sub { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 500; color: ${T.inkSoft}; line-height: 1.4; }
        .dz-verdict-cta { flex-shrink: 0; font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 700; color: ${palette.white}; background: ${color.watch}; border: none; padding: 8px 15px; border-radius: 100px; cursor: pointer; }
        .dz-do-now { margin-top: 12px; padding: 15px 16px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; }
        .dz-do-now-lbl { font-family: 'Manrope', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${T.clay}; }
        .dz-do-now-step { font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 700; color: ${T.ink}; margin-top: 7px; }
        .dz-do-now-detail { font-family: 'Manrope', sans-serif; font-size: 13px; color: ${T.inkSoft}; line-height: 1.5; margin-top: 4px; }

        /* the one-tap expander to tier 3 */
        .dz-more { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; margin-top: 16px; padding: 13px; border-radius: 14px;
          border: none; background: transparent; color: ${T.moss}; font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 700; cursor: pointer; }
        .dz-full { margin-top: 18px; animation: dxOpen .3s ease; }
        @keyframes dxOpen { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .dz-full-lbl { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${T.inkFaint}; margin-bottom: 10px; margin-top: 4px; }

        /* care conditions (digest) */
        .cg-cond { margin-top: 14px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; overflow: hidden; }
        .cg-cond-row { display: flex; align-items: center; gap: 12px; padding: 13px 15px; border-top: 1px solid ${T.line}; }
        .cg-cond-row:first-child { border-top: none; }
        .cg-cond-ic { width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .cg-cond-body { flex: 1; }
        .cg-cond-label { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; color: ${T.ink}; }
        .cg-cond-have { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkFaint}; margin-top: 1px; }
        .cg-cond-flag { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; }
        /* merged condition + slider rows */
        .cg-merge { padding: 15px; border-top: 1px solid ${T.line}; }
        .cg-merge:first-child { border-top: none; }
        .cg-merge-head { display: flex; align-items: center; gap: 12px; }
        .cg-merge-track { margin-top: 12px; }
        .cg-merge .cg-detail-note { margin-top: 10px; }
        /* move affordance in verdict — reuses the Rooms page button */

        /* care full detail */
        .cg-detail { margin-bottom: 20px; }
        .cg-detail-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; }
        .cg-detail-label { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; color: ${T.ink}; }
        .cg-detail-flag { font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 700; }
        .cg-detail-note { font-family: 'Manrope', sans-serif; font-size: 12.5px; color: ${T.inkSoft}; margin-top: 9px; line-height: 1.5; }
        .cg-match-legend { display: flex; gap: 16px; margin-top: 9px; }
        .cg-match-key { display: inline-flex; align-items: center; gap: 6px; font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 600; color: ${T.inkFaint}; }
        .cg-match-key i { flex-shrink: 0; }
        .cg-key-have { width: 10px; height: 10px; border-radius: 50%; }
        .cg-key-need { width: 2px; height: 12px; background: ${T.ink}; border-radius: 2px; }
        .cg-know { margin-top: 14px; padding: 15px 16px; background: ${T.moss}0c; border: 1px solid ${T.moss}22; border-radius: 16px; }
        .cg-know-lbl { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${T.moss}; margin-bottom: 6px; }
        .cg-know-txt { font-family: 'Manrope', sans-serif; font-size: 13.5px; color: ${T.ink}; line-height: 1.55; }

        /* journal trend digest */
        .jn-compare { display: flex; align-items: center; gap: 8px; margin-top: 18px; padding: 18px 14px; background: linear-gradient(135deg, ${T.moss}0c, ${T.card}); border: 1px solid ${T.line}; border-radius: 18px; }
        .jn-compare-side { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 7px; }
        .jn-compare-photo { border-radius: 16px; overflow: hidden; opacity: 0.9; }
        .jn-compare-photo.now { opacity: 1; }
        .jn-compare-when { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 600; color: ${T.inkFaint}; }
        .jn-compare-h { font-family: 'Manrope', sans-serif; font-size: 20px; font-weight: 800; line-height: 1; }
        .jn-compare-mid { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
        .jn-compare-delta { font-family: 'Manrope', sans-serif; font-size: 17px; font-weight: 800; }
        .jn-trend { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding: 16px 18px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; }
        .jn-trend-txt { font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 700; line-height: 1.3; }
        .jn-trend-sub { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkFaint}; margin-top: 3px; }
        .jn-trend-num { font-family: 'Manrope', sans-serif; font-size: 34px; font-weight: 800; line-height: 1; }
        .jn-latest { margin-top: 16px; }
        .jn-latest-lbl { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${T.inkFaint}; margin-bottom: 10px; }

        .dt-section-lbl { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: ${T.ink}; margin-bottom: 12px; }
        .dt-match-list { display: flex; flex-direction: column; gap: 16px; margin-bottom: 22px; }
        .dt-match-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .dt-match-label { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 700; color: ${T.ink}; }
        .dt-match-flag { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; }
        .dt-match-track { position: relative; height: 8px; border-radius: 4px; background: ${T.bg}; }
        .dt-match-fill { position: absolute; top: 0; left: 0; height: 100%; border-radius: 4px; }
        .dt-match-need { position: absolute; top: -3px; width: 2px; height: 14px; background: ${T.ink}; border-radius: 2px; z-index: 2; }
        .dt-match-have { position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 50%; transform: translate(-50%, -50%); border: 2px solid ${T.card}; z-index: 3; }
        .dt-match-legend { display: flex; justify-content: space-between; margin-top: 8px; font-family: 'Manrope', sans-serif; font-size: 10.5px; color: ${T.inkFaint}; }

        .dt-diag-herotop { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .dt-diag-herotext { flex: 1; }

        .dt-journal-chart { background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; padding: 14px 14px 8px; margin-bottom: 16px; }
        .dt-jc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .dt-jc-now { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; }

        .dt-topnav { padding: 12px 20px 0; }
        .dt-icon { width: 40px; height: 40px; border-radius: 50%; border: 1px solid ${T.line}; background: ${T.card}; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .dt-hero { display: flex; gap: 16px; align-items: center; padding: 14px ${space.gutter}px 0; opacity: 0; transform: translateY(10px); transition: opacity .6s ease, transform .6s ease; }
        .dt-hero.in { opacity: 1; transform: translateY(0); }
        .dt-photo-wrap { border-radius: 20px; overflow: hidden; box-shadow: 0 8px 22px rgba(28,36,25,0.14); }
        .dt-nick { font-family: 'Manrope', sans-serif; font-size: 26px; font-weight: 700; color: ${T.ink}; line-height: 1.05; }
        .dt-latin { font-family: 'Manrope', sans-serif; font-size: 12px; color: ${T.inkFaint}; margin-top: 3px; }
        .dt-badges { display: flex; gap: 7px; margin-top: 10px; }
        .dt-badge { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 600; padding: 5px 11px; border-radius: 100px; }
        .dt-badge.ghost { background: ${T.bg}; color: ${T.inkSoft}; border: 1px solid ${T.line}; }
        .dt-topnav { padding: 12px 20px 0; display: flex; align-items: center; justify-content: space-between; }
        .dt-topnav-title { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 600; color: ${T.ink}; opacity: 0.85; }
        .dt-next { display: flex; align-items: center; gap: 12px; margin: 20px ${space.gutter}px 0; padding: 13px 15px; background: ${T.card}; border: 1.5px solid; border-radius: 16px; cursor: pointer;
          opacity: 0; transform: translateY(8px); transition: opacity .6s ease .1s, transform .6s ease .1s; }
        .dt-next.in { opacity: 1; transform: translateY(0); }
        .dt-next-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .dt-next-spark { width: 10px; height: 10px; border-radius: 3px; transform: rotate(45deg); animation: dtpulse 1.8s ease-in-out infinite; }
        .dt-next-body { flex: 1; }
        .dt-next-label { font-family: 'Manrope', sans-serif; font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: ${T.inkFaint}; }
        .dt-next-text { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 600; color: ${T.ink}; margin-top: 2px; line-height: 1.35; }

        .dt-vitals { display: flex; gap: 10px; margin: 16px ${space.gutter}px 0; }
        .dt-vital { flex: 1; padding: 12px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; }
        .dt-vital-top { display: flex; align-items: baseline; gap: 5px; }
        .dt-vital-num { font-family: 'Manrope', sans-serif; font-size: 20px; font-weight: 600; color: ${T.ink}; line-height: 1; }
        .dt-vital-unit { font-size: 11px; opacity: 0.6; }
        .dt-vital-trend { font-family: 'Manrope', sans-serif; font-size: 10px; font-weight: 600; }
        .dt-vital-lbl { font-family: 'Manrope', sans-serif; font-size: 10px; color: ${T.inkFaint}; margin-top: 3px; }
        .dt-vital-spark { margin-top: 8px; height: 32px; }
        .dt-vital-bar { margin-top: 10px; height: 4px; border-radius: 3px; background: ${T.bg}; overflow: hidden; }
        .dt-vital-fill { height: 100%; border-radius: 3px; }
        .dt-water { display: flex; align-items: center; justify-content: center; gap: 8px; width: calc(100% - 48px); margin: 16px ${space.gutter}px 0; height: 50px; border-radius: 16px; background: ${T.moss}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 14.5px; font-weight: 600; border: none; cursor: pointer; transition: background .3s ease; }
        .dt-water.done { background: ${T.mossBright}; }
        .dt-tabs { display: flex; gap: 6px; margin: 22px ${space.gutter}px 0; padding: 4px; background: ${T.bg}; border-radius: 14px; }
        .dt-tab { flex: 1; height: 38px; border-radius: 11px; border: none; background: transparent; cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 600; color: ${T.inkSoft}; transition: all .2s ease; }
        .dt-tab.active { background: ${T.card}; color: ${T.ink}; box-shadow: 0 1px 4px rgba(28,36,25,0.08); }
        .dt-panel { margin: 18px ${space.gutter}px 0; }
        .dt-env-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        .dt-env-card { padding: 12px 13px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 14px; }
        .dt-env-label { font-family: 'Manrope', sans-serif; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: ${T.inkFaint}; }
        .dt-env-val { font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 600; color: ${T.ink}; margin-top: 4px; line-height: 1.3; }
        .dt-env-bar { margin-top: 9px; height: 4px; border-radius: 3px; background: ${T.bg}; overflow: hidden; }
        .dt-env-fill { height: 100%; border-radius: 3px; }
        .dt-care-block { border-top: 1px solid ${T.line}; padding-top: 4px; }
        .dt-care-row { display: flex; gap: 14px; align-items: flex-start; padding: 14px 0; border-top: 1px solid ${T.line}; }
        .dt-care-row:first-child { border-top: none; }
        .dt-care-icon { font-size: 18px; width: 24px; text-align: center; }
        .dt-care-h { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 600; color: ${T.ink}; }
        .dt-care-b { font-family: 'Manrope', sans-serif; font-size: 13px; line-height: 1.5; color: ${T.inkSoft}; margin-top: 2px; }

        .dt-diag-hero { padding: 16px; border: 1px solid; border-radius: 18px; }
        .dt-diag-badge { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 100px; font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 600; background: rgba(255,255,255,0.6); }
        .dt-pulse { width: 7px; height: 7px; border-radius: 50%; animation: dtpulse 1.8s ease-in-out infinite; }
        @keyframes dtpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .dt-diag-title { font-family: 'Manrope', sans-serif; font-size: 20px; font-weight: 700; color: ${T.ink}; margin-top: 12px; }
        .dt-diag-summary { font-family: 'Manrope', sans-serif; font-size: 13px; line-height: 1.55; color: ${T.inkSoft}; margin-top: 8px; }
        .dt-diag-meta { display: flex; gap: 8px; margin-top: 14px; }
        .dt-diag-meta-item { flex: 1; display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; background: rgba(255,255,255,0.55); border-radius: 11px; }
        .dt-diag-meta-lbl { font-family: 'Manrope', sans-serif; font-size: 8.5px; letter-spacing: 0.06em; text-transform: uppercase; color: ${T.inkFaint}; }
        .dt-diag-meta-val { font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 600; color: ${T.ink}; text-transform: capitalize; }
        .dt-diag-section-label { font-family: 'Manrope', sans-serif; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: ${T.inkFaint}; margin-top: 20px; margin-bottom: 8px; }
        .dz-full-lbl-spacer { height: 0; }
        .dt-ifignored { display: flex; align-items: flex-start; gap: 9px; margin-top: 16px; padding: 12px 14px; background: ${T.clay}0e; border: 1px solid ${T.clay}22; border-radius: 14px; font-family: 'Manrope', sans-serif; font-size: 12.5px; line-height: 1.5; color: ${T.ink}; }
        .dt-ifignored svg { flex-shrink: 0; margin-top: 1px; }
        .dt-revive-head { display: flex; align-items: center; justify-content: space-between; margin-top: 20px; margin-bottom: 8px; }
        .dt-revive-progress { font-family: 'Manrope', sans-serif; font-size: 10px; font-weight: 600; color: ${T.inkSoft}; }
        .dt-revive-track { height: 5px; border-radius: 3px; background: ${T.bg}; overflow: hidden; margin-bottom: 10px; }
        .dt-revive-trackfill { height: 100%; border-radius: 3px; transition: width .4s cubic-bezier(.2,.8,.2,1); }
        .dt-revive { display: flex; gap: 12px; width: 100%; padding: 12px 0; border-top: 1px solid ${T.line}; background: transparent; border-left: none; border-right: none; border-bottom: none; cursor: pointer; text-align: left; }
        .dt-revive-check { width: 22px; height: 22px; border-radius: 7px; border: 1.6px solid; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .2s ease; }
        .dt-revive-content { flex: 1; }
        .dt-revive-step { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 600; color: ${T.ink}; transition: opacity .2s ease; }
        .dt-revive.done .dt-revive-step { text-decoration: line-through; opacity: 0.5; }
        .dt-revive-detail { font-family: 'Manrope', sans-serif; font-size: 12.5px; line-height: 1.45; color: ${T.inkSoft}; margin-top: 2px; }
        .dt-revive.done .dt-revive-detail { opacity: 0.5; }
        .dt-outlook { display: flex; align-items: flex-start; gap: 9px; margin-top: 10px; padding: 13px 15px; background: ${T.moss}11; border-radius: 14px; font-family: 'Manrope', sans-serif; font-size: 13px; line-height: 1.5; color: ${T.moss}; }
        .dt-outlook svg { flex-shrink: 0; margin-top: 2px; }
        .dt-rescan { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 46px; margin-top: 12px; border-radius: 14px; border: 1.4px solid ${T.moss}44; background: transparent; color: ${T.moss}; font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; }
        .dt-add-photo { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 46px; border-radius: 14px; border: 1.4px dashed ${T.moss}66; background: ${T.moss}0a; color: ${T.moss}; font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 18px; }
        .dt-tl-row { display: flex; gap: 12px; }
        .dt-tl-marker { display: flex; flex-direction: column; align-items: center; padding-top: 6px; }
        .dt-tl-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .dt-tl-line { width: 1.5px; flex: 1; background: ${T.line}; margin: 4px 0; min-height: 30px; }
        .dt-tl-card { flex: 1; display: flex; gap: 12px; align-items: center; padding-bottom: 16px; }
        .dt-tl-photo { border-radius: 12px; overflow: hidden; }
        .dt-tl-note { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 600; color: ${T.ink}; }
        .dt-tl-when { font-family: 'Manrope', sans-serif; font-size: 10px; color: ${T.inkFaint}; margin-top: 2px; }

        /* rooms */
        .rx-weather { display: flex; align-items: flex-start; gap: 9px; margin: 16px ${space.gutter}px 0; padding: 11px 14px; background: ${T.bg}; border: 1px solid ${T.line}; border-radius: 14px; }
        .rm-overview { margin: 18px ${space.gutter}px 0; padding: 18px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 18px; }
        .rm-ov-hero { display: flex; align-items: center; gap: 16px; }
        .rm-ov-ring { position: relative; width: 76px; height: 76px; flex-shrink: 0; }
        .rm-ov-ring-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: 'Manrope', sans-serif; font-size: 26px; font-weight: 800; }
        .rm-ov-hero-body { flex: 1; min-width: 0; }
        .rm-ov-hero-lbl { font-family: 'Manrope', sans-serif; font-size: 16px; font-weight: 800; color: ${T.ink}; }
        .rm-ov-hero-stats { display: flex; align-items: center; gap: 9px; margin-top: 6px; font-family: 'Manrope', sans-serif; font-size: 12.5px; color: ${T.inkSoft}; }
        .rm-ov-hero-stats b { color: ${T.ink}; font-weight: 800; }
        .rm-ov-hero-dot { width: 3px; height: 3px; border-radius: 50%; background: ${T.inkFaint}; }
        .rm-ov-hero-weather { display: inline-flex; align-items: center; gap: 4px; color: ${T.inkFaint}; }
        .rm-ov-bar { display: flex; height: 4.5px; border-radius: 100px; overflow: hidden; gap: 2px; margin-top: 18px; }
        .rm-ov-bar > div { border-radius: 2px; }
        .rm-ov-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 11px; }
        .rm-ov-legend span { display: inline-flex; align-items: center; gap: 5px; font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 600; color: ${T.inkSoft}; }
        .rm-ov-legend i { width: 7px; height: 7px; border-radius: 50%; }
        .rx-weather-ic { flex-shrink: 0; margin-top: 1px; }
        .rx-weather-txt { font-family: 'Manrope', sans-serif; font-size: 11.5px; line-height: 1.45; color: ${T.inkSoft}; }
        .rx-suggest-move { flex-shrink: 0; padding: 6px 14px; border-radius: 100px; border: none; background: ${T.moss}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; cursor: pointer; }
        .rx-room-id { min-width: 0; flex: 1; }
        .rx-env-hum { border: none; cursor: pointer; }
        .rx-env-src { font-family: 'Manrope', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${T.inkSoft}; background: rgba(28,36,25,0.06); padding: 1px 5px; border-radius: 5px; margin-left: 5px; }
        .rx-env-caret { margin-left: 4px; transition: transform .3s ease; }
        .rx-hum-reveal { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .32s cubic-bezier(.3,.8,.3,1), opacity .28s ease; }
        .rx-hum-reveal.open { grid-template-rows: 1fr; opacity: 1; }
        .rx-hum-reveal-inner { overflow: hidden; min-height: 0; }
        .rx-hum-edit { margin-top: 14px; padding: 14px; background: ${T.bg}; border-radius: 14px; }
        .rx-hum-edit-lbl { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${T.inkFaint}; margin-bottom: 10px; }
        .rx-hum-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .rx-hum-chip { display: flex; align-items: center; justify-content: space-between; padding: 10px 13px; border-radius: 11px; border: 1.3px solid ${T.line}; background: ${T.card}; cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 600; color: ${T.ink}; }
        .rx-hum-chip.on { border-color: ${T.moss}; background: ${T.moss}12; }
        .rx-hum-chip-v { font-size: 11px; font-weight: 700; color: ${T.inkFaint}; }
        .rx-hum-reset { margin-top: 10px; width: 100%; padding: 9px; border: none; background: transparent; color: ${T.moss}; font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 700; cursor: pointer; }
        /* plant chips — aligned columns, action only when it means something */
        .rx-plants { display: flex; gap: 16px; margin-top: 16px; overflow-x: auto; padding: 4px 2px 2px; }
        .rx-plants::-webkit-scrollbar { display: none; }
        .rx-plant { display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0; min-width: 72px; }
        .rx-plant-tap { display: flex; flex-direction: column; align-items: center; gap: 7px; border: none; background: transparent; cursor: pointer; width: 72px; padding: 0; }
        .rx-plant-photo { border-radius: 50%; }
        .rx-plant-name { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 600; color: ${T.ink}; line-height: 1.25; text-align: center; width: 72px; word-break: break-word; }
        .rx-plant-move { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 100px; border: none; background: ${color.watch}10; color: ${color.watch}; font-family: 'Manrope', sans-serif; font-size: 10.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .rx-plant-move svg { flex-shrink: 0; }
        .rx-plant-ok { display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 4px 2px; font-family: 'Manrope', sans-serif; font-size: 10.5px; font-weight: 600; color: ${T.moss}; opacity: 0.82; white-space: nowrap; pointer-events: none; user-select: none; }
        .rx-plant-ok.best { color: ${color.watch}; gap: 4px; }
        /* move picker sheet */
        .rx-move-scrim { position: absolute; inset: 0; background: rgba(10,14,10,0.5); z-index: 60; animation: dzFade .25s ease; }
        .rx-move-sheet { position: absolute; left: 0; right: 0; bottom: 0; background: ${T.bg}; border-radius: 28px 28px 0 0; z-index: 61; padding: 0 ${space.gutter}px calc(28px + env(safe-area-inset-bottom)); animation: dzSheetUp .4s cubic-bezier(.2,.85,.25,1); box-shadow: 0 -12px 40px rgba(0,0,0,0.3); }
        .rx-move-head { display: flex; align-items: center; gap: 13px; padding: 6px 0 18px; }
        .rx-move-photo { border-radius: 50%; overflow: hidden; box-shadow: 0 0 0 2px ${T.line}; }
        .rx-move-title { font-family: 'Manrope', sans-serif; font-size: 19px; font-weight: 800; color: ${T.ink}; }
        .rx-move-sub { font-family: 'Manrope', sans-serif; font-size: 12.5px; color: ${T.inkFaint}; margin-top: 2px; }
        .rx-move-list { display: flex; flex-direction: column; gap: 10px; }
        .rx-move-room { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 16px; border: 1px solid ${T.line}; background: ${T.card}; cursor: pointer; text-align: left; }
        .rx-move-tip { display: flex; align-items: flex-start; gap: 10px; margin: 4px 0 16px; padding: 13px 14px; border-radius: 14px; background: ${T.moss}0f; border: 1px solid ${T.moss}22; }
        .rx-move-tip.ok { background: ${T.bg}; border-color: ${T.line}; }
        .rx-move-tip-ic { flex-shrink: 0; margin-top: 1px; }
        .rx-move-tip-txt { font-family: 'Manrope', sans-serif; font-size: 12.5px; line-height: 1.5; color: ${T.inkSoft}; }
        .rx-move-tip-txt b { color: ${T.ink}; font-weight: 700; }
        .rx-move-room.best { border-color: ${T.moss}; background: ${T.moss}0d; }
        .rx-move-besttag { display: inline-block; margin-left: 7px; padding: 1px 7px; border-radius: 100px; background: ${T.moss}; color: ${palette.white}; font-size: 9px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; vertical-align: middle; }
        .rx-move-room.current { opacity: 0.55; cursor: default; }
        .rx-move-room-name { font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 700; color: ${T.ink}; }
        .rx-move-here { font-weight: 500; color: ${T.inkFaint}; font-size: 12px; }
        .rx-move-room-env { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkFaint}; margin-top: 3px; }
        .rx-move-fit { font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 800; text-align: right; flex-shrink: 0; }
        .rx-move-fit-bar { display: block; width: 54px; height: 4px; border-radius: 2px; background: ${T.line}; margin-top: 5px; overflow: hidden; }
        .rx-move-fit-bar > span { display: block; height: 100%; border-radius: 2px; }
        /* ---- rooms as micro-climates (rx-) ---- */
        .rx-suggest { margin: 18px ${space.gutter}px 0; padding: 15px 16px; border-radius: 18px; background: ${T.moss}0c; border: 1px solid ${T.moss}22; }
        .rx-suggest-head { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; }
        .rx-suggest-spark { width: 8px; height: 8px; border-radius: 2px; background: ${T.moss}; transform: rotate(45deg); }
        .rx-suggest-lbl { font-family: 'Manrope', sans-serif; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${T.moss}; }
        .rx-suggest-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 0; border: none; background: transparent; cursor: pointer; text-align: left; border-top: none; }
        .rx-suggest-row:first-of-type { border-top: none; }
        .rx-suggest-txt { flex: 1; font-family: 'Manrope', sans-serif; font-size: 13px; line-height: 1.5; color: ${T.ink}; }
        .rx-suggest-txt b { font-weight: 700; }
        .rx-room { margin: 20px ${space.gutter}px 0; padding: 18px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 20px; }
        .rx-room-top { display: flex; align-items: flex-start; justify-content: space-between; }
        .rx-room-name { font-family: 'Manrope', sans-serif; font-size: 19px; font-weight: 800; color: ${T.ink}; letter-spacing: -0.01em; }
        .rx-room-note { font-family: 'Manrope', sans-serif; font-size: 12px; color: ${T.inkFaint}; margin-top: 3px; }
        .rx-room-climate { text-align: right; flex-shrink: 0; }
        .rx-room-avg { font-family: 'Manrope', sans-serif; font-size: 26px; font-weight: 800; line-height: 1; }
        .rx-room-avg-lbl { font-family: 'Manrope', sans-serif; font-size: 9.5px; font-weight: 500; color: ${T.inkFaint}; margin-top: 3px; }
        .rx-env { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .rx-env-item { display: flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 100px; background: ${T.bg}; font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 600; color: ${T.inkSoft}; }
        .rx-env-item.warn { background: ${color.watch}14; color: ${color.watch}; }
        .rx-env-ic { display: flex; }

        /* ---- AI notification inbox (nx-) ---- */
        .nx-empty { margin: 40px 32px 0; text-align: center; }
        .nx-empty-ic { width: 56px; height: 56px; border-radius: 50%; background: ${T.moss}14; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
        .nx-empty-title { font-family: 'Manrope', sans-serif; font-size: 17px; font-weight: 800; color: ${T.ink}; }
        .nx-empty-sub { font-family: 'Manrope', sans-serif; font-size: 13.5px; color: ${T.inkFaint}; line-height: 1.5; margin-top: 8px; }
        .nx-focus { margin: 18px ${space.gutter}px 0; padding: 18px; border: 1.5px solid; border-radius: 20px; background: ${T.card}; }
        .nx-focus-lbl { display: flex; align-items: center; gap: 7px; font-family: 'Manrope', sans-serif; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
        .nx-focus-spark { width: 8px; height: 8px; border-radius: 50%; animation: dtpulse 1.8s ease-in-out infinite; }
        .nx-focus-title { font-family: 'Manrope', sans-serif; font-size: 20px; font-weight: 800; color: ${T.ink}; margin-top: 11px; letter-spacing: -0.01em; }
        .nx-focus-why { font-family: 'Manrope', sans-serif; font-size: 13.5px; color: ${T.inkSoft}; line-height: 1.5; margin-top: 6px; }
        .nx-focus-acts { display: flex; gap: 10px; margin-top: 16px; }
        .nx-focus-go { flex: 1; height: 46px; border-radius: 14px; border: none; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; }
        .nx-focus-snooze { padding: 0 20px; height: 46px; border-radius: 14px; border: 1px solid ${T.line}; background: transparent; color: ${T.inkSoft}; font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; }
        .nx-batch { margin: 14px ${space.gutter}px 0; padding: 16px; background: ${T.mossBright}0e; border: 1px solid ${T.mossBright}2a; border-radius: 18px; }
        .nx-batch-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .nx-batch-title { font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 800; color: ${T.ink}; }
        .nx-batch-sub { font-family: 'Manrope', sans-serif; font-size: 12px; color: ${T.inkSoft}; margin-top: 3px; line-height: 1.4; }
        .nx-batch-go { flex-shrink: 0; padding: 0 16px; height: 40px; border-radius: 12px; border: none; background: ${T.moss}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; }
        .nx-batch-avatars { display: flex; margin-top: 14px; }
        .nx-batch-av { margin-right: -8px; border: none; border-radius: 50%; }
        .nx-batch-av > div { box-shadow: 0 0 0 2px ${T.bg}; }
        .nx-group { margin-top: 26px; }
        .nx-group-lbl { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${T.inkFaint}; margin: 0 ${space.gutter}px 10px; }
        .nx-task { display: flex; align-items: center; margin: 0 ${space.gutter}px 10px; padding: 12px 14px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; }
        .nx-task-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; border: none; background: transparent; cursor: pointer; text-align: left; padding: 0; }
        .nx-task-ic { width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .nx-task-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .nx-task-title { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; color: ${T.ink}; }
        .nx-task-why { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkFaint}; line-height: 1.4; }
        .nx-task-acts { display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: 10px; }
        .nx-act { border: none; cursor: pointer; font-family: 'Manrope', sans-serif; font-weight: 700; }
        .nx-act.primary { padding: 8px 14px; border-radius: 100px; background: ${T.moss}; color: ${palette.white}; font-size: 12.5px; }
        .nx-act.ghost { width: 34px; height: 34px; border-radius: 50%; background: ${T.bg}; display: flex; align-items: center; justify-content: center; }
        .rm-head { padding: 16px ${space.gutter}px 0; }
        /* view toggle (deck / list) */
        .vtoggle { display: flex; gap: 3px; padding: 3px; background: ${T.bg}; border-radius: 12px; }
        .vtoggle-btn { width: 34px; height: 30px; border-radius: 9px; border: none; background: transparent; cursor: pointer; color: ${T.inkFaint}; display: flex; align-items: center; justify-content: center; transition: all .2s ease; }
        .vtoggle-btn.active { background: ${T.card}; color: ${T.ink}; box-shadow: 0 1px 4px rgba(28,36,25,0.1); }

        /* Apple Wallet-style vertical card stack */
        .wal-wrap { padding: 16px 20px 0; }
        .wal-stage { position: relative; transition: height .45s cubic-bezier(.2,.8,.2,1); }
        .wal-card { position: absolute; left: 0; right: 0; border-radius: 22px; overflow: hidden; cursor: pointer;
          box-shadow: 0 8px 22px rgba(28,36,25,0.16);
          transition: top .45s cubic-bezier(.2,.8,.2,1), height .45s cubic-bezier(.2,.8,.2,1), box-shadow .3s ease, background .35s ease; will-change: top, height; }
        .wal-card.exp { box-shadow: 0 20px 48px rgba(28,36,25,0.28); }
        .wal-pin { flex-shrink: 0; margin-left: 1px; }
        .wal-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.18); z-index: 5; pointer-events: none; }
        .wal-card.exp::before { display: none; }
        .wal-head { position: relative; z-index: 4; height: 74px; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; }
        .wal-head-left { display: flex; align-items: center; min-width: 0; }
        .pl-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .pl-id-top { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
        .pl-id-name { font-family: 'Manrope', sans-serif; font-size: 16px; font-weight: 700; white-space: nowrap; color: ${T.ink}; }
        .pl-id-species { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${T.inkFaint}; min-width: 0; }
        .pl-id-room { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 500; color: ${T.inkFaint}; white-space: nowrap; }
        .pl-id.dark .pl-id-name { color: ${palette.white}; }
        .pl-id.dark .pl-id-species { color: rgba(255,255,255,0.7); }
        .pl-id.dark .pl-id-room { color: rgba(255,255,255,0.6); }
        .wal-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; align-self: center; }
        .wal-head-right { display: flex; align-items: center; flex-shrink: 0; }
        .wal-action { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.18); padding: 4px 11px; border-radius: 100px; }
        .wal-action.attn { box-shadow: 0 2px 10px rgba(0,0,0,0.28); }
        .wal-action.attn .wal-action-sep { color: rgba(255,255,255,0.65); }
        .wal-action-health { font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 800; color: ${palette.white}; }
        .wal-action-sep { color: rgba(255,255,255,0.5); font-size: 11px; }
        .wal-action-txt { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.92); white-space: nowrap; }
        .wal-collapse { width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(255,255,255,0.18); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .wal-body { position: absolute; inset: 0; }
        .wal-photo { position: absolute; inset: 0; }
        .wal-photo > div { width: 100% !important; height: 100% !important; border-radius: 0 !important; }
        .wal-body::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,28,20,0.35) 0%, transparent 22%, transparent 45%, rgba(20,28,20,0.82) 100%); pointer-events: none; }
        .wal-heart { position: absolute; top: 14px; right: 16px; width: 42px; height: 42px; border-radius: 50%; background: rgba(255,255,255,0.6); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 5; box-shadow: 0 4px 14px rgba(0,0,0,0.12); }
        .wal-info { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px; z-index: 5; }
        .wal-meta-row { display: flex; align-items: center; gap: 8px; }
        .wal-status { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 700; padding: 4px 11px; border-radius: 100px; }
        .wal-vitals { display: flex; align-items: center; gap: 12px; margin-top: 14px; padding: 13px 16px; border-radius: 16px; background: rgba(255,255,255,0.14); backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); border: 1px solid rgba(255,255,255,0.22); }
        .wal-vital { flex: 1; text-align: center; }
        .wal-vital-num { font-family: 'Manrope', sans-serif; font-size: 17px; font-weight: 800; color: ${palette.white}; line-height: 1; }
        .wal-vital-lbl { font-family: 'Manrope', sans-serif; font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.7); margin-top: 4px; }
        .wal-vital-sep { width: 1px; height: 24px; background: rgba(255,255,255,0.2); }
        .wal-open { display: flex; align-items: center; justify-content: center; gap: 5px; margin-top: 12px; font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.85); }
        .wal-hint { text-align: center; font-family: 'Manrope', sans-serif; font-size: 11px; color: ${T.inkFaint}; margin-top: 18px; }

        /* all-plants flat list */
        .ap-search { position: relative; display: flex; align-items: center; margin: 16px ${space.gutter}px 0; }
        .ap-search-ic { position: absolute; left: 15px; pointer-events: none; }
        .ap-search-input { width: 100%; height: 44px; padding: 0 40px 0 42px; border-radius: 13px; border: 1.3px solid ${T.line}; background: ${T.card}; font-family: 'Manrope', sans-serif; font-size: 14.5px; font-weight: 600; color: ${T.ink}; outline: none; }
        .ap-search-input::placeholder { color: ${T.inkFaint}; font-weight: 500; }
        .ap-search-input:focus { border-color: ${T.inkSoft}; }
        .ap-search-clear { position: absolute; right: 10px; width: 26px; height: 26px; border: none; background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .ap-sorts { display: flex; gap: 7px; padding: 14px ${space.gutter}px 0; }
        .ap-sort { padding: 7px 13px; border-radius: 100px; border: 1.3px solid ${T.line}; background: ${T.card}; cursor: pointer;
          font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 600; color: ${T.inkSoft}; }
        .ap-sort.active { background: ${T.ink}; border-color: ${T.ink}; color: ${T.bg}; }
        .apl-list { margin: 16px ${space.gutter}px 0; display: flex; flex-direction: column; gap: 10px; }
        .apl-row { position: relative; display: flex; align-items: center; gap: 13px; width: 100%; padding: 13px 14px; border: 1px solid ${T.line}; background: ${T.card};
          border-radius: 16px; cursor: pointer; text-align: left; transition: transform .15s ease, box-shadow .2s ease; overflow: hidden; }
        .apl-row:active { transform: scale(0.99); }
        .apl-row.attn { border-color: ${T.clay}44; background: ${T.clay}07; }
        .apl-photo { border-radius: 50%; flex-shrink: 0; }
        .apl-body { flex: 1; min-width: 0; }
        .apl-side { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; }
        .apl-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 100px; background: ${T.bg}; white-space: nowrap; }
        .apl-pill-health { font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 800; color: ${T.ink}; }
        .apl-pill-sep { color: ${T.inkFaint}; font-size: 10px; }
        .apl-pill-txt { font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 600; color: ${T.inkSoft}; }
        .apl-pill.attn { box-shadow: 0 2px 9px rgba(0,0,0,0.13); }
        .apl-pill.attn .apl-pill-health { color: ${palette.white}; }
        .apl-pill.attn .apl-pill-sep { color: rgba(255,255,255,0.6); }
        .apl-pill.attn .apl-pill-txt { color: rgba(255,255,255,0.95); }
        .rm-title { font-family: 'Manrope', sans-serif; font-size: 28px; font-weight: 800; color: ${T.ink}; letter-spacing: -0.01em; }
        .rm-sub { font-family: 'Manrope', sans-serif; font-size: 13.5px; color: ${T.inkSoft}; margin-top: 4px; }
        .rm-room { margin: 24px ${space.gutter}px 0; }
        .rm-room-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; }
        .rm-room-name { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 600; color: ${T.ink}; }
        .rm-room-count { font-family: 'Manrope', sans-serif; font-size: 11px; color: ${T.inkFaint}; }
        .rm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .rm-card { display: flex; gap: 12px; align-items: center; padding: 12px; background: ${T.card}; border-radius: 16px; border: 1px solid ${T.line}; cursor: pointer; }
        .rm-card-name { font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 600; color: ${T.ink}; }
        .rm-card-status { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 600; margin-top: 2px; }

        /* add plant */
        .ap-viewfinder { position: absolute; inset: 0; background: radial-gradient(circle at 50% 40%, ${palette.black550} 0%, ${color.chrome} 75%); }
        .ap-close { position: absolute; top: 64px; left: 20px; width: 40px; height: 40px; border-radius: 50%; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 25; cursor: pointer; border: none; }
        .ap-close.light { background: rgba(28,36,25,0.08); }
        .ap-hint { position: absolute; top: 78px; left: 0; right: 0; text-align: center; font-family: 'Manrope', sans-serif; font-size: 13px; color: rgba(255,255,255,0.6); }
        .ap-frame { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 220px; height: 220px; }
        .ap-corner { position: absolute; width: 26px; height: 26px; border-color: ${palette.white}; opacity: 0.85; }
        .ap-corner.tl { top: 0; left: 0; border-top: 2px solid; border-left: 2px solid; border-radius: 6px 0 0 0; }
        .ap-corner.tr { top: 0; right: 0; border-top: 2px solid; border-right: 2px solid; border-radius: 0 6px 0 0; }
        .ap-corner.bl { bottom: 0; left: 0; border-bottom: 2px solid; border-left: 2px solid; border-radius: 0 0 0 6px; }
        .ap-corner.br { bottom: 0; right: 0; border-bottom: 2px solid; border-right: 2px solid; border-radius: 0 0 6px 0; }
        .ap-specimen { position: absolute; top: calc(50% - 20px); left: 50%; transform: translate(-50%,-32%); opacity: 0.85; transition: transform .5s cubic-bezier(.3,1,.4,1); display: flex; align-items: center; justify-content: center; line-height: 0; }
        .ap-specimen.far { transform: translate(-50%,-32%) scale(0.92); }
        /* light field: soft daylight pouring in from above-right — no hard edges */
        .ap-lightfield { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
        .ap-lf-glow { position: absolute; inset: 0; background: radial-gradient(560px 420px at 70% -12%, rgba(246,206,114,0.26) 0%, rgba(246,206,114,0.09) 36%, transparent 60%); animation: apGlowPulse 4s ease-in-out infinite; }
        @keyframes apGlowPulse { 0%,100% { opacity: 0.82; } 50% { opacity: 1; } }
        .ap-lf-rays { position: absolute; top: -60px; bottom: -60px; left: 0; right: 0; }
        .ap-lf-ray { position: absolute; top: 0; left: 70%; height: 100%; transform-origin: top center;
          background: linear-gradient(to bottom, rgba(246,206,114,0.18) 0%, rgba(246,206,114,0.05) 44%, transparent 70%); filter: blur(10px); animation: apRayShimmer 4.5s ease-in-out infinite; }
        .ap-lf-ray.r1 { width: 46px; transform: translateX(-50%) rotate(-22deg); animation-delay: 0s; }
        .ap-lf-ray.r2 { width: 34px; transform: translateX(-50%) rotate(-9deg); animation-delay: .6s; }
        .ap-lf-ray.r3 { width: 40px; transform: translateX(-50%) rotate(5deg); animation-delay: 1.2s; }
        .ap-lf-ray.r4 { width: 26px; transform: translateX(-50%) rotate(17deg); animation-delay: 1.8s; }
        @keyframes apRayShimmer { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        .ap-lf-pool { position: absolute; left: 50%; top: 54%; width: 200px; height: 96px; transform: translate(-50%,-50%);
          background: radial-gradient(ellipse at center, rgba(246,206,114,0.17) 0%, transparent 66%); filter: blur(5px); }
        .ap-frame.wide { width: 280px; height: 300px; transition: all .5s cubic-bezier(.3,1,.4,1); }
        /* subtle two-step progress lines */
        .ap-seg { position: absolute; top: 74px; left: 0; right: 0; display: flex; gap: 6px; justify-content: center; z-index: 20; }
        .ap-seg-line { width: 24px; height: 3px; border-radius: 100px; background: rgba(255,255,255,0.22); transition: all .4s ease; }
        .ap-seg-line.past { background: rgba(255,255,255,0.5); }
        .ap-seg-line.on { width: 30px; background: ${palette.white}; }
        /* why copy */
        .ap-why { position: absolute; top: 104px; left: 34px; right: 34px; text-align: center; z-index: 20; animation: apWhyIn .45s ease; }
        @keyframes apWhyIn { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
        .ap-why-t { font-family: 'Manrope', sans-serif; font-size: 16px; font-weight: 700; color: rgba(255,255,255,0.92); letter-spacing: -0.01em; margin-bottom: 7px; }
        .ap-why-b { font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.6); line-height: 1.5; }
        /* gentle freeze-frame: the plant 'snaps' like a captured still */
        .ap-specimen.frozen { animation: apFreeze .62s cubic-bezier(.25,.9,.3,1); }
        @keyframes apFreeze {
          0% { transform: translate(-50%,-32%) scale(1); filter: saturate(1) brightness(1); }
          18% { transform: translate(-50%,-32%) scale(0.94); filter: saturate(0.55) brightness(1.15); }
          55% { transform: translate(-50%,-32%) scale(0.94); filter: saturate(0.55) brightness(1.05); }
          100% { transform: translate(-50%,-32%) scale(1); filter: saturate(1) brightness(1); }
        }
        /* the specimen when far (shot 2) keeps its scale during freeze */
        .ap-specimen.far.frozen { animation: apFreezeFar .62s cubic-bezier(.25,.9,.3,1); }
        @keyframes apFreezeFar {
          0% { transform: translate(-50%,-32%) scale(0.92); filter: saturate(1) brightness(1); }
          18% { transform: translate(-50%,-32%) scale(0.86); filter: saturate(0.55) brightness(1.15); }
          55% { transform: translate(-50%,-32%) scale(0.86); filter: saturate(0.55) brightness(1.05); }
          100% { transform: translate(-50%,-32%) scale(0.92); filter: saturate(1) brightness(1); }
        }
        /* corners briefly tighten inward to signal the shutter */
        .ap-frame.snap .ap-corner { animation: apCornerSnap .62s ease; }
        @keyframes apCornerSnap { 0%,100% { opacity: 0.85; } 20% { opacity: 1; border-color: ${color.onDark}; } }
        /* a single soft capture ring that blooms once */
        .ap-snap-ring { position: absolute; top: 50%; left: 50%; width: 130px; height: 130px; margin: -65px 0 0 -65px; border-radius: 24px; border: 2px solid rgba(234,240,228,0.7); transform: translateY(-8%); animation: apSnapRing .62s ease-out; pointer-events: none; }
        @keyframes apSnapRing { 0% { opacity: 0; transform: translateY(-8%) scale(1.15); } 25% { opacity: 1; } 100% { opacity: 0; transform: translateY(-8%) scale(0.92); } }
        .apx-care-sub { font-family: 'Manrope', sans-serif; font-size: 10.5px; font-weight: 600; color: ${T.mossBright}; margin-top: 2px; letter-spacing: 0.01em; }
        .ap-frame { transition: width .5s cubic-bezier(.3,1,.4,1), height .5s cubic-bezier(.3,1,.4,1); }
        .ap-shutter-cap { font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 600; color: rgba(255,255,255,0.7); margin-bottom: 14px; }
        .ap-scanline { position: absolute; left: 90px; right: 90px; height: 2px; background: linear-gradient(90deg, transparent, ${T.mossBright}, transparent); box-shadow: 0 0 12px ${T.mossBright}; animation: apsweep 1.8s ease-in-out infinite; }
        @keyframes apsweep { 0% { top: 60%; opacity: 0; } 10% { opacity: 1; } 50% { top: 38%; } 90% { opacity: 1; } 100% { top: 60%; opacity: 0; } }
        .ap-shutter-wrap { position: absolute; bottom: 60px; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .ap-shutter { width: 70px; height: 70px; border-radius: 50%; border: 3px solid ${palette.white}; background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .ap-shutter-in { width: 56px; height: 56px; flex: 0 0 auto; border-radius: 50%; background: ${palette.white}; transition: transform .15s ease; }
        .ap-shutter:active .ap-shutter-in { transform: scale(0.86); }
        .ap-stages { position: absolute; bottom: 90px; left: 0; right: 0; text-align: center; }
        .ap-stage-text { font-family: 'Manrope', sans-serif; font-size: 15px; color: ${palette.white}; }
        .ap-dots { display: flex; gap: 6px; justify-content: center; margin-top: 12px; }
        .ap-dot { width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,0.3); transition: all .3s ease; }
        .ap-dot.on { background: ${T.mossBright}; transform: scale(1.4); }
        .ap-result { position: absolute; inset: 0; background: ${T.bg}; display: flex; flex-direction: column; align-items: center; padding: 80px 28px 28px; overflow-y: auto; }
        .ap-result-photo { border-radius: 24px; overflow: hidden; box-shadow: 0 10px 28px rgba(28,36,25,0.18); }
        .ap-result-match { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 600; color: ${T.moss}; margin-top: 16px; padding: 4px 12px; background: ${T.moss}14; border-radius: 100px; }
        .ap-result-name { font-family: 'Manrope', sans-serif; font-size: 28px; font-weight: 500; color: ${T.ink}; margin-top: 12px; }
        .ap-result-latin { font-family: 'Manrope', sans-serif; font-style: italic; font-size: 13px; color: ${T.inkFaint}; margin-top: 2px; }
        .ap-form { width: 100%; margin-top: 26px; }
        .ap-field-label { font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 600; color: ${T.inkSoft}; margin-bottom: 8px; }
        .ap-input { width: 100%; height: 46px; border-radius: 14px; border: 1px solid ${T.line}; background: ${T.card}; padding: 0 16px; font-family: 'Manrope', sans-serif; font-size: 14px; color: ${T.ink}; outline: none; margin-bottom: 18px; }
        .ap-rooms { display: flex; flex-wrap: wrap; gap: 8px; }
        .ap-room { padding: 9px 16px; border-radius: 100px; border: 1.3px solid ${T.line}; background: ${T.card}; cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 600; color: ${T.inkSoft}; }
        .ap-room.sel { background: ${T.moss}; border-color: ${T.moss}; color: ${palette.white}; }
        .ap-confirm { width: 100%; height: 52px; border-radius: 16px; background: ${T.moss}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 600; border: none; cursor: pointer; margin-top: 28px; }

        /* ---- immersive plant reveal ---- */
        .apx { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 0%, ${palette.moss850} 0%, ${palette.black750} 55%, ${palette.black800} 100%); display: flex; flex-direction: column; overflow: hidden; }
        .apx-glow { position: absolute; top: -10%; left: 50%; transform: translateX(-50%); width: 380px; height: 380px; border-radius: 50%; background: radial-gradient(circle, ${T.mossBright}44 0%, transparent 68%); pointer-events: none; animation: apxGlow 4s ease-in-out infinite; }
        @keyframes apxGlow { 0%,100% { opacity: 0.7; transform: translateX(-50%) scale(1); } 50% { opacity: 1; transform: translateX(-50%) scale(1.08); } }
        .apx-close { position: absolute; top: 60px; left: 20px; width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,0.14); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; z-index: 5; }
        .apx-scroll { flex: 1; overflow-y: auto; z-index: 2; padding: 96px ${space.gutter}px 12px; }
        .apx-scroll::-webkit-scrollbar { display: none; }

        .apx-hero { display: flex; flex-direction: column; align-items: center; text-align: center; opacity: 0; transform: translateY(18px) scale(0.96); transition: opacity .7s cubic-bezier(.2,.8,.2,1), transform .7s cubic-bezier(.2,.8,.2,1); }
        .apx-hero.in { opacity: 1; transform: translateY(0) scale(1); }
        .apx-badge { font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; color: ${palette.leaf100}; background: rgba(255,255,255,0.12); backdrop-filter: blur(10px); padding: 6px 14px; border-radius: 100px; margin-bottom: 22px; }
        .apx-photo { border-radius: 32px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08); }
        .apx-name { font-family: 'Manrope', sans-serif; font-size: 34px; font-weight: 800; color: ${palette.white}; letter-spacing: -0.02em; margin-top: 20px; line-height: 1; }
        .apx-latin { font-family: 'Manrope', sans-serif; font-style: italic; font-size: 13.5px; color: rgba(255,255,255,0.6); margin-top: 7px; }
        .apx-dispute { margin-top: 16px; border: none; background: transparent; cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 700; color: rgba(255,255,255,0.55); text-decoration: underline; text-underline-offset: 3px; }
        .ap-failed { display: flex; align-items: center; justify-content: center; padding: 0 30px; }
        .ap-fail-card { text-align: center; max-width: 320px; animation: navLblIn .3s ease; }
        .ap-fail-ic { width: 62px; height: 62px; border-radius: 50%; background: rgba(232,176,75,0.14); display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; }
        .ap-fail-title { font-family: 'Manrope', sans-serif; font-size: 21px; font-weight: 800; color: ${palette.white}; }
        .ap-fail-sub { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 500; color: rgba(255,255,255,0.68); line-height: 1.5; margin-top: 10px; }
        .ap-fail-tips { text-align: left; margin: 20px 0 4px; display: flex; flex-direction: column; gap: 11px; }
        .ap-fail-tip { display: flex; align-items: center; gap: 11px; font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 600; color: rgba(255,255,255,0.82); }
        .ap-fail-tip span { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; background: rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: ${palette.white}; }
        .ap-fail-retry { width: 100%; height: 52px; margin-top: 24px; border-radius: 15px; border: none; background: ${palette.white}; color: ${palette.black600}; font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; }
        .ap-fail-cancel { width: 100%; height: 46px; margin-top: 8px; border-radius: 15px; border: none; background: transparent; color: rgba(255,255,255,0.6); font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; }

        .apx-care { margin-top: 28px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; overflow: hidden; opacity: 0; transform: translateY(18px); transition: opacity .7s ease .12s, transform .7s ease .12s; }
        .apx-care.in { opacity: 1; transform: translateY(0); }
        /* early AI care signal */
        .apx-alert { margin-top: 22px; padding: 16px; background: rgba(232,176,75,0.1); border: 1px solid rgba(232,176,75,0.28); border-radius: 18px; opacity: 0; transform: translateY(18px); transition: opacity .7s ease .1s, transform .7s ease .1s; }
        .apx-alert.in { opacity: 1; transform: translateY(0); }
        .apx-alert-top { display: flex; align-items: center; gap: 11px; }
        .apx-alert-ic { width: 32px; height: 32px; border-radius: 10px; background: rgba(232,176,75,0.16); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .apx-alert-title { font-family: 'Manrope', sans-serif; font-size: 14.5px; font-weight: 800; color: ${palette.white}; }
        .apx-alert-conf { font-family: 'Manrope', sans-serif; font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,0.55); margin-top: 1px; }
        .apx-alert-body { font-family: 'Manrope', sans-serif; font-size: 12.5px; line-height: 1.5; color: rgba(255,255,255,0.78); margin-top: 12px; }
        .apx-alert-first { font-family: 'Manrope', sans-serif; font-size: 12.5px; color: ${palette.white}; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(232,176,75,0.2); }
        .apx-alert-first-lbl { font-weight: 800; color: ${color.watchSoft}; }
        /* add-room */
        .apx-room-add { display: inline-flex; align-items: center; gap: 5px; border-style: dashed; color: rgba(255,255,255,0.7); }
        .apx-room-new { display: flex; gap: 9px; margin-top: 11px; }
        .apx-room-new-input { margin-bottom: 0 !important; flex: 1; }
        .apx-room-new-save { flex-shrink: 0; padding: 0 20px; border-radius: 14px; border: none; background: ${T.mossBright}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; }
        .apx-care-lbl { font-family: 'Manrope', sans-serif; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.5); padding: 14px 16px 4px; }
        .apx-care-row { display: flex; align-items: center; gap: 13px; padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.07); }
        .apx-care-row:first-of-type { border-top: none; }
        .apx-care-ic { width: 34px; height: 34px; border-radius: 10px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: ${palette.leaf150}; flex-shrink: 0; }
        .apx-care-k { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 700; color: ${palette.white}; }
        .apx-care-v { font-family: 'Manrope', sans-serif; font-size: 12px; color: rgba(255,255,255,0.66); margin-top: 2px; line-height: 1.4; }

        .apx-form { margin-top: 24px; opacity: 0; transform: translateY(18px); transition: opacity .7s ease .24s, transform .7s ease .24s; }
        .apx-form.in { opacity: 1; transform: translateY(0); }
        .apx-field-lbl { font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 700; color: rgba(255,255,255,0.85); margin-bottom: 9px; }
        .apx-input { width: 100%; height: 50px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.08); padding: 0 16px; font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 600; color: ${palette.white}; outline: none; margin-bottom: 22px; }
        .apx-input::placeholder { color: rgba(255,255,255,0.4); font-weight: 500; }
        .apx-rooms { display: flex; flex-wrap: wrap; gap: 9px; }
        .apx-room { position: relative; padding: 11px 17px; border-radius: 100px; border: 1.4px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.06); cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 700; color: rgba(255,255,255,0.82); transition: all .2s ease; }
        .apx-room.sel { background: ${palette.white}; border-color: ${palette.white}; color: ${T.ink}; }
        .apx-room-rec { position: absolute; top: -8px; right: -6px; font-size: 8.5px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; color: ${palette.black750}; background: ${T.mossBright}; padding: 2px 6px; border-radius: 100px; white-space: nowrap; }

        .apx-cta-wrap { flex-shrink: 0; z-index: 2; padding: 12px ${space.gutter}px calc(24px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, transparent, ${palette.black800} 30%); opacity: 0; transform: translateY(14px); transition: opacity .7s ease .34s, transform .7s ease .34s; }
        .apx-cta-wrap.in { opacity: 1; transform: translateY(0); }
        .apx-cta { display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; height: 56px; border-radius: 18px; border: none; cursor: pointer; background: ${T.mossBright}; color: ${palette.white}; font-family: 'Manrope', sans-serif; font-size: 15.5px; font-weight: 700; box-shadow: 0 10px 30px rgba(76,115,80,0.4); transition: opacity .2s ease; }
        .apx-cta:disabled { background: rgba(255,255,255,0.14); color: rgba(255,255,255,0.6); box-shadow: none; cursor: default; }

        /* reminders */
        .ax-group { margin-top: 24px; }
        .ax-group-lbl { font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${T.inkFaint}; margin: 0 ${space.gutter}px 10px; }
        .ax-item { display: flex; align-items: center; gap: 12px; margin: 0 ${space.gutter}px 9px; padding: 13px 14px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; cursor: pointer; }
        /* grouped similar notifications */
        .ax-cluster { margin: 0 ${space.gutter}px 9px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; overflow: hidden; }
        .ax-cluster-head { display: flex; align-items: center; gap: 12px; width: 100%; padding: 13px 14px; background: transparent; border: none; cursor: pointer; text-align: left; }
        .ax-cluster-chev { flex-shrink: 0; transition: transform .3s ease; }
        .ax-cluster-chev.open { transform: rotate(180deg); }
        .ax-cluster-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .32s cubic-bezier(.3,.8,.3,1); }
        .ax-cluster-body.open { grid-template-rows: 1fr; }
        .ax-cluster-inner { overflow: hidden; padding: 0 8px; }
        .ax-cluster-inner .ax-item { margin: 0 0 8px; background: ${T.bg}; border-color: transparent; }
        .ax-cluster-inner .ax-item:first-child { margin-top: 2px; }
        .ax-item-ic { width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ax-item-body { flex: 1; min-width: 0; }
        .ax-item-title { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; color: ${T.ink}; }
        .ax-item-why { font-family: 'Manrope', sans-serif; font-size: 11.5px; color: ${T.inkFaint}; line-height: 1.35; margin-top: 2px; }
        .ax-item-stamp { font-family: 'Manrope', sans-serif; font-size: 10.5px; font-weight: 600; color: ${T.inkFaint}; flex-shrink: 0; align-self: flex-start; margin-top: 2px; }
        .rd-row { display: flex; align-items: center; gap: 14px; margin: 0 ${space.gutter}px; padding: 14px 0; border-bottom: 1px solid ${T.line}; cursor: pointer; }
        .rd-icon { width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .rd-body { flex: 1; }
        .rd-text { font-family: 'Manrope', sans-serif; font-size: 13.5px; font-weight: 500; color: ${T.ink}; line-height: 1.4; }
        .rd-when { font-family: 'Manrope', sans-serif; font-size: 10px; color: ${T.inkFaint}; margin-top: 3px; }

        .v-overlay { position: absolute; inset: 0; z-index: 55; }
        .ov-push-in { animation: pushIn .34s cubic-bezier(.2,.85,.25,1); }
        .ov-push-out { z-index: 56; animation: pushOut .34s cubic-bezier(.4,0,.7,.2) forwards; pointer-events: none; }
        .ov-modal-in { animation: modalIn .38s cubic-bezier(.2,.85,.25,1); }
        .ov-modal-out { z-index: 56; animation: modalOut .34s cubic-bezier(.4,0,.7,.2) forwards; pointer-events: none; }
        @keyframes pushIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes pushOut { from { transform: translateX(0); } to { transform: translateX(100%); } }
        @keyframes modalIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes modalOut { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @media (prefers-reduced-motion: reduce) {
          .vd-sway, .vd-firefly, .dz-drop, .dz-perkglow, .pf3-confetti, .dz-pulse,
          .ap-scan-ring, .apx-glow, .alertBob { animation: none !important; }
          /* neutralize movement on transitions but keep them near-instant so reveals still show */
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
          /* ensure anything that animates/transitions INTO view is simply visible */
          .dz-id, .dz-call, .dz-trend, .dz-rhythm, .dz-explore, .dt-hero, .vd-brief-wrap,
          .apx-reveal, .pf3-cel-badge { opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <div className="v-stage">
      <div className="v-phone-shell" style={{ transform: `scale(${phoneScale})` }}>
      <div className="v-btn left v-btn-action" aria-hidden="true" />
      <div className="v-btn left v-btn-volup" aria-hidden="true" />
      <div className="v-btn left v-btn-voldn" aria-hidden="true" />
      <div className="v-btn right v-btn-side" aria-hidden="true" />
      <div className="v-btn right v-btn-cam" aria-hidden="true" />
      <div className="v-phone">
        <div className="v-island" />
        <div className="v-app">

        {phase === "splash" && <SplashScreen onDone={() => { setSignedIn(true); setPhase("app"); }} />}
        {phase === "onboarding" && <OnboardingFlow hour={hour} resumePlant={resumeSignin} onComplete={(plantData, signedIn, account) => {
          if (plantData && !resumeSignin) {
            const id = `new-${Date.now()}`;
            // A brand-new user's garden IS their first scan — start fresh, don't
            // pile it onto the sample garden (that set is only for the returning-user demo).
            setPlants([makePlant(id, plantData.speciesKey, plantData.health, plantData.room, plantData.nickname)]);
            if (!signedIn) setUnsavedNudge({ nickname: plantData.nickname, plant: plantData });
          }
          // authoritative: "explore first" passes signedIn=false and must land as a guest,
          // even if a prior session left signedIn=true.
          setSignedIn(!!signedIn);
          if (signedIn) { setUnsavedNudge(null); if (account && (account.name || account.email)) setAccount(account); }
          setResumeSignin(null);
          setPhase("app"); resetTo("home");
        }} />}

        {phase === "app" && <>
        {tab === "home" && <HomeScreen plants={plants} hour={hour} onOpenPlant={openPlant} onOpenRooms={() => setTab("rooms")} onOpenPlants={openAllPlants} onAdd={openAdd} onWater={waterPlant} onWaterTask={waterTask} onWaterAll={waterTasks} doneTasks={doneTasks} markTaskDone={markTaskDone} mounted={mounted} guest={!signedIn} onSignIn={goSignIn} />}
        {tab === "rooms" && <RoomsScreen plants={plants} onBack={() => resetTo("home")} onOpenPlant={openPlant} onMovePlant={movePlant} />}
        {tab === "reminders" && <RemindersScreen plants={plants} onBack={() => resetTo("home")} onOpenPlant={openPlant} onWater={waterPlant} />}
        {tab === "profile" && <ProfileScreen plants={plants} signedIn={signedIn} account={account} onSignIn={goSignIn} onBack={() => resetTo("home")} onOpenRooms={() => resetTo("rooms")} onOpenActivity={() => resetTo("reminders")} onUpdateAccount={updateAccount} onDeleteAccount={deleteAccount} />}

        {/* tab bar (hidden while an overlay is open) */}
        {stack.length === 0 && (
          <div className="nav-wrap" ref={navWrapRef}>
            {/* one continuous bar; the sliding pill flows across it, floor pill is the fallback */}
            <div className={`nav-bar${glider.ready ? " has-glider" : ""}`}>
              <div className="nav-glider" style={{ left: glider.left, width: glider.width, opacity: glider.ready ? 1 : 0 }} />
              {NAV.map((n) => {
                const active = tab === n.id;
                return (
                  <button key={n.id} ref={(el) => (tabRefs.current[n.id] = el)} aria-label={n.id === "profile" && !signedIn ? `${n.label} — sign in to save your garden` : n.label} aria-current={active ? "page" : undefined}
                    className={`nav-item${active ? " active" : ""}`} onClick={() => setTab(n.id)}>
                    <span className="nav-item-ic">
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{n.icon}</svg>
                      {n.id === "profile" && !signedIn && !active && <span className="nav-dot" aria-hidden="true" />}
                    </span>
                    {active && <span key={`l-${n.id}`} className="nav-item-lbl">{n.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* overlay stack — top entry is live; the exiting entry animates out */}
        {top?.type === "allplants" && (
          <div className="v-overlay ov-push-in"><AllPlantsScreen plants={plants} favorites={favorites} onBack={back} onOpenPlant={openPlant} /></div>
        )}
        {top?.type === "detail" && selectedPlant && (
          <div className="v-overlay ov-push-in"><DetailScreen plant={selectedPlant} faved={!!favorites[selectedPlant.id]} onToggleFavorite={toggleFavorite} onBack={back} onWater={waterPlant} onAddJournal={addJournalPhoto} onMovePlant={movePlant} onRemovePlant={removePlant} onRestorePlant={restorePlant} /></div>
        )}
        {top?.type === "add" && (
          <div className="v-overlay ov-modal-in"><AddPlantScreen onClose={back} onAdd={addPlant} /></div>
        )}

        {/* exiting screen — animates out in the reverse direction */}
        {exiting?.type === "allplants" && (
          <div className="v-overlay ov-push-out"><AllPlantsScreen plants={plants} onBack={() => {}} onOpenPlant={() => {}} /></div>
        )}
        {exiting?.type === "detail" && exitingPlant && (
          <div className="v-overlay ov-push-out"><DetailScreen plant={exitingPlant} onBack={() => {}} onWater={() => {}} onAddJournal={() => {}} /></div>
        )}
        {exiting?.type === "add" && (
          <div className="v-overlay ov-modal-out"><AddPlantScreen onClose={() => {}} onAdd={() => {}} /></div>
        )}
        </>}
        </div>
      </div>
      </div>
      </div>

      {/* DEMO CONTROLS — outside the phone frame. Not part of the shipping app;
          these exist only to showcase the real-time light engine. In production
          the scene simply follows the device clock. */}
      <div className="demo-panel" style={{ zoom: phoneScale }}>
        <div className="demo-head">
          <span className="demo-badge">DEMO</span>
          <span className="demo-title">Time-of-day engine · not in the shipping app</span>
        </div>
        <div className="demo-row">
          <span className="demo-clock">{String(Math.floor(hour)).padStart(2, "0")}:{String(Math.floor((hour % 1) * 60)).padStart(2, "0")}</span>
          <input className="demo-scrub" type="range" min="0" max="24" step="0.1" value={hour}
            onChange={(e) => { setAuto(false); setHour(parseFloat(e.target.value)); }} />
          <button className="demo-play" onClick={() => setAuto(!auto)}>
            {auto ? <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>Pause</>
              : <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>Play day</>}
          </button>
        </div>

        <div className="demo-divider" />
        <div className="demo-head" style={{ marginTop: 2, marginBottom: 10 }}>
          <span className="demo-badge">JUMP</span>
          <span className="demo-title">Quick access · jump to any screen</span>
        </div>
        <div className="demo-jumps">
          {[
            ["Splash", () => { setPhase("splash"); resetTo("home"); }],
            ["Onboarding", () => { setPhase("onboarding"); resetTo("home"); }],
            ["Garden", () => { setPhase("app"); resetTo("home"); }],
            ["Rooms", () => { setPhase("app"); resetTo("rooms"); }],
            ["Activity", () => { setPhase("app"); resetTo("reminders"); }],
            ["Profile", () => { setPhase("app"); resetTo("profile"); }],
            ["Design system", () => setDsFull(true)],
            ["Plants deck", () => { setPhase("app"); resetTo("home"); setTimeout(() => push({ type: "allplants" }), 30); }],
            ["Add plant", () => { setPhase("app"); resetTo("home"); setTimeout(() => push({ type: "add" }), 30); }],
            ["Plant detail", () => { setPhase("app"); resetTo("home"); setTimeout(() => push({ type: "detail", id: plants[1].id }), 30); }],
            ["Urgent plant", () => { setPhase("app"); resetTo("home"); setTimeout(() => push({ type: "detail", id: (plants.find(p => p.health < 45) || plants[0]).id }), 30); }],
          ].map(([label, fn]) => (
            <button key={label} className="demo-jump" onClick={fn}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
