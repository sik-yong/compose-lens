/** Minimal IP parsing for port conflict checks (no DNS, no zones). */

export interface ParsedIp {
  family: 4 | 6;
  /** Canonical text, so different spellings of one address compare equal. */
  canonical: string;
}

function parseIPv4(text: string): number[] | undefined {
  const parts = text.split(".");
  if (parts.length !== 4) return undefined;
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return bytes.every((b) => b >= 0 && b <= 255) ? bytes : undefined;
}

function parseIPv6(text: string): number[] | undefined {
  let tail: number[] = [];
  let head = text;
  const lastColon = text.lastIndexOf(":");
  if (text.includes(".")) {
    const v4 = parseIPv4(text.slice(lastColon + 1));
    if (!v4) return undefined;
    tail = [(v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!];
    head = text.slice(0, lastColon + 1);
    if (head.endsWith(":") && !head.endsWith("::")) head = head.slice(0, -1);
  }
  const halves = head.split("::");
  if (halves.length > 2) return undefined;
  const group = (s: string) => (s === "" ? [] : s.split(":"));
  const parse = (g: string) => (/^[0-9a-fA-F]{1,4}$/.test(g) ? parseInt(g, 16) : NaN);
  const left = group(halves[0] ?? "").map(parse);
  const right = halves.length === 2 ? group(halves[1] ?? "").map(parse) : [];
  if ([...left, ...right].some(Number.isNaN)) return undefined;
  const explicit = left.length + right.length + tail.length;
  if (halves.length === 1) return explicit === 8 ? [...left, ...tail] : undefined;
  if (explicit > 7) return undefined;
  return [...left, ...Array<number>(8 - explicit).fill(0), ...right, ...tail];
}

export function parseIp(text: string): ParsedIp | undefined {
  const v4 = parseIPv4(text);
  if (v4) return { family: 4, canonical: v4.join(".") };
  const v6 = parseIPv6(text.replace(/^\[|\]$/g, ""));
  if (v6) {
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) is the IPv4 address, as Docker unmaps it.
    if (v6.slice(0, 5).every((g) => g === 0) && v6[5] === 0xffff) {
      const [hi = 0, lo = 0] = v6.slice(6);
      return { family: 4, canonical: [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".") };
    }
    return { family: 6, canonical: v6.map((g) => g.toString(16)).join(":") };
  }
  return undefined;
}

const WILDCARD = { 4: "0.0.0.0", 6: "0:0:0:0:0:0:0:0" } as const;

/**
 * Whether two host IP bindings can collide on the same port.
 * Unset means all interfaces of both families (Docker binds 0.0.0.0 and ::).
 * 0.0.0.0 and :: are wildcards for their own family only (Docker sets
 * IPV6_V6ONLY). Unparseable values compare as written.
 */
export function ipsMayOverlap(a: string | undefined, b: string | undefined): boolean {
  return hostIpsOverlap(hostIp(a), hostIp(b));
}

/** A host IP prepared once for repeated overlap checks. */
export type HostIp = { kind: "unset" } | { kind: "parsed"; ip: ParsedIp } | { kind: "raw"; text: string };

export function hostIp(text: string | undefined): HostIp {
  if (text === undefined) return { kind: "unset" };
  const ip = parseIp(text);
  return ip ? { kind: "parsed", ip } : { kind: "raw", text };
}

export function hostIpsOverlap(a: HostIp, b: HostIp): boolean {
  if (a.kind === "unset" || b.kind === "unset") return true;
  if (a.kind === "raw" || b.kind === "raw") return a.kind === "raw" && b.kind === "raw" && a.text === b.text;
  const pa = a.ip;
  const pb = b.ip;
  if (pa.family !== pb.family) return false;
  const wildcard = WILDCARD[pa.family];
  return pa.canonical === wildcard || pb.canonical === wildcard || pa.canonical === pb.canonical;
}
