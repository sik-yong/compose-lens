import type { ComposeGraph, GraphNode } from "./graph.js";

/**
 * Characters allowed as-is inside a quoted Mermaid label. Everything else is
 * written as a Mermaid entity code (#NNN;), so input can never close the
 * label, start a directive (%%), add a click/link, or inject HTML (PRD §8.2).
 */
const SAFE = /[\p{L}\p{N} _.,:/@+=-]/u;

export function escapeLabel(text: string): string {
  let out = "";
  for (const char of text.replace(/[\r\n\t]+/g, " ")) {
    out += SAFE.test(char) ? char : `#${char.codePointAt(0)};`;
  }
  return `"${out}"`;
}

function nodeLine(n: GraphNode): string {
  const tags = [n.implicit && "implicit", n.external && "external"].filter(Boolean).join(", ");
  const label = escapeLabel(tags ? `${n.label} (${tags})` : n.label);
  switch (n.kind) {
    case "service":
      return `  ${n.id}[${label}]`;
    case "network":
      return `  ${n.id}([${label}]):::network`;
    case "volume":
      return `  ${n.id}[(${label})]:::volume`;
  }
}

/**
 * Renders the graph as a Mermaid flowchart. Node ids are the graph's internal
 * ids (svc_1, net_1, vol_1), never text from the input.
 */
export function toMermaid(graph: ComposeGraph, options: { direction?: "TB" | "LR" } = {}): string {
  const lines = [`flowchart ${options.direction ?? "TB"}`];
  for (const n of graph.nodes) lines.push(nodeLine(n));
  for (const e of graph.edges) {
    switch (e.kind) {
      case "depends_on": {
        const label = escapeLabel(e.optional ? `${e.label} (optional)` : (e.label ?? ""));
        lines.push(`  ${e.source} -.->|${label}| ${e.target}`);
        break;
      }
      case "network_mode":
        lines.push(`  ${e.source} ==>|${escapeLabel(e.label ?? "")}| ${e.target}`);
        break;
      case "network":
      case "volume":
        lines.push(`  ${e.source} --- ${e.target}`);
        break;
    }
  }
  lines.push("  classDef network fill:#f5f3ff,stroke:#a78bfa,color:#2e1065");
  lines.push("  classDef volume fill:#fffbeb,stroke:#f59e0b,color:#451a03");
  return `${lines.join("\n")}\n`;
}
