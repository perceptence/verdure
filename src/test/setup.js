/* jsdom lacks the browser APIs the app uses for device fitting and animation.
   Stub them so components can mount in tests. */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver || ResizeObserverStub;

if (!globalThis.matchMedia) {
  globalThis.matchMedia = (query) => ({
    matches: false, media: query,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  });
}

// jsdom has rAF, but keep it deterministic and non-recursive for the day-cycle loop.
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(() => cb(performance.now()), 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || clearTimeout;
