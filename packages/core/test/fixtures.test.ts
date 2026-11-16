// Golden fixtures (PRD §12): each test/fixtures/<case>/compose.yaml has an
// expected.json with the normalized model, graph, and diagnostics.
// Regenerate after an intended change with: UPDATE_FIXTURES=1 npx vitest run fixtures
// and review the diff of every expected.json.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze, type AnalysisResult } from "../src/index.js";

const root = new URL("./fixtures/", import.meta.url);
const cases = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

/** A stable, reviewable summary. Diagnostic messages are left out so wording can change. */
function summarize(r: AnalysisResult) {
  const label = new Map(r.graph?.nodes.map((n) => [n.id, n.label]));
  return {
    diagnostics: r.diagnostics.map((d) => {
      const at = [d.location.path?.join(".") ?? "", d.location.line === undefined ? "" : `@${d.location.line}`].join("");
      return `${d.severity} ${d.code} ${at}`.trim();
    }),
    nodes: r.graph?.nodes.map((n) => [n.kind, n.label, n.implicit && "implicit", n.external && "external"].filter(Boolean).join(" ")),
    edges: r.graph?.edges.map(
      (e) => `${label.get(e.source)} -${e.kind}${e.label ? `[${e.label}]` : ""}${e.optional ? "?" : ""}-> ${label.get(e.target)}`,
    ),
    model: r.model,
  };
}

/** Any value containing this marker must never appear in output (PRD §8.4). */
const SECRET = "S3CRET";

describe("fixtures", () => {
  it("exist", () => expect(cases.length).toBeGreaterThan(0));

  for (const name of cases) {
    it(name, () => {
      const dir = new URL(`${name}/`, root);
      const result = analyze(readFileSync(new URL("compose.yaml", dir), "utf8"));
      expect(JSON.stringify(result)).not.toContain(SECRET);

      const actual = summarize(result);
      const expectedFile = new URL("expected.json", dir);
      if (process.env["UPDATE_FIXTURES"]) {
        writeFileSync(expectedFile, `${JSON.stringify(actual, null, 2)}\n`);
      }
      expect(existsSync(expectedFile), `${name}/expected.json is missing; run with UPDATE_FIXTURES=1`).toBe(true);
      expect(actual).toEqual(JSON.parse(readFileSync(expectedFile, "utf8")));
    });
  }
});
