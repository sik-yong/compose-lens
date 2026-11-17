export { analyze, type AnalysisResult } from "./analyze.js";
export { hasVariable } from "./context.js";
export { LIMITS } from "./limits.js";
export { escapeLabel, toMermaid } from "./mermaid.js";
export type {
  Diagnostic,
  DiagnosticCode,
  DiagnosticLocation,
  DocumentPath,
  Severity,
} from "./diagnostics.js";
export type { ComposeGraph, GraphEdge, GraphEdgeKind, GraphNode, GraphNodeKind } from "./graph.js";
export type * from "./model.js";
