import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze, LIMITS, type AnalysisResult } from "../src/index.js";

const sample = readFileSync(new URL("../../../examples/basic/compose.yaml", import.meta.url), "utf8");

const label = (r: AnalysisResult, id: string) => r.graph?.nodes.find((n) => n.id === id)?.label;
const edgesOf = (r: AnalysisResult, kind: string) =>
  (r.graph?.edges ?? []).filter((e) => e.kind === kind).map((e) => `${label(r, e.source)}->${label(r, e.target)}`);
const codes = (r: AnalysisResult) => r.diagnostics.map((d) => d.code);

describe("analyze: sample stack", () => {
  const r = analyze(sample);

  it("has no diagnostics and one node per service, network, and volume", () => {
    expect(r.diagnostics).toEqual([]);
    const byKind = (k: string) => r.graph!.nodes.filter((n) => n.kind === k).map((n) => n.label);
    expect(byKind("service")).toEqual(["proxy", "web", "api", "migrate", "worker", "db", "cache"]);
    expect(byKind("network")).toEqual(["frontend", "backend"]);
    expect(byKind("volume")).toEqual(["db-data", "uploads"]);
  });

  it("draws depends_on from the dependent to the dependency, labeled by condition", () => {
    expect(edgesOf(r, "depends_on")).toContain("web->api");
    const edge = r.graph!.edges.find((e) => e.kind === "depends_on" && label(r, e.source) === "api" && label(r, e.target) === "migrate");
    expect(edge?.label).toBe("after successful completion");
  });

  it("uses internal ids, never names from the input", () => {
    for (const n of r.graph!.nodes) expect(n.id).toMatch(/^(svc|net|vol)_\d+$/);
  });

  it("never exposes environment values", () => {
    const output = JSON.stringify({ model: r.model, graph: r.graph, diagnostics: r.diagnostics });
    expect(output).not.toContain("change-me");
    expect(output).not.toContain("redis://cache");
    expect(r.model!.services.find((s) => s.name === "api")!.environmentKeys).toEqual(["DATABASE_URL", "REDIS_URL"]);
  });
});

describe("analyze: networks", () => {
  it("joins services without networks (or with empty networks) to an implicit default network", () => {
    const r = analyze("services:\n  a: {image: x}\n  b: {image: x, networks: []}\n  c: {image: x, networks: {}}\n");
    expect(r.graph!.nodes.filter((n) => n.kind === "network")).toMatchObject([{ label: "default", implicit: true }]);
    expect(edgesOf(r, "network")).toEqual(["a->default", "b->default", "c->default"]);
  });

  it("does not join default when network_mode is set", () => {
    const r = analyze("services:\n  a: {image: x, network_mode: host}\n");
    expect(r.graph!.edges).toEqual([]);
    expect(r.model!.services[0]!.networkMode).toEqual({ kind: "host" });
  });

  it("rejects networks together with network_mode", () => {
    const r = analyze("services:\n  a: {image: x, network_mode: host, networks: [n]}\nnetworks: {n: {}}\n");
    expect(codes(r)).toContain("schema");
  });

  it("accepts an explicit default network without a declaration", () => {
    const r = analyze("services:\n  a: {image: x, networks: [default]}\n");
    expect(r.diagnostics).toEqual([]);
    expect(edgesOf(r, "network")).toEqual(["a->default"]);
  });
});

describe("analyze: ports", () => {
  const ports = (spec: string) => analyze(`services:\n  a:\n    image: x\n    ports: ${spec}\n`).model!.services[0]!.ports;

  it("classifies host bindings", () => {
    expect(ports('["8080:80"]')[0]!.host).toEqual({ kind: "fixed", ports: { start: 8080, end: 8080 } });
    expect(ports('["80"]')[0]!.host).toEqual({ kind: "dynamic" });
    expect(ports('["8000-8010:80"]')[0]!.host).toMatchObject({ kind: "pool" });
    expect(ports('["9090-9091:8080-8081"]')[0]!.host).toMatchObject({ kind: "fixed" });
    expect(ports('["${PORT}:80"]')[0]!.host).toEqual({ kind: "unresolved" });
  });

  it("parses host IPs and protocols in short and long syntax", () => {
    expect(ports('["127.0.0.1:53:53/udp"]')[0]).toMatchObject({ hostIp: "127.0.0.1", protocol: "udp" });
    expect(ports('["[::1]:6001:6001"]')[0]).toMatchObject({ hostIp: "::1" });
    expect(ports("[{target: 80, published: 8080, host_ip: 0.0.0.0, protocol: tcp}]")[0]).toMatchObject({
      hostIp: "0.0.0.0",
      host: { kind: "fixed" },
      container: { start: 80, end: 80 },
    });
  });
});

