import React, { useState, useEffect } from "react";

/* ============================================================================
   PhoneFrame — a self-contained iPhone 17 Pro mockup frame.

   Drop this ONE file into any React project and wrap your app:

       import PhoneFrame from "./PhoneFrame";
       export default function App() {
         return <PhoneFrame><YourApp /></PhoneFrame>;
       }

   No dependencies, no design tokens — just React. Your app renders inside the
   frame and should fill it (width:100% / height:100%, or absolutely-positioned
   screens). The frame:
     • auto-scales to fill the viewport at any window size
     • renders the Dynamic Island + hardware buttons (Action/Volume, Side/Camera)
     • is theme-agnostic (works with light or dark app content)

   The backdrop is NOT part of the frame — it's transparent by default so each
   project supplies its own look. Set one per project either by:
     • passing the `backdrop` prop (any CSS background), or
     • styling the page yourself (e.g. `body { background: … }`) and leaving
       the prop unset.

   Props:
     model     "pro" (402×874, default) | "promax" (440×956)
     backdrop  CSS background around the phone (default: transparent)
     fill      0–1, how much of the viewport the phone fills (default 0.98)
============================================================================ */

const MODELS = {
  pro:    { w: 402, h: 874, radius: 55 }, // iPhone 17 Pro (6.3")
  promax: { w: 440, h: 956, radius: 62 }, // iPhone 17 Pro Max (6.9")
};

export default function PhoneFrame({
  children,
  model = "pro",
  backdrop = "transparent",
  fill = 0.98,
}) {
  const dev = MODELS[model] || MODELS.pro;
  const [scale, setScale] = useState(1);

  // Fit the phone to the viewport (height- or width-bound), leaving a little air.
  useEffect(() => {
    const PAD = 20;
    const fit = () =>
      setScale(fill * Math.min((window.innerWidth - PAD) / dev.w, (window.innerHeight - PAD) / dev.h));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [dev.w, dev.h, fill]);

  return (
    <div className="pf-root" style={{ background: backdrop }}>
      <style>{css(dev)}</style>
      <div className="pf-stage">
        {/* shell is non-clipping so the hardware buttons can sit past the bezel */}
        <div className="pf-shell" style={{ transform: `scale(${scale})` }}>
          <span className="pf-btn pf-left pf-action" aria-hidden="true" />
          <span className="pf-btn pf-left pf-volup" aria-hidden="true" />
          <span className="pf-btn pf-left pf-voldn" aria-hidden="true" />
          <span className="pf-btn pf-right pf-side" aria-hidden="true" />
          <span className="pf-btn pf-right pf-cam" aria-hidden="true" />
          <div className="pf-phone">
            <div className="pf-island" />
            <div className="pf-screen">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Scoped styles (pf- prefix avoids collisions with your app's CSS). */
const css = (dev) => `
  .pf-root { position: fixed; inset: 0; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  .pf-stage { display: flex; align-items: center; justify-content: center; }
  .pf-shell { position: relative; transform-origin: center; }

  .pf-phone { position: relative; width: ${dev.w}px; height: ${dev.h}px;
    border-radius: ${dev.radius}px; overflow: hidden; background: #000;
    box-shadow: 0 0 0 9px #0B0C09, 0 40px 80px rgba(0,0,0,0.6); }
  .pf-screen { position: absolute; inset: 0; }

  .pf-island { position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
    width: 120px; height: 34px; background: #0B0C09; border-radius: 20px; z-index: 80; }

  /* hardware buttons — thin beveled slivers just past the bezel */
  .pf-btn { position: absolute; width: 4px; z-index: 5;
    background: linear-gradient(90deg, #050604, #16170f 55%, #050604);
    box-shadow: 0 1px 2px rgba(0,0,0,0.4); }
  .pf-left  { left: -12px;  border-radius: 3px 0 0 3px; }
  .pf-right { right: -12px; border-radius: 0 3px 3px 0; }
  .pf-action { top: 150px; height: 34px; }   /* Action button */
  .pf-volup  { top: 204px; height: 58px; }    /* Volume up */
  .pf-voldn  { top: 274px; height: 58px; }    /* Volume down */
  .pf-side   { top: 210px; height: 96px; }    /* Side / power */
  .pf-cam    { top: 338px; height: 42px; }    /* Camera Control */

  @media (prefers-reduced-motion: reduce) {
    .pf-shell { transition: none !important; }
  }
`;
