/**
 * Resource limits from PRD §8.3 and docs/support-matrix.md.
 * Exceeding any of them must yield a `limit` diagnostic and no graph.
 */
export const LIMITS = {
  /** Maximum input size in bytes (UTF-8). */
  maxInputBytes: 1024 * 1024,
  /** Maximum YAML alias expansions (passed to `yaml` as maxAliasCount). */
  maxAliasCount: 100,
  /** Maximum nesting depth of the parsed document. */
  maxDepth: 64,
  /** Maximum number of services. */
  maxServices: 300,
  /** Maximum graph nodes + edges. */
  maxGraphElements: 3000,
  /** Maximum port entries across all services. */
  maxPorts: 5000,
  /** Maximum diagnostics returned; the rest are summarized in one info. */
  maxDiagnostics: 500,
} as const;
