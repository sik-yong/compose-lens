import type { Diagnostic } from "@compose-lens/core";

const STYLE = {
  error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  info: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
} as const;

function where(d: Diagnostic) {
  const { line, column, path } = d.location;
  const parts = [];
  if (line !== undefined) parts.push(`line ${line}${column !== undefined ? `:${column}` : ""}`);
  if (path && path.length > 0) parts.push(path.join("."));
  return parts.join(" · ");
}

/** Renders `code` spans as <code>. Text only: no HTML is ever interpreted. */
function Message({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-white/60 px-0.5 dark:bg-black/30">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

const RANK = { error: 0, warning: 1, info: 2 } as const;

export function Diagnostics({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) return null;
  const sorted = [...diagnostics].sort(
    (a, b) => RANK[a.severity] - RANK[b.severity] || (a.location.line ?? 0) - (b.location.line ?? 0),
  );
  return (
    <ul className="max-h-48 space-y-1 overflow-auto px-4 pb-3" aria-label="Problems">
      {sorted.map((d, i) => (
        <li key={i} className={`rounded border px-2 py-1 text-xs ${STYLE[d.severity]}`}>
          <span className="font-semibold">{d.code}</span> <Message text={d.message} />
          {where(d) && <span className="block opacity-70">{where(d)}</span>}
        </li>
      ))}
    </ul>
  );
}
