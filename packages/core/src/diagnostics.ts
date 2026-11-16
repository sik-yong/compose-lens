/** Diagnostic categories from PRD §7. */
export type DiagnosticCode =
  | "yaml-syntax"
  | "schema"
  | "reference"
  | "conflict"
  | "unresolved"
  | "unsupported"
  | "unverifiable"
  | "limit";

export type Severity = "error" | "warning" | "info";

/** Where a diagnostic points: a text position, a document path, or both. */
export interface DiagnosticLocation {
  /** 1-based line in the input text. */
  line?: number;
  /** 1-based column in the input text. */
  column?: number;
  /** Path in the Compose document, e.g. ["services", "web", "ports", 0]. */
  path?: readonly (string | number)[];
}

/**
 * A diagnostic message. Messages must never quote masked values
 * (environment / build.args); point to the location or key instead (PRD §8.4).
 */
export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  location?: DiagnosticLocation;
}
