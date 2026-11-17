import { analyze, LIMITS, type GraphNode } from "@compose-lens/core";
import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import sample from "../../../examples/basic/compose.yaml?raw";
import { DetailPanel } from "./DetailPanel.js";
import { Diagnostics } from "./Diagnostics.js";
import { GraphView } from "./GraphView.js";
import type { Direction } from "./layout.js";
import { MermaidExport } from "./MermaidExport.js";

const MAX_MIB = LIMITS.maxInputBytes / 1024 / 1024;

/** Debounces typing so large files aren't re-analyzed on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function App() {
  const [text, setText] = useState(sample);
  const [fileError, setFileError] = useState<string>();
  const [selected, setSelected] = useState<GraphNode>();
  const [showMermaid, setShowMermaid] = useState(false);
  // Top to bottom reads best for typical stacks: dependencies flow down to shared networks and volumes.
  const [direction, setDirection] = useState<Direction>("TB");
  const input = useDebounced(text, 250);
  const result = useMemo(() => analyze(input), [input]);

  useEffect(() => setSelected(undefined), [result]);

  async function load(file: File | undefined) {
    if (!file) return;
    if (file.size > LIMITS.maxInputBytes) {
      setFileError(`${file.name} is larger than ${MAX_MIB} MiB.`);
      return;
    }
    setFileError(undefined);
    setText(await file.text());
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    void load(e.target.files?.[0]);
    e.target.value = "";
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    void load(e.dataTransfer.files[0]);
  };

  const errors = result.diagnostics.filter((d) => d.severity === "error").length;

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-base font-semibold">Compose Lens</h1>
        <span className="text-xs text-slate-500">pre-alpha · runs locally in your browser</span>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_1fr] md:grid-cols-[minmax(320px,2fr)_5fr] md:grid-rows-1">
        <section
          className="flex min-h-0 flex-col border-b border-slate-200 md:border-r md:border-b-0"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <label htmlFor="compose-input" className="text-sm font-medium">
              Compose YAML
            </label>
            <span className="flex-1" />
            <label className="cursor-pointer rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-100">
              Open file
              <input type="file" accept=".yml,.yaml" className="sr-only" onChange={onFile} />
            </label>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-100"
              onClick={() => setText(sample)}
            >
              Sample
            </button>
          </div>
          <textarea
            id="compose-input"
            className="mx-4 my-1 min-h-48 flex-1 resize-none rounded border border-slate-300 bg-white p-3 font-mono text-sm"
            placeholder="Paste a compose.yaml here, or drop a file"
            spellCheck={false}
            wrap="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="px-4 pb-2 text-xs text-slate-500">
            {fileError ?? `Max ${MAX_MIB} MiB. Nothing is uploaded.`}
            {errors > 0 && ` · ${errors} error${errors > 1 ? "s" : ""}`}
          </p>
          <Diagnostics diagnostics={result.diagnostics} />
        </section>
        <section className="relative min-h-96">
          {result.graph && result.model ? (
            <>
              <GraphView key={direction} graph={result.graph} model={result.model} direction={direction} onSelect={setSelected} />
              <div className="absolute top-3 left-3 flex gap-1.5">
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm hover:bg-slate-100"
                  onClick={() => setDirection(direction === "LR" ? "TB" : "LR")}
                  title="Switch layout direction"
                >
                  {direction === "LR" ? "Left → right" : "Top → bottom"}
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm hover:bg-slate-100"
                  onClick={() => setShowMermaid(true)}
                >
                  Export Mermaid
                </button>
              </div>
              {showMermaid && <MermaidExport graph={result.graph} direction={direction} onClose={() => setShowMermaid(false)} />}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Fix the problems on the left to see the graph.
            </div>
          )}
          {selected && result.model && (
            <aside className="absolute top-3 right-3 max-h-[calc(100%-24px)] w-80 overflow-auto rounded-md border border-slate-200 bg-white p-4 shadow-lg">
              <button
                type="button"
                aria-label="Close details"
                className="float-right text-slate-400 hover:text-slate-700"
                onClick={() => setSelected(undefined)}
              >
                ✕
              </button>
              <DetailPanel node={selected} model={result.model} />
            </aside>
          )}
        </section>
      </main>
    </div>
  );
}
