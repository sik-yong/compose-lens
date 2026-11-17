import { RELATION_KINDS, type MermaidCurve, type RelationKind } from "@compose-lens/core";
import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";
/** React Flow edge types offered in the toolbar. */
export type EdgeStyle = "routed" | "smoothstep" | "default" | "straight";

export interface ViewSettings {
  theme: Theme;
  edgeStyle: EdgeStyle;
  relations: RelationKind[];
  showPorts: boolean;
}

export const EDGE_STYLES: { value: EdgeStyle; label: string; curve: MermaidCurve }[] = [
  // Routed matches Mermaid's own default (dagre routes drawn as a basis curve).
  { value: "routed", label: "Routed", curve: "basis" },
  { value: "smoothstep", label: "Right angles", curve: "step" },
  { value: "default", label: "Curved", curve: "basis" },
  { value: "straight", label: "Straight", curve: "linear" },
];

export const RELATION_LABELS: Record<RelationKind, string> = {
  depends_on: "Start order",
  networks: "Networks",
  network_mode: "Shared network stack",
  volumes: "Volumes",
  secrets: "Secrets",
  configs: "Configs",
};

const DEFAULTS: ViewSettings = {
  theme: "system",
  edgeStyle: "routed",
  relations: [...RELATION_KINDS],
  showPorts: false,
};

const KEY = "compose-lens:view";

/**
 * View preferences only (never Compose input). Storage can be unavailable or
 * hold anything, so every field is validated and failures fall back to defaults.
 */
export function loadSettings(): ViewSettings {
  let stored: unknown;
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return DEFAULTS;
  }
  if (typeof stored !== "object" || stored === null) return DEFAULTS;
  const s = stored as Record<string, unknown>;
  const theme = s["theme"];
  const edgeStyle = s["edgeStyle"];
  const relations = s["relations"];
  return {
    theme: theme === "light" || theme === "dark" || theme === "system" ? theme : DEFAULTS.theme,
    edgeStyle: EDGE_STYLES.some((e) => e.value === edgeStyle) ? (edgeStyle as EdgeStyle) : DEFAULTS.edgeStyle,
    relations: Array.isArray(relations)
      ? RELATION_KINDS.filter((k) => relations.includes(k))
      : DEFAULTS.relations,
    showPorts: typeof s["showPorts"] === "boolean" ? s["showPorts"] : DEFAULTS.showPorts,
  };
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Private mode or blocked storage: settings last for this page only.
    }
  }, [settings]);
  return [settings, setSettings] as const;
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

export function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? (darkQuery().matches ? "dark" : "light") : theme;
}

/** Applies the theme to <html data-theme> and follows the system setting when asked. */
export function useResolvedTheme(theme: Theme): "light" | "dark" {
  const [resolved, setResolved] = useState(() => resolveTheme(theme));
  useEffect(() => {
    setResolved(resolveTheme(theme));
    if (theme !== "system") return;
    const query = darkQuery();
    const onChange = () => setResolved(resolveTheme("system"));
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset["theme"] = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);
  return resolved;
}
