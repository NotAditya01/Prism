import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import process from "process";

import App from "./App";
import "./index.css";

(globalThis as typeof globalThis & { process?: typeof process }).process ??= process;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
