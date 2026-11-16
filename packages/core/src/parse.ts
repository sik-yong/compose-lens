import { LineCounter, isNode, parseDocument, type Document } from "yaml";
import type { Diagnostic, DiagnosticLocation, DocumentPath } from "./diagnostics.js";
import { LIMITS } from "./limits.js";

export interface ParsedYaml {
  /** Plain JS value of the document, or undefined if parsing failed. */
  value?: unknown;
  diagnostics: Diagnostic[];
  /** Maps a document path to a location with line and column when possible. */
  locate: (path: DocumentPath) => DiagnosticLocation;
}

/** UTF-8 byte length without TextEncoder (core has no DOM/Node globals). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

const limitError = (message: string): Diagnostic => ({
  code: "limit",
  severity: "error",
  message,
  location: { path: [] },
});

/** Rejects cycles (from recursive aliases) and nesting deeper than LIMITS.maxDepth. */
function checkShape(value: unknown): Diagnostic | undefined {
  const ancestors = new Set<object>();
  const visit = (node: unknown, depth: number): Diagnostic | undefined => {
    if (node === null || typeof node !== "object") return undefined;
    if (depth > LIMITS.maxDepth) {
      return limitError(`Nesting is deeper than ${LIMITS.maxDepth} levels.`);
    }
    if (ancestors.has(node)) return limitError("Circular YAML aliases are not supported.");
    ancestors.add(node);
    const children = node instanceof Map ? node.values() : Object.values(node);
    for (const child of children) {
      const found = visit(child, depth + 1);
      if (found) return found;
    }
    ancestors.delete(node);
    return undefined;
  };
  return visit(value, 0);
}

/** Parses YAML text with the resource limits from PRD §8.3. */
export function parseYaml(text: string): ParsedYaml {
  const lineCounter = new LineCounter();
  let doc: Document | undefined;

  const locate = (path: DocumentPath): DiagnosticLocation => {
    const node = doc?.getIn(path, true);
    const offset = isNode(node) ? node.range?.[0] : undefined;
    if (offset === undefined) return { path };
    const pos = lineCounter.linePos(offset);
    return { path, line: pos.line, column: pos.col };
  };

  if (text.length > LIMITS.maxInputBytes || utf8Length(text) > LIMITS.maxInputBytes) {
    return {
      diagnostics: [limitError(`Input is larger than ${LIMITS.maxInputBytes / 1024 / 1024} MiB.`)],
      locate,
    };
  }

  try {
    doc = parseDocument(text, { lineCounter, merge: true, uniqueKeys: true, prettyErrors: false });
  } catch {
    // Very deep flow collections can exhaust the parser's stack.
    return { diagnostics: [limitError("The document is too deeply nested to parse.")], locate };
  }

  if (doc.errors.length > 0) {
    const diagnostics = doc.errors.map((error): Diagnostic => {
      const pos = lineCounter.linePos(error.pos[0]);
      return {
        code: "yaml-syntax",
        severity: "error",
        // yaml's messages describe syntax, not values, so they are safe to show.
        message: error.message.split("\n")[0] ?? "Invalid YAML.",
        location: { line: pos.line, column: pos.col },
      };
    });
    return { diagnostics, locate };
  }

  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: LIMITS.maxAliasCount });
  } catch (error) {
    // yaml throws a ReferenceError when maxAliasCount is exceeded. Never echo
    // the error text: it may quote input.
    const message =
      error instanceof ReferenceError
        ? `YAML aliases expand more than ${LIMITS.maxAliasCount} times.`
        : "The YAML document could not be converted.";
    return { diagnostics: [limitError(message)], locate };
  }

  const shapeError = checkShape(value);
  if (shapeError) return { diagnostics: [shapeError], locate };

  return { value, diagnostics: [], locate };
}
