import { describe, expect, it } from "vitest";
import { analyze, filterGraph, redactUrlCredentials, toMermaid, type RelationKind } from "../src/index.js";

const messages = (yaml: string) => analyze(yaml).diagnostics.map((d) => d.message);

describe("URL credentials", () => {
  it("redacts userinfo, including tokens used as a username and '@' in passwords", () => {
    expect(redactUrlCredentials("https://user:S3CRET@github.com/o/r.git#main")).toBe("https://***@github.com/o/r.git#main");
    expect(redactUrlCredentials("https://ghp_S3CRET@github.com/o/r.git")).toBe("https://***@github.com/o/r.git");
    expect(redactUrlCredentials("https://u:p@ssS3CRET@host/x")).toBe("https://***@host/x");
    expect(redactUrlCredentials("ssh://git@github.com/o/r.git")).toBe("ssh://***@github.com/o/r.git");
    expect(redactUrlCredentials("./app")).toBe("./app");
    expect(redactUrlCredentials("https://github.com/o/r.git?ref=a@b")).toBe("https://github.com/o/r.git?ref=a@b");
  });

  it("never exposes credentials from build contexts, dockerfiles, or env_file paths", () => {
    const yaml = [
      "services:",
      "  a:",
      "    build: https://tok:S3CRET@github.com/o/r.git",
      "  b:",
      "    build:",
      "      context: https://S3CRET@example.com/ctx.tar.gz",
      "      dockerfile: https://x:S3CRET@example.com/Dockerfile",
      "    env_file: [https://x:S3CRET@example.com/.env]",
      "",
    ].join("\n");
    const result = analyze(yaml);
    expect(JSON.stringify(result)).not.toContain("S3CRET");
    expect(toMermaid(result.graph!)).not.toContain("S3CRET");
    expect(result.model!.services[0]!.build!.context).toBe("https://***@github.com/o/r.git");
  });
});

describe("port pools", () => {
  it("notes a pool that overlaps a fixed host port, without a warning", () => {
    const result = analyze("services:\n  a: {image: x, ports: ['9000-9010:80']}\n  b: {image: x, ports: ['9005:9005']}\n");
    const pool = result.diagnostics.filter((d) => d.code === "conflict");
    expect(pool).toHaveLength(1);
    expect(pool[0]!.severity).toBe("info");
    expect(pool[0]!.message).toBe(
      "`a` takes one free host port from 9000-9010/tcp, which overlaps host port 9005 of `b`. They may conflict depending on which starts first.",
    );
  });

  it("ignores pools on a different protocol or host IP", () => {
    expect(messages("services:\n  a: {image: x, ports: ['9000-9010:80/udp']}\n  b: {image: x, ports: ['9005:9005']}\n")).toEqual([]);
    expect(messages("services:\n  a: {image: x, ports: ['127.0.0.1:9000-9010:80']}\n  b: {image: x, ports: ['127.0.0.2:9005:9005']}\n")).toEqual([]);
  });
});

describe("nested attributes", () => {
  it("keeps network aliases and addresses, and long port name/app_protocol/mode", () => {
    const yaml = [
      "services:",
      "  a:",
      "    image: x",
      "    networks:",
      "      back: {aliases: [db, primary], ipv4_address: 172.16.0.10, ipv6_address: 'fd00::10'}",
      "      front:",
      "    ports:",
      "      - {target: 80, published: 8080, name: web, app_protocol: http, mode: host}",
      "networks: {back: {}, front: {}}",
      "",
    ].join("\n");
    const result = analyze(yaml);
    expect(result.diagnostics).toEqual([]);
    const a = result.model!.services[0]!;
    expect(a.networks).toEqual([
      { name: "back", implicit: false, aliases: ["db", "primary"], ipv4Address: "172.16.0.10", ipv6Address: "fd00::10" },
      { name: "front", implicit: false },
    ]);
    expect(a.ports[0]).toMatchObject({ name: "web", appProtocol: "http", mode: "host" });
  });

  it("rejects a network entry that isn't a mapping", () => {
    expect(messages("services:\n  a: {image: x, networks: {back: 3}}\nnetworks: {back: {}}\n")).toContain(
      "A network entry must be a mapping or empty.",
    );
  });

  it("lists sub-keys that aren't analyzed, once per service and attribute", () => {
    const yaml = [
      "services:",
      "  a:",
      "    build: {context: ., ssh: [default], cache_from: [x], x-note: 1}",
      "    ports:",
      "      - {target: 80, published: 8080}",
      "    volumes:",
      "      - {type: bind, source: ., target: /app, bind: {propagation: rshared}}",
      "      - {type: volume, source: data, target: /data, volume: {nocopy: true}}",
      "    networks: {back: {priority: 10, mac_address: 02:42:ac:11:00:02}}",
      "volumes: {data: {}}",
      "networks: {back: {}}",
      "",
    ].join("\n");
    const notes = analyze(yaml).diagnostics.filter((d) => d.code === "unsupported").map((d) => [d.location.path?.join("."), d.message]);
    expect(notes).toEqual([
      ["services.a.build", "Not analyzed in `build`: `ssh`, `cache_from`."],
      ["services.a.networks", "Not analyzed in `networks`: `priority`, `mac_address`."],
      ["services.a.volumes", "Not analyzed in `volumes`: `bind`, `volume`."],
    ]);
  });
});

