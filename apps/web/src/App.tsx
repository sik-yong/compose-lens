import { LIMITS } from "@compose-lens/core";

/** Phase 1 shell: layout only. Parsing (Phase 2) and the graph (Phase 3) come next. */
export function App() {
  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-base font-semibold">Compose Lens</h1>
        <span className="text-xs text-slate-500">pre-alpha · runs locally in your browser</span>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(320px,2fr)_3fr]">
        <section className="flex min-h-0 flex-col border-b border-slate-200 md:border-r md:border-b-0">
          <label htmlFor="compose-input" className="px-4 pt-3 pb-1 text-sm font-medium">
            Compose YAML
          </label>
          <textarea
            id="compose-input"
            className="m-4 mt-1 min-h-48 flex-1 resize-none rounded border border-slate-300 bg-white p-3 font-mono text-sm"
            placeholder="Paste a compose.yaml here"
            spellCheck={false}
          />
          <p className="px-4 pb-3 text-xs text-slate-500">
            Max {LIMITS.maxInputBytes / 1024 / 1024} MiB. Nothing is uploaded.
          </p>
        </section>
        <section className="flex min-h-64 items-center justify-center text-sm text-slate-400">
          The service graph will appear here.
        </section>
      </main>
    </div>
  );
}
