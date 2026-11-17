import {
  analyze,
  filterGraph,
  LIMITS,
  RELATION_KINDS,
  type ComposeGraph,
  type GraphEdgeKind,
  type GraphNode,
  type RelationKind,
} from "@compose-lens/core";
import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import sample from "../../../examples/basic/compose.yaml?raw";
import { DetailPanel } from "./DetailPanel.js";
import { Diagnostics } from "./Diagnostics.js";
import { GraphView } from "./GraphView.js";
import type { Direction } from "./layout.js";
import { MermaidExport } from "./MermaidExport.js";
import { EDGE_STYLES, RELATION_LABELS, useResolvedTheme, useSettings, type EdgeStyle, type Theme } from "./settings.js";

const MAX_MIB = LIMITS.maxInputBytes / 1024 / 1024;

const EDGE_RELATION: Record<GraphEdgeKind, RelationKind> = {
  depends_on: "depends_on",
  network: "networks",
  network_mode: "network_mode",
  volume: "volumes",
  secret: "secrets",
  config: "configs",
};

/** Number of relations (edges, or resources without edges) per group, so empty groups can be disabled. */
function relationCounts(graph: ComposeGraph): Record<RelationKind, number> {
  const counts = Object.fromEntries(RELATION_KINDS.map((k) => [k, 0])) as Record<RelationKind, number>;
  for (const e of graph.edges) counts[EDGE_RELATION[e.kind]]++;
  for (const n of graph.nodes) {
    if (n.kind === "network" && counts.networks === 0) counts.networks = 1;
    if (n.kind === "volume" && counts.volumes === 0) counts.volumes = 1;
    if (n.kind === "secret" && counts.secrets === 0) counts.secrets = 1;
    if (n.kind === "config" && counts.configs === 0) counts.configs = 1;
  }
  return counts;
}