describe("analyze: volumes", () => {
  const mounts = (spec: string) =>
    analyze(`services:\n  a:\n    image: x\n    volumes: ${spec}\nvolumes: {data: {}}\n`).model!.services[0]!.volumes;

  it("tells named, bind, anonymous, and tmpfs mounts apart", () => {
    expect(mounts('["data:/d", "./src:/app:ro", "/cache", "~/x:/x"]').map((m) => m.kind)).toEqual([
      "named",
      "bind",
      "anonymous",
      "bind",
    ]);
    expect(mounts('["./src:/app:ro"]')[0]!.readOnly).toBe(true);
    expect(mounts("[{type: tmpfs, target: /tmp}, {type: volume, target: /v}]").map((m) => m.kind)).toEqual([
      "tmpfs",
      "anonymous",
    ]);
  });

  it("does not turn anonymous volumes into shared graph nodes", () => {
    const r = analyze("services:\n  a: {image: x, volumes: [/data]}\n  b: {image: x, volumes: [/data]}\n");
    expect(r.graph!.nodes.filter((n) => n.kind === "volume")).toEqual([]);
  });
});

describe("analyze: diagnostics", () => {
  it("reports YAML syntax errors with line and column", () => {
    const r = analyze("services:\n  web:\n    image: [unclosed\n");
    expect(r.graph).toBeUndefined();
    expect(r.diagnostics[0]).toMatchObject({ code: "yaml-syntax", location: { line: expect.any(Number) } });
  });

  it("reports undefined references separately from syntax errors, with a line", () => {
    const r = analyze("services:\n  web:\n    image: x\n    depends_on: [db]\n    volumes: [missing:/d]\n");
    expect(codes(r)).toEqual(["reference", "reference"]);
    expect(r.diagnostics[0]!.location).toMatchObject({ path: ["services", "web", "depends_on"], line: 4 });
    expect(r.graph!.edges).toHaveLength(1); // only the implicit default network edge
  });

  it("requires a services mapping", () => {
    expect(codes(analyze("version: '3'\n"))).toEqual(["schema"]);
    expect(codes(analyze("- a\n- b\n"))).toEqual(["schema"]);
  });

  it("supports anchors and merge keys", () => {
    const r = analyze("x-base: &base\n  image: x\n  networks: [n]\nservices:\n  a:\n    <<: *base\nnetworks: {n: {}}\n");
    expect(r.diagnostics).toEqual([]);
    expect(r.model!.services[0]).toMatchObject({ image: "x", networks: [{ name: "n" }] });
  });
});

describe("analyze: limits", () => {
  it("rejects oversized input", () => {
    expect(codes(analyze(`# ${"x".repeat(LIMITS.maxInputBytes)}`))).toEqual(["limit"]);
  });

  it("rejects alias bombs", () => {
    const lines = ['a: &a ["x","x","x","x","x","x","x","x","x"]'];
    for (const [prev, next] of [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"]]) {
      lines.push(`${next}: &${next} [${Array(9).fill(`*${prev}`).join(",")}]`);
    }
    expect(codes(analyze(lines.join("\n")))).toEqual(["limit"]);
  });

  it("rejects excessive nesting", () => {
    expect(codes(analyze(`services: ${"[".repeat(100)}${"]".repeat(100)}`))).toEqual(["limit"]);
  });

  it("rejects too many services", () => {
    const services = Array.from({ length: LIMITS.maxServices + 1 }, (_, i) => `  s${i}: {image: x}`).join("\n");
    expect(codes(analyze(`services:\n${services}\n`))).toEqual(["limit"]);
  });
});
