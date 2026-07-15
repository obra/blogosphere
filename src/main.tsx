// ABOUTME: App entry point — mounts the React tree into #root. Replaced only
// ABOUTME: incidentally as real wiring lands; keep this file boring.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./ui/app/app.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
