import React from "react";
import ReactDOM from "react-dom/client";
import VerdureApp from "./VerdureApp.jsx";
import CaseStudy from "./CaseStudy.jsx";
import "./index.css";

/* Minimal same-app router — two routes, no dependency.
     /            -> the product
     /case-study  -> the design case study
   The hash form (#/case-study) is also accepted so the route survives static
   hosts that don't rewrite unknown paths to index.html. Both routes ship in the
   same build and are served from the same origin. */
function resolveRoute() {
  if (typeof window === "undefined") return "app";
  const path = window.location.pathname.replace(/\/+$/, "");
  const hash = window.location.hash.replace(/^#/, "").replace(/\/+$/, "");
  return path === "/case-study" || hash === "/case-study" ? "case-study" : "app";
}

const Root = () => (resolveRoute() === "case-study" ? <CaseStudy /> : <VerdureApp />);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
