import type { Diagnostic } from "./diagnostics.js";
import { LIMITS } from "./limits.js";
import { toGraph, type ComposeGraph } from "./graph.js";
import type { ComposeModel } from "./model.js";
import { normalize } from "./normalize.js";
import { parseYaml } from "./parse.js";

export interface AnalysisResult {
  model?: ComposeModel;
  graph?: ComposeGraph;
  diagnostics: Diagnostic[];
}

/** Analyzes Compose YAML text: parse → normalize → graph. Pure, no I/O. */
type Severity = Diagnostic["severity"];
type Counts = Record<Severity, number>;
const NONE: Counts = { error: 0, warning: 0, info: 0 };
const SEVERITIES: Severity[] = ["error", "warning", "info"];

export function analyze(text: string): AnalysisResult {
  const parsed = parseYaml(text);
  if (parsed.value === undefined) return { diagnostics: capped(parsed.diagnostics, NONE) };

  const { model, diagnostics, suppressed = NONE } = normalize(parsed.value, parsed.locate);
  if (!model) return { diagnostics: capped(diagnostics, suppressed) };

  const built = toGraph(model);
  const result: AnalysisResult = { model, diagnostics: capped([...diagnostics, ...built.diagnostics], suppressed) };
  if (built.graph) result.graph = built.graph;
  return result;
}

/**
 * Keeps at most LIMITS.maxDiagnostics, errors first, then warnings, then
 * infos (file order within each), and summarizes the rest by severity.
 */
function capped(diagnostics: Diagnostic[], alreadySuppressed: Counts): Diagnostic[] {
  const kept = new Set<Diagnostic>();
  const omitted: Counts = { ...alreadySuppressed };
  for (const severity of SEVERITIES) {
    for (const d of diagnostics) {
      if (d.severity !== severity) continue;
      if (kept.size < LIMITS.maxDiagnostics) kept.add(d);
      else omitted[severity]++;
    }
  }
  const total = omitted.error + omitted.warning + omitted.info;
  const result = diagnostics.filter((d) => kept.has(d));
  if (total === 0) return result;
  const parts = SEVERITIES.filter((s) => omitted[s] > 0).map((s) => `${omitted[s]} ${s}${omitted[s] > 1 && s !== "info" ? "s" : ""}`);
  return [
    ...result,
    {
      code: "limit",
      severity: SEVERITIES.find((s) => omitted[s] > 0) ?? "info",
      message: `${total} more problem${total > 1 ? "s" : ""} not listed (${parts.join(", ")}).`,
      location: { path: [] },
    },
  ];
}
