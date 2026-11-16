import type { Diagnostic } from "@compose-lens/core";

const STYLE = {
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

function where(d: Diagnostic) {
  const { line, column, path } = d.location;
  const parts = [];
  if (line !== undefined) parts.push(`line ${line}${column !== undefined ? `:${column}` : ""}`);
  if (path && path.length > 0) parts.push(path.join("."));
  return parts.join(" · ");
}

export function Diagnostics({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <ul className="max-h-48 space-y-1 overflow-auto px-4 pb-3" aria-label="Problems">
      {diagnostics.map((d, i) => (
        <li key={i} className={`rounded border px-2 py-1 text-xs ${STYLE[d.severity]}`}>
          <span className="font-semibold">{d.code}</span> {d.message}
          {where(d) && <span className="block opacity-70">{where(d)}</span>}
        </li>
      ))}
    </ul>
  );
}
