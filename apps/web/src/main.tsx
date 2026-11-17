import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./index.css";
import { loadSettings, resolveTheme } from "./settings.js";

// Set the theme before the first paint to avoid a flash of the wrong colors.
const theme = resolveTheme(loadSettings().theme);
document.documentElement.dataset["theme"] = theme;
document.documentElement.style.colorScheme = theme;

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
