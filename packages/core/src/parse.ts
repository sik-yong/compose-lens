import {
  LineCounter,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  parseDocument,
  type Document,
  type ErrorCode,
} from "yaml";
import type { Diagnostic, DiagnosticLocation, DocumentPath } from "./diagnostics.js";
import { LIMITS } from "./limits.js";

export interface ParsedYaml {
  /** Plain JS value of the document, or undefined if parsing failed. */
  value?: unknown;
  diagnostics: Diagnostic[];
  /** Maps a document path to a location with line and column when possible. */
  locate: (path: DocumentPath) => DiagnosticLocation;
}

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** UTF-8 byte length without TextEncoder (core has no DOM/Node globals). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && isLowSurrogate(text.charCodeAt(i + 1))) {
      bytes += 4; // a valid surrogate pair is one 4-byte code point
      i++;
    } else bytes += 3; // BMP character, or a lone surrogate (encoded as U+FFFD)
  }
  return bytes;
}

const limitError = (message: string): Diagnostic => ({
  code: "limit",
  severity: "error",
  message,
  location: { path: [] },
});

/**
 * Fixed messages per yaml error code. yaml's own messages can quote the input
 * (e.g. a block scalar header), which may contain secrets, so they are never shown.
 */
const SYNTAX_MESSAGES: Partial<Record<ErrorCode, string>> = {
  BAD_INDENT: "Bad indentation.",
  TAB_AS_INDENT: "Tabs can't be used for indentation.",
  DUPLICATE_KEY: "Duplicate key.",
  BAD_SCALAR_START: "A value can't start with this character.",
  BLOCK_IN_FLOW: "Block syntax can't be used inside [ ] or { }.",
  MISSING_CHAR: "A closing bracket, brace, or quote is missing.",
  MULTILINE_IMPLICIT_KEY: "A key can't span multiple lines.",
  BLOCK_AS_IMPLICIT_KEY: "A nested block can't be used as a key.",
  BAD_ALIAS: "An alias refers to an anchor that isn't defined before it.",
  MULTIPLE_DOCS: "Only one YAML document is supported.",
  BAD_DQ_ESCAPE: "Invalid escape sequence in a double-quoted string.",
  UNEXPECTED_TOKEN: "Unexpected token.",
};

const syntaxMessage = (code: ErrorCode) => SYNTAX_MESSAGES[code] ?? `Invalid YAML (${code}).`;

/**
 * Checks the YAML AST before conversion: nesting deeper than LIMITS.maxDepth,
 * and non-scalar mapping keys. Compose keys are always strings, and complex or
 * aliased keys would otherwise hide depth and cycles once toJS() stringifies them.
 */
function checkAst(node: unknown, depth: number): Diagnostic | undefined {
  if (depth > LIMITS.maxDepth) return limitError(`Nesting is deeper than ${LIMITS.maxDepth} levels.`);
  if (isPair(node)) {
    if (node.key !== null && !isScalar(node.key)) {
      return { code: "schema", severity: "error", message: "Mapping keys must be plain strings.", location: { path: [] } };
    }
    return checkAst(node.value, depth);
  }
  if (isMap(node) || isSeq(node)) {
    for (const item of node.items) {
      const found = checkAst(item, depth + 1);
      if (found) return found;
    }
  }
  return undefined; // scalars and value aliases (bounded by maxAliasCount and checkShape)
}

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
    // logLevel "silent": yaml otherwise logs warnings that can quote input values.
    doc = parseDocument(text, {
      lineCounter,
      merge: true,
      uniqueKeys: true,
      prettyErrors: false,
      logLevel: "silent",
    });
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
        message: syntaxMessage(error.code),
        location: { line: pos.line, column: pos.col },
      };
    });
    return { diagnostics, locate };
  }

  const astError = checkAst(doc.contents, 0);
  if (astError) return { diagnostics: [astError], locate };

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
