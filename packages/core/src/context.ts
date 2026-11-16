import type { Diagnostic, DiagnosticLocation, DocumentPath } from "./diagnostics.js";
import { LIMITS } from "./limits.js";

export type Locate = (path: DocumentPath) => DiagnosticLocation;

/**
 * True if the value contains Compose interpolation: `${` or `$` followed by a
 * name start ([A-Za-z_]). `$$` is a literal `$`, and so is `$` before anything else (`$5`).
 */
export const hasVariable = (s: string) => /\$(\{|[A-Za-z_])/.test(s.replaceAll("$$", ""));

/** Collects diagnostics during normalization and checks. */
export class Context {
  readonly diagnostics: Diagnostic[] = [];
  /** Diagnostics dropped after LIMITS.maxDiagnostics. */
  suppressed = 0;
  constructor(readonly locate: Locate) {}

  report(code: Diagnostic["code"], severity: Diagnostic["severity"], path: DocumentPath, message: string) {
    if (this.diagnostics.length >= LIMITS.maxDiagnostics) {
      this.suppressed++;
      return;
    }
    this.diagnostics.push({ code, severity, message, location: this.locate(path) });
  }

  schema(path: DocumentPath, message: string) {
    this.report("schema", "error", path, message);
  }
}
