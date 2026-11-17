import { mermaidSizeWarnings, toMermaid, type ComposeGraph, type MermaidCurve, type RelationKind } from "@compose-lens/core";
import { RELATION_LABELS } from "./settings.js";
import { useMemo, useState } from "react";

const fenced = (code: string) => `\`\`\`mermaid\n${code}\`\`\`\n`;

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  graph: ComposeGraph;
  direction: "TB" | "LR";
  curve: MermaidCurve;
  /** Relation groups hidden in the view; the export matches the view. */
  hidden: RelationKind[];
  onClose: () => void;
}

export function MermaidExport({ graph, direction, curve, hidden, onClose }: Props) {
  const code = useMemo(() => toMermaid(graph, { direction, curve, hidden }), [graph, direction, curve, hidden]);
  const warnings = useMemo(() => mermaidSizeWarnings(graph, code), [graph, code]);
  const [copied, setCopied] = useState<string>();

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied("failed");
    }
  }

  const button =
    "rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700";
  return (
    <div className="absolute inset-3 z-10 flex flex-col rounded-md border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-base font-semibold">Mermaid</h2>
        <span className="flex-1" />
        <button type="button" className={button} onClick={() => void copy(code, "code")}>
          Copy
        </button>
        <button type="button" className={button} onClick={() => void copy(fenced(code), "markdown")}>
          Copy for README
        </button>
        <button type="button" className={button} onClick={() => download(code, "compose.mmd")}>
          Download .mmd
        </button>
        <button type="button" aria-label="Close Mermaid export" className="px-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        {copied === "failed"
          ? "Copy failed. Select the text below and copy it manually."
          : copied
            ? `Copied ${copied === "markdown" ? "as a ```mermaid block" : "the code"}.`
            : "Paste into a ```mermaid block in GitHub Markdown. Environment and build arg values are never included."}
      </p>
      {hidden.length > 0 && (
        <p role="status" className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Matches the current view. Hidden: {hidden.map((k) => RELATION_LABELS[k]).join(", ")}.
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} role="status" className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {w} The export is complete; nothing is left out.
        </p>
      ))}
      <textarea
        readOnly
        aria-label="Mermaid code"
        className="min-h-0 flex-1 resize-none rounded border border-slate-300 bg-slate-50 p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
        value={code}
        wrap="off"
        onFocus={(e) => e.currentTarget.select()}
      />
    </div>
  );
}
