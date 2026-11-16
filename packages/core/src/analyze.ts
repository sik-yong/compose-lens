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
export function analyze(text: string): AnalysisResult {
  const parsed = parseYaml(text);
  if (parsed.value === undefined) return { diagnostics: capped(parsed.diagnostics, 0) };

  const { model, diagnostics, suppressed = 0 } = normalize(parsed.value, parsed.locate);
  if (!model) return { diagnostics: capped(diagnostics, suppressed) };

  const built = toGraph(model);
  const result: AnalysisResult = { model, diagnostics: capped([...diagnostics, ...built.diagnostics], suppressed) };
  if (built.graph) result.graph = built.graph;
  return result;
}

/** Keeps at most LIMITS.maxDiagnostics and says how many were left out. */
function capped(diagnostics: Diagnostic[], alreadySuppressed: number): Diagnostic[] {
  const extra = Math.max(0, diagnostics.length - LIMITS.maxDiagnostics);
  const omitted = alreadySuppressed + extra;
  if (omitted === 0) return diagnostics;
  return [
    ...diagnostics.slice(0, LIMITS.maxDiagnostics),
    {
      code: "limit",
      severity: "info",
      message: `${omitted} more problem${omitted > 1 ? "s were" : " was"} found but not listed.`,
      location: { path: [] },
    },
  ];
}
