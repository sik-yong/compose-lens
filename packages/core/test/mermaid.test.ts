import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze, escapeLabel, toMermaid } from "../src/index.js";

const mermaidOf = (yaml: string) => toMermaid(analyze(yaml).graph!);

describe("toMermaid", () => {
  it("renders the sample stack", () => {
    const sample = readFileSync(new URL("../../../examples/basic/compose.yaml", import.meta.url), "utf8");
    const out = toMermaid(analyze(sample).graph!);
    expect(out.startsWith("flowchart TB\n")).toBe(true);
    expect(toMermaid(analyze(sample).graph!, { direction: "LR" }).startsWith("flowchart LR\n")).toBe(true);
    expect(out).toContain('svc_2 -.->|"after healthy"| svc_3'); // web -> api
    expect(out).toContain('net_1(["frontend"]):::network');
    expect(out).toContain('vol_1[("db-data")]:::volume');
  });

  it("draws network_mode and optional dependencies", () => {
    const out = mermaidOf(
      "services:\n  app: {image: x}\n  side: {image: x, network_mode: 'service:app', depends_on: {app: {condition: service_started, required: false}}}\n",
    );
    expect(out).toContain('svc_2 ==>|"shares network stack"| svc_1');
    expect(out).toContain('svc_2 -.->|"starts after #40;optional#41;"| svc_1');
  });

  it("never lets names inject Mermaid syntax, directives, links, or HTML", () => {
    const hostile = [
      'a"] --> evil["x',
      "b\nclick svc_1 call alert(1)",
      "%%{init: {'securityLevel': 'loose'}}%%",
      "<img src=x onerror=alert(1)>",
      "c`**md**`",
      "d|e]f)g}h;i",
      "e#quot;f",
    ];
    // Names are YAML keys, so quote them.
    const services = hostile.map((name, i) => `  ${JSON.stringify(name)}: {image: x${i}, networks: [${JSON.stringify(name)}]}`);
    const networks = hostile.map((name) => `  ${JSON.stringify(name)}: {}`);
    const out = mermaidOf(`services:\n${services.join("\n")}\nnetworks:\n${networks.join("\n")}\n`);

    for (const line of out.trimEnd().split("\n").slice(1)) {
      // Every line is one node, one edge, or one classDef built from fixed parts.
      expect(line).toMatch(
        /^ {2}(?:(?:svc|net|vol)_\d+(?:\["[^"]*"\]|\(\["[^"]*"\]\):::network|\[\("[^"]*"\)\]:::volume)|(?:svc|net|vol)_\d+ (?:-\.->|==>)\|"[^"]*"\| (?:svc|net|vol)_\d+|(?:svc|net|vol)_\d+ --- (?:svc|net|vol)_\d+|classDef (?:network|volume) [^"]*)$/,
      );
    }
    expect(out).not.toMatch(/[<>`]|%%|\n\s*click/);
    // Labels only contain safe characters and #NNN; entity codes.
    for (const [, label] of out.matchAll(/"([^"]*)"/g)) {
      expect(label).toMatch(/^(?:[\p{L}\p{N} _.,:/@+=-]|#\d+;)*$/u);
    }
  });

  it("escapes every unsafe character as an entity code", () => {
    expect(escapeLabel('a"b')).toBe('"a#34;b"');
    expect(escapeLabel("x\ny")).toBe('"x y"');
    expect(escapeLabel("한글 app")).toBe('"한글 app"');
    expect(escapeLabel("\u202Eevil")).toBe('"#8238;evil"'); // bidi override is escaped
  });
});

describe("README Mermaid examples", () => {
  it("match the generator output for the sample stack", () => {
    const sample = readFileSync(new URL("../../../examples/basic/compose.yaml", import.meta.url), "utf8");
    const block = `\`\`\`mermaid\n${toMermaid(analyze(sample).graph!)}\`\`\``;
    for (const readme of ["README.md", "README.en.md"]) {
      expect(readFileSync(new URL(`../../../${readme}`, import.meta.url), "utf8"), readme).toContain(block);
    }
  });
});
