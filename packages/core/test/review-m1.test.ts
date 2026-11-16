// Regression tests for the Codex review of M1 (commit a45a3b4).
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyze, LIMITS, type AnalysisResult } from "../src/index.js";

const codes = (r: AnalysisResult) => r.diagnostics.map((d) => d.code);
const everything = (r: AnalysisResult) => JSON.stringify(r);

describe("masking: secrets never reach diagnostics or logs", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["environment", "services:\n  app:\n    environment:\n      TOKEN: |SECRET_VALUE\n        x\n"],
    ["build.args", "services:\n  app:\n    build:\n      args:\n        TOKEN: |SECRET_VALUE\n          x\n"],
  ])("does not quote a malformed %s value in YAML errors", (_, input) => {
    const r = analyze(input);
    expect(codes(r)).toContain("yaml-syntax");
    expect(everything(r)).not.toContain("SECRET_VALUE");
  });

  it("does not let the YAML library log input values", () => {
    const emit = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = analyze("services:\n  app:\n    image: x\n    environment:\n      TOKEN: {[SECRET_VALUE]: 1}\n");
    expect(emit).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(everything(r)).not.toContain("SECRET_VALUE");
  });
});

describe("limits", () => {
  it("counts lone surrogates as 3 UTF-8 bytes", () => {
    const input = `services: {app: {image: x}}\n#${"\uD800가".repeat(180000)}`;
    expect(codes(analyze(input))).toEqual(["limit"]);
  });

  it("rejects deeply nested keys (complex keys are not allowed at all)", () => {
    const key = `${"[".repeat(70)}k${"]".repeat(70)}`;
    expect(codes(analyze(`services: {app: {image: x}}\nx-deep: {? ${key} : 1}\n`))).toEqual(["schema"]);
  });

  it("still accepts nesting at the limit", () => {
    const value = `${"[".repeat(LIMITS.maxDepth - 2)}1${"]".repeat(LIMITS.maxDepth - 2)}`;
    expect(codes(analyze(`services: {app: {image: x}}\nx-deep: ${value}\n`))).toEqual([]);
  });
});

describe("ports: invalid is not unresolved", () => {
  const port = (spec: string) => analyze(`services:\n  a:\n    image: x\n    ports: ["${spec}"]\n`);

  it.each(["8080-8081:80-82", "bad:80", "8080:80-81", "70000:80"])("rejects %s", (spec) => {
    const r = port(spec);
    expect(codes(r)).toEqual(["schema"]);
    expect(r.model!.services[0]!.ports).toEqual([]);
  });

  it("keeps variables unresolved", () => {
    expect(port("${HOST_PORT}:80").model!.services[0]!.ports[0]!.host).toEqual({ kind: "unresolved" });
    expect(port("8080:${PORT}").model!.services[0]!.ports[0]!.host).toEqual({ kind: "unresolved" });
  });

  it("accepts equal-size ranges as fixed", () => {
    expect(port("9090-9091:8080-8081").model!.services[0]!.ports[0]!.host.kind).toBe("fixed");
  });
});

describe("volumes: Windows paths", () => {
  it.each(["C:\\\\data:/data:ro", "C:/data:/data:ro"])("treats %s as a read-only bind mount", (spec) => {
    const r = analyze(`services:\n  a:\n    image: x\n    volumes: ["${spec}"]\n`);
    expect(r.diagnostics).toEqual([]);
    expect(r.model!.services[0]!.volumes[0]).toMatchObject({ kind: "bind", target: "/data", readOnly: true });
    expect(r.model!.services[0]!.volumes[0]!.source).toMatch(/^C:[\\/]data$/);
  });
});

describe("invalid depends_on and network settings are reported, not normalized", () => {
  const deps = (spec: string) =>
    analyze(`services:\n  db: {image: x}\n  a:\n    image: x\n    depends_on:\n      db: ${spec}\n`);

  it.each([
    "123",
    "null",
    "{condition: never}",
    "{condition: null}",
    "{required: null}",
    '{restart: "yes"}',
  ])("rejects db: %s", (spec) => {
    const r = deps(spec);
    expect(codes(r)).toEqual(["schema"]);
    expect(r.graph!.edges.filter((e) => e.kind === "depends_on")).toEqual([]);
  });

  it('accepts the strings "true" and "false" for required and restart', () => {
    expect(deps('{required: "false", restart: "true"}').model!.services[1]!.dependsOn).toEqual([
      { service: "db", condition: "service_started", required: false, restart: true },
    ]);
  });

  it("accepts an empty entry as service_started", () => {
    expect(deps("{}").model!.services[1]!.dependsOn).toEqual([
      { service: "db", condition: "service_started", required: true, restart: false },
    ]);
  });

  it("rejects network_mode with an empty networks list", () => {
    expect(codes(analyze("services:\n  a: {image: x, network_mode: host, networks: []}\n"))).toEqual(["schema"]);
  });
});

describe("Codex re-review of 0bac079", () => {
  it("rejects complex keys that hide depth or cycles behind aliases", () => {
    expect(codes(analyze("x-keys: &a\n  ? [*a]\n  : 1\nservices:\n  app: {image: x}\n"))).toEqual(["schema"]);
    const deep = `${"[".repeat(40)}1${"]".repeat(40)}`;
    const input = `x-a: &a ${deep}\nx-b: {? ${"[".repeat(40)}*a${"]".repeat(40)} : 1}\nservices:\n  app: {image: x}\n`;
    expect(codes(analyze(input))).not.toEqual([]);
  });

  it.each(["missing:", ":/data", "./data:/data:", "a:b:ro:extra", ""])("rejects the volume %j", (spec) => {
    const r = analyze(`services:\n  a:\n    image: x\n    volumes: ["${spec}"]\n`);
    expect(codes(r)).toEqual(["schema"]);
    expect(r.model!.services[0]!.volumes).toEqual([]);
  });
});

describe("Codex re-review of b63f2c0", () => {
  it("allows an alias that resolves to a scalar as a key", () => {
    const r = analyze("x-name: &name app\nservices:\n  *name : {image: x}\n");
    expect(r.diagnostics).toEqual([]);
    expect(r.model!.services[0]!.name).toBe("app");
  });

  it("accepts TRUE and FALSE in any case", () => {
    const r = analyze("services:\n  db: {image: x}\n  a:\n    image: x\n    depends_on:\n      db: {required: FALSE, restart: \"True\"}\n");
    expect(r.model!.services[1]!.dependsOn[0]).toMatchObject({ required: false, restart: true });
  });
});
