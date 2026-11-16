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

/** A path in the Compose document, e.g. ["services", "web", "ports", 0]. `[]` is the document root. */
export type DocumentPath = readonly (string | number)[];

/**
 * Where a diagnostic points (PRD §7). Every diagnostic has a location:
 * a document path, a text position, or both. Errors about the whole
 * document use the root path `[]`.
 */
export type DiagnosticLocation =
  | { path: DocumentPath; line?: number; column?: number }
  | { path?: DocumentPath; line: number; column: number };

/**
 * A diagnostic message. Messages never quote values from the input;
 * they refer to the location and key instead (PRD §8.4).
 */
export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  location: DiagnosticLocation;
}
