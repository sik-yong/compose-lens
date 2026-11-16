import type { ComposeModel, GraphNode, Mount, NetworkMode, PortMapping, Service } from "@compose-lens/core";
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
  const kind = m.kind === "other" ? m.type : m.kind === "unresolved" ? "volume" : m.kind;
  return (
    <>
      <span className="text-slate-500">{kind}</span> <code>{where}</code>
      {m.readOnly && <span className="text-slate-500"> (read-only)</span>}
      {m.kind === "unresolved" && <Unresolved />}
    </>
  );
}

const hasVariable = (s: string) => s.replaceAll("$$", "").includes("$");
const Unresolved = () => <span className="text-amber-700"> (contains a variable, not resolved)</span>;

function networkMode(mode: NetworkMode) {
  switch (mode.kind) {
    case "none":
      return "none (no network)";
    case "host":
      return "host (uses the host's network directly)";
    case "service":
      return <>shares the network stack of <strong>{mode.service}</strong></>;
    case "container":
      return <>shares the network stack of external container <code>{mode.container}</code></>;
    case "other":
      return <><code>{mode.raw}</code> (not analyzed)</>;
    case "unresolved":
      return <><code>{mode.raw}</code><Unresolved /></>;
  }
}

const CONDITION: Record<string, string> = {
  service_started: "starts after it",
  service_healthy: "starts after it is healthy",
  service_completed_successfully: "starts after it completes successfully",
};

function ServiceDetails({ service }: { service: Service }) {
  return (
    <dl className="text-sm">
      {service.image && (
        <Row label="Image">
          <code>{service.image}</code>
          {hasVariable(service.image) && <Unresolved />}
        </Row>
      )}
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
      {service.hostname && <Row label="Hostname">{service.hostname}</Row>}
      {service.restart && <Row label="Restart">{service.restart}</Row>}
      <Row label="Ports"><List items={service.ports.map(port)} /></Row>
      {service.expose.length > 0 && <Row label="Expose">{service.expose.join(", ")} (container only)</Row>}
      <Row label="Networks">
        {service.networkMode ? (
          networkMode(service.networkMode)
        ) : (
          <List items={service.networks.map((n) => (n.implicit ? `${n.name} (implicit)` : n.name))} />
        )}
      </Row>
      <Row label="Volumes"><List items={service.volumes.map(mount)} /></Row>
      {service.tmpfs.length > 0 && <Row label="tmpfs"><List items={service.tmpfs.map((t) => <code>{t}</code>)} /></Row>}
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
      {service.envFiles.length > 0 && (
        <Row label="env_file">
          <List items={service.envFiles.map((f) => <code>{f}</code>)} />
          <div className="text-xs text-slate-500">Files are not read.</div>
        </Row>
      )}
      {service.secrets.length > 0 && <Row label="Secrets">{service.secrets.join(", ")}</Row>}
      {service.configs.length > 0 && <Row label="Configs">{service.configs.join(", ")}</Row>}
      {service.profiles.length > 0 && <Row label="Profiles">{service.profiles.join(", ")} (not evaluated)</Row>}
      {service.hasHealthcheck && <Row label="Healthcheck">defined</Row>}
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
