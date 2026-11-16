import type { Diagnostic } from "./diagnostics.js";
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
  if (parsed.value === undefined) return { diagnostics: parsed.diagnostics };

  const { model, diagnostics } = normalize(parsed.value, parsed.locate);
  if (!model) return { diagnostics };

  const built = toGraph(model);
  const result: AnalysisResult = { model, diagnostics: [...diagnostics, ...built.diagnostics] };
  if (built.graph) result.graph = built.graph;
  return result;
}
