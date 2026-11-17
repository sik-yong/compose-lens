import { toMermaid, type ComposeGraph } from "@compose-lens/core";
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
  onClose: () => void;
}

export function MermaidExport({ graph, direction, onClose }: Props) {
  const code = useMemo(() => toMermaid(graph, { direction }), [graph, direction]);
  const [copied, setCopied] = useState<string>();

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied("failed");
    }
  }

  const button = "rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-100";
  return (
    <div className="absolute inset-3 z-10 flex flex-col rounded-md border border-slate-200 bg-white p-4 shadow-lg">
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
        <button type="button" aria-label="Close Mermaid export" className="px-1 text-slate-400 hover:text-slate-700" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="mb-2 text-xs text-slate-500">
        {copied === "failed"
          ? "Copy failed. Select the text below and copy it manually."
          : copied
            ? `Copied ${copied === "markdown" ? "as a ```mermaid block" : "the code"}.`
            : "Paste into a ```mermaid block in GitHub Markdown. Environment values are never included."}
      </p>
      <textarea
        readOnly
        aria-label="Mermaid code"
        className="min-h-0 flex-1 resize-none rounded border border-slate-300 bg-slate-50 p-3 font-mono text-xs"
        value={code}
        wrap="off"
        onFocus={(e) => e.currentTarget.select()}
      />
    </div>
  );
}
