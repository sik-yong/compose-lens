import type { Diagnostic, DiagnosticLocation, DocumentPath } from "./diagnostics.js";

export type Locate = (path: DocumentPath) => DiagnosticLocation;

/** True if the value contains Compose interpolation (`$$` is a literal `$`). */
export const hasVariable = (s: string) => s.replaceAll("$$", "").includes("$");

/** Collects diagnostics during normalization and checks. */
export class Context {
  readonly diagnostics: Diagnostic[] = [];
  constructor(readonly locate: Locate) {}

  report(code: Diagnostic["code"], severity: Diagnostic["severity"], path: DocumentPath, message: string) {
    this.diagnostics.push({ code, severity, message, location: this.locate(path) });
  }

  schema(path: DocumentPath, message: string) {
    this.report("schema", "error", path, message);
  }
}
