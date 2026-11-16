import type { ComposeModel, GraphNode, Mount, PortMapping, Service } from "@compose-lens/core";
import type { ReactNode } from "react";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const List = ({ items }: { items: ReactNode[] }) =>
  items.length === 0 ? (
    <span className="text-slate-400">none</span>
  ) : (
    <ul className="space-y-0.5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );

const PORT_HOST: Record<PortMapping["host"]["kind"], string> = {
  fixed: "",
  dynamic: "host port assigned at random",
  pool: "one free host port from the range",
  unresolved: "contains a variable, not resolved",
};

function port(p: PortMapping) {
  const note = PORT_HOST[p.host.kind];
  return (
    <>
      <code>{p.raw}</code>
      {note && <span className="text-slate-500"> · {note}</span>}
    </>
  );
}

function mount(m: Mount) {
  const where = m.kind === "anonymous" || m.kind === "tmpfs" ? m.target : `${m.source ?? "?"} → ${m.target ?? "?"}`;
  return (
    <>
      <span className="text-slate-500">{m.kind === "other" ? m.type : m.kind}</span> <code>{where}</code>
      {m.readOnly && <span className="text-slate-500"> (read-only)</span>}
    </>
  );
}

const CONDITION: Record<string, string> = {
  service_started: "starts after it",
  service_healthy: "starts after it is healthy",
  service_completed_successfully: "starts after it completes successfully",
};

function ServiceDetails({ service }: { service: Service }) {
  return (
    <dl className="text-sm">
      {service.image && <Row label="Image"><code>{service.image}</code></Row>}
      {service.build && (
        <Row label="Build">
          <List
            items={[
              service.build.context && <>context <code>{service.build.context}</code></>,
              service.build.dockerfile && <>dockerfile <code>{service.build.dockerfile}</code></>,
              service.build.target && <>target <code>{service.build.target}</code></>,
              service.build.argKeys.length > 0 && <>args {service.build.argKeys.join(", ")} (values hidden)</>,
            ].filter(Boolean)}
          />
        </Row>
      )}
      {service.containerName && <Row label="Container">{service.containerName}</Row>}
      {service.restart && <Row label="Restart">{service.restart}</Row>}
      <Row label="Ports"><List items={service.ports.map(port)} /></Row>
      <Row label="Networks">
        {service.networkMode ? (
          <>network_mode <code>{service.networkMode}</code></>
        ) : (
          <List items={service.networks.map((n) => (n.implicit ? `${n.name} (implicit)` : n.name))} />
        )}
      </Row>
      <Row label="Volumes"><List items={service.volumes.map(mount)} /></Row>
      <Row label="Depends on">
        <List
          items={service.dependsOn.map((d) => (
            <>
              <strong>{d.service}</strong> <span className="text-slate-500">— {CONDITION[d.condition]}</span>
              {!d.required && <span className="text-slate-500"> (optional)</span>}
              {d.restart && <span className="text-slate-500"> (restarts with it)</span>}
            </>
          ))}
        />
      </Row>
      <Row label="Environment">
        {service.environmentKeys.length === 0 ? (
          <span className="text-slate-400">none</span>
        ) : (
          <>
            {service.environmentKeys.join(", ")}
            <div className="text-xs text-slate-500">Values are hidden.</div>
          </>
        )}
      </Row>
    </dl>
  );
}

export function DetailPanel({ node, model }: { node: GraphNode; model: ComposeModel }) {
  if (node.kind === "service") {
    const service = model.services.find((s) => s.name === node.label);
    return (
      <div>
        <h2 className="mb-2 text-base font-semibold">{node.label}</h2>
        {service && <ServiceDetails service={service} />}
      </div>
    );
  }
  const users = model.services.filter((s) =>
    node.kind === "network"
      ? s.networks.some((n) => n.name === node.label)
      : s.volumes.some((m) => m.kind === "named" && m.source === node.label),
  );
  return (
    <div>
      <h2 className="mb-2 text-base font-semibold">
        <span className="font-normal text-slate-500">{node.kind}</span> {node.label}
      </h2>
      <dl className="text-sm">
        {node.implicit && <Row label="Declared">No. Compose creates it for services without networks.</Row>}
        {node.external && <Row label="External">Yes. Its existence is not verified.</Row>}
        <Row label="Used by"><List items={users.map((s) => s.name)} /></Row>
      </dl>
      {node.kind === "network" && (
        <p className="mt-2 text-xs text-slate-500">
          Services on the same network can reach each other by configuration. This does not show actual traffic.
        </p>
      )}
    </div>
  );
}