/** Debounces typing so large files aren't re-analyzed on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const control =
  "rounded border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700";

export function App() {
  const [text, setText] = useState(sample);
  const [fileError, setFileError] = useState<string>();
  const [selected, setSelected] = useState<GraphNode>();
  const [showMermaid, setShowMermaid] = useState(false);
  // Top to bottom reads best for typical stacks: dependencies flow down to shared networks and volumes.
  const [direction, setDirection] = useState<Direction>("TB");
  const [settings, setSettings] = useSettings();
  const mode = useResolvedTheme(settings.theme);
  const input = useDebounced(text, 250);
  const result = useMemo(() => analyze(input), [input]);
  const shown = useMemo(() => new Set(settings.relations), [settings.relations]);
  const view = useMemo(() => (result.graph ? filterGraph(result.graph, shown) : undefined), [result.graph, shown]);
  const counts = useMemo(() => (result.graph ? relationCounts(result.graph) : undefined), [result.graph]);
  const hidden = RELATION_KINDS.filter((k) => !shown.has(k) && (counts?.[k] ?? 0) > 0);

  useEffect(() => setSelected(undefined), [result]);
  useEffect(() => {
    if (selected && view && !view.nodes.some((n) => n.id === selected.id)) setSelected(undefined);
  }, [selected, view]);

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

  const toggleRelation = (kind: RelationKind) =>
    setSettings((s) => ({
      ...s,
      relations: s.relations.includes(kind) ? s.relations.filter((k) => k !== kind) : [...s.relations, kind],
    }));

  const errors = result.diagnostics.filter((d) => d.severity === "error").length;
  const curve = EDGE_STYLES.find((e) => e.value === settings.edgeStyle)?.curve ?? "basis";

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-base font-semibold">Compose Lens</h1>
        <span className="flex-1 text-xs text-slate-500 dark:text-slate-400">alpha · runs locally in your browser</span>
        <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          Theme
          <select
            className={control}
            value={settings.theme}
            onChange={(e) => setSettings((s) => ({ ...s, theme: e.target.value as Theme }))}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_1fr] md:grid-cols-[minmax(320px,2fr)_5fr] md:grid-rows-1">
        <section
          className="flex min-h-0 flex-col border-b border-slate-200 md:border-r md:border-b-0 dark:border-slate-800"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <label htmlFor="compose-input" className="text-sm font-medium">
              Compose YAML
            </label>
            <span className="flex-1" />
            <label className={`cursor-pointer ${control} py-0.5`}>
              Open file
              <input type="file" accept=".yml,.yaml" className="sr-only" onChange={onFile} />
            </label>
            <button type="button" className={`${control} py-0.5`} onClick={() => setText(sample)}>
              Sample
            </button>
          </div>
          <textarea
            id="compose-input"
            className="mx-4 my-1 min-h-48 flex-1 resize-none rounded border border-slate-300 bg-white p-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="Paste a compose.yaml here, or drop a file"
            spellCheck={false}
            wrap="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="px-4 pb-2 text-xs text-slate-500 dark:text-slate-400">
            {fileError ?? `Max ${MAX_MIB} MiB. Nothing is uploaded.`}
            {errors > 0 && ` · ${errors} error${errors > 1 ? "s" : ""}`}
          </p>
          <Diagnostics diagnostics={result.diagnostics} />
        </section>
        <section className="flex min-h-96 flex-col">
          {view && result.model && counts ? (
            <>
              <div
                role="toolbar"
                aria-label="Graph view"
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <button
                  type="button"
                  className={control}
                  onClick={() => setDirection(direction === "LR" ? "TB" : "LR")}
                  title="Switch layout direction"
                >
                  {direction === "LR" ? "Left → right" : "Top → bottom"}
                </button>
                <label className="flex items-center gap-1">
                  Lines
                  <select
                    className={control}
                    value={settings.edgeStyle}
                    onChange={(e) => setSettings((s) => ({ ...s, edgeStyle: e.target.value as EdgeStyle }))}
                  >
                    {EDGE_STYLES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <legend className="sr-only">Relations to show</legend>
                  {RELATION_KINDS.map((kind) => (
                    <label
                      key={kind}
                      className={`flex items-center gap-1 ${counts[kind] === 0 ? "text-slate-400 dark:text-slate-600" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={shown.has(kind)}
                        disabled={counts[kind] === 0}
                        onChange={() => toggleRelation(kind)}
                      />
                      {RELATION_LABELS[kind]}
                    </label>
                  ))}
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={settings.showPorts}
                      onChange={() => setSettings((s) => ({ ...s, showPorts: !s.showPorts }))}
                    />
                    Ports on nodes
                  </label>
                </fieldset>
                <span className="flex-1" />
                <button type="button" className={control} onClick={() => setShowMermaid(true)}>
                  Export Mermaid
                </button>
              </div>
              <div className="relative min-h-0 flex-1">
                <GraphView
                  // Remount to re-fit the view when the layout inputs change.
                  key={`${direction}:${settings.relations.join(",")}:${settings.showPorts}`}
                  graph={view}
                  model={result.model}
                  direction={direction}
                  edgeStyle={settings.edgeStyle}
                  showPorts={settings.showPorts}
                  mode={mode}
                  onSelect={setSelected}
                />
                {hidden.length > 0 && (
                  <p
                    role="status"
                    className="absolute top-3 left-3 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                  >
                    Hidden: {hidden.map((k) => RELATION_LABELS[k]).join(", ")}
                  </p>
                )}
                {showMermaid && (
                  <MermaidExport
                    graph={view}
                    direction={direction}
                    curve={curve}
                    hidden={hidden}
                    onClose={() => setShowMermaid(false)}
                  />
                )}
                {selected && (
                  <aside className="absolute top-3 right-3 max-h-[calc(100%-24px)] w-80 overflow-auto rounded-md border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    <button
                      type="button"
                      aria-label="Close details"
                      className="float-right text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      onClick={() => setSelected(undefined)}
                    >
                      ✕
                    </button>
                    <DetailPanel node={selected} model={result.model} />
                  </aside>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Fix the problems on the left to see the graph.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