describe("relation filter", () => {
  const sample = analyze(
    "services:\n  a: {image: x, depends_on: [b], volumes: [data:/d]}\n  b: {image: x}\n  c: {image: x, network_mode: 'service:a'}\nvolumes: {data: {}}\n",
  ).graph!;
  const kinds = (shown: RelationKind[]) => {
    const g = filterGraph(sample, new Set(shown));
    return { nodes: g.nodes.map((n) => n.kind).sort(), edges: g.edges.map((e) => e.kind).sort() };
  };

  it("always keeps services and shows only the chosen relations", () => {
    expect(kinds(["networks"])).toEqual({
      nodes: ["network", "service", "service", "service"],
      edges: ["network", "network"],
    });
    expect(kinds(["network_mode"])).toEqual({ nodes: ["service", "service", "service"], edges: ["network_mode"] });
    expect(kinds(["volumes"])).toEqual({ nodes: ["service", "service", "service", "volume"], edges: ["volume"] });
    expect(kinds(["depends_on", "volumes"]).edges).toEqual(["depends_on", "volume"]);
    expect(kinds([])).toEqual({ nodes: ["service", "service", "service"], edges: [] });
  });

  it("keeps internal ids stable", () => {
    const g = filterGraph(sample, new Set<RelationKind>(["volumes"]));
    expect(g.nodes.find((n) => n.kind === "volume")!.id).toBe("vol_1");
  });
});

describe("secrets and configs", () => {
  const yaml = [
    "secrets:",
    "  token: {file: ./token.txt}",
    "  ext: {external: true}",
    "configs:",
    "  app_conf: {content: S3CRET}",
    "services:",
    "  a: {image: x, secrets: [token, {source: ext, target: /run/e}, missing], configs: [app_conf]}",
    "  b: {image: x, secrets: [token, token]}",
    "",
  ].join("\n");
  const result = analyze(yaml);

  it("draws name-only nodes and one edge per service and resource", () => {
    const g = result.graph!;
    expect(g.nodes.filter((n) => n.kind !== "service").map((n) => `${n.id} ${n.label}${n.external ? " ext" : ""}`)).toEqual([
      "net_1 default",
      "sec_1 token",
      "sec_2 ext ext",
      "cfg_1 app_conf",
    ]);
    expect(g.edges.filter((e) => e.kind === "secret" || e.kind === "config").map((e) => `${e.source}-${e.kind}-${e.target}`)).toEqual([
      "svc_1-secret-sec_1",
      "svc_1-secret-sec_2",
      "svc_1-config-cfg_1",
      "svc_2-secret-sec_1",
    ]);
    expect(JSON.stringify(result)).not.toContain("S3CRET");
  });

  it("reports undeclared and external secrets", () => {
    const found = result.diagnostics.map((d) => `${d.severity} ${d.message}`);
    expect(found).toContain("error `a` uses an undeclared secret `missing`.");
    expect(found).toContain("info External secret `ext`: its existence is not verified.");
  });

  it("exports them to Mermaid with their own shapes", () => {
    const out = toMermaid(result.graph!);
    expect(out).toContain('  sec_1{{"token"}}:::secret');
    expect(out).toContain('  cfg_1[/"app_conf"/]:::config');
    expect(out).toContain("  svc_1 --- sec_1");
    expect(out).toContain("classDef secret");
  });
});

describe("Mermaid options", () => {
  const graph = analyze("services:\n  a: {image: x}\n").graph!;

  it("adds fixed curve config only for non-default curves", () => {
    expect(toMermaid(graph).startsWith("flowchart TB\n")).toBe(true);
    expect(toMermaid(graph, { curve: "basis" }).startsWith("flowchart TB\n")).toBe(true);
    expect(toMermaid(graph, { curve: "step" }).startsWith("---\nconfig:\n  flowchart:\n    curve: step\n---\nflowchart TB\n")).toBe(true);
  });

  it("notes hidden relations in a comment", () => {
    expect(toMermaid(graph, { hidden: ["volumes", "depends_on"] })).toContain("flowchart TB\n  %% Hidden relations: volumes, depends_on\n");
  });
});
