"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ForceGraphCanvas = dynamic(() => import("./force-graph-canvas"), {
  ssr: false,
});

// ── Data shape (scripts/build-system-map.ts) ──────────────────────

type Group = "product" | "mobile" | "money" | "growth" | "social" | "infra";
type EdgeType = "i" | "a" | "e";

interface Sys {
  id: string;
  label: string;
  group: Group;
  description: string;
  status: "live" | "partial" | "retired";
  statusNote?: string;
  files: number;
  lines: number;
  tables: [string, number][];
  services: [string, number][];
}
interface FileRec {
  p: string;
  s: string;
  k: "route" | "page" | "job" | "screen" | "component" | "lib";
  n: number;
  d?: string;
  u?: string;
  t?: string[];
  v?: string[];
}
interface Job {
  name: string;
  label: string;
  file: number;
  crons: string[];
  events: string[];
  registered: boolean;
}
interface MapData {
  generatedAt: string;
  commit: string;
  systems: Sys[];
  services: { id: string; label: string }[];
  files: FileRec[];
  edges: [number, number, EdgeType][];
  systemEdges: { source: string; target: string; i: number; a: number; e: number }[];
  jobs: Job[];
}

type View = "systems" | "files" | "all";
type Selection =
  | { type: "system"; id: string }
  | { type: "service"; id: string }
  | { type: "file"; id: number }
  | { type: "table"; id: string }
  | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GLink = any;

// ── Look ──────────────────────────────────────────────────────────

const GROUPS: Record<Group, { label: string; color: string }> = {
  product: { label: "Ripple product", color: "#F08A65" },
  mobile: { label: "Mobile app", color: "#E8B04B" },
  money: { label: "Money & signups", color: "#4FC48A" },
  growth: { label: "Growth & ads", color: "#A98BF0" },
  social: { label: "Social content", color: "#4CC9E0" },
  infra: { label: "Plumbing", color: "#8A97AD" },
};
const SERVICE_COLOR = "#C9CED8";
const TABLE_COLOR = "#7D8799";
const EDGE_COLOR: Record<EdgeType, string> = {
  i: "170,180,200",
  a: "76,201,224",
  e: "232,176,75",
};
const EDGE_LABEL: Record<EdgeType, string> = {
  i: "uses code from",
  a: "calls the API of",
  e: "kicks off a job in",
};
const KIND_LABEL: Record<FileRec["k"], string> = {
  route: "API route",
  page: "Web page",
  job: "Background job",
  screen: "App screen",
  component: "UI component",
  lib: "Logic",
};
const GITHUB = "https://github.com/jimheelerdigital/Acuity/blob/main/";

// ── Helpers ───────────────────────────────────────────────────────

function humanCron(raw: string): string {
  let c = raw;
  let tz = "UTC";
  const m = c.match(/^(?:CRON_)?TZ=(\S+)\s+(.*)$/);
  if (m) {
    tz = m[1].split("/").pop()!.replace("_", " ");
    c = m[2];
  }
  const [min, hr, dom, , dow] = c.split(/\s+/);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (min?.startsWith("*/") && hr === "*") return `every ${min.slice(2)} min`;
  if (hr === "*" && /^\d+$/.test(min)) return min === "0" ? "hourly" : `hourly at :${min.padStart(2, "0")}`;
  if (hr?.startsWith("*/")) return `every ${hr.slice(2)} hours`;
  if (!/^[\d,]+$/.test(hr ?? "") || !/^\d+$/.test(min ?? "")) return `${c} (${tz})`;
  const times = hr.split(",").map((h) => `${h.padStart(2, "0")}:${min.padStart(2, "0")}`).join(", ");
  let when = "daily";
  if (dow && dow !== "*") {
    when = dow
      .split(",")
      .map((d) => (d.includes("-") ? d.split("-").map((x) => days[+x % 7]).join("–") : days[+d % 7]))
      .join(", ");
  }
  if (dom && dom !== "*") when = `day ${dom} of the month`;
  return `${when} ${times} ${tz}`;
}

function baseName(p: string): string {
  const parts = p.split("/");
  const last = parts[parts.length - 1].replace(/\.(tsx?|jsx?)$/, "");
  if (["page", "route", "layout", "index", "client"].includes(last)) {
    return parts.slice(-2).join("/").replace(/\.(tsx?|jsx?)$/, "");
  }
  return last;
}

function shortPath(p: string): string {
  return p.replace(/^apps\/web\/src\//, "web/").replace(/^apps\/mobile\//, "mobile/").replace(/^packages\/shared\/src\//, "shared/");
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

function loadLayout(key: string): Record<string, [number, number]> {
  try {
    return JSON.parse(localStorage.getItem(`systemMap.layout.v1.${key}`) ?? "{}");
  } catch {
    return {};
  }
}
function saveLayout(key: string, nodes: GNode[]) {
  try {
    const out: Record<string, [number, number]> = {};
    for (const n of nodes) if (n.fx != null && n.fy != null) out[n.id] = [Math.round(n.fx), Math.round(n.fy)];
    localStorage.setItem(`systemMap.layout.v1.${key}`, JSON.stringify(out));
  } catch {
    // storage blocked: layout just isn't remembered
  }
}
function clearLayout(key: string) {
  try {
    localStorage.removeItem(`systemMap.layout.v1.${key}`);
  } catch {
    // ignore
  }
}

// Small custom d3 forces (no extra dependency): pull nodes toward an
// anchor point, and keep circles from overlapping.
// Each group gets its own region of the systems view so the map reads
// as neighbourhoods: product left, mobile bottom-left, money bottom,
// growth top, social content top-right, plumbing in the middle.
const GROUP_ANCHOR: Record<Group, [number, number]> = {
  product: [-620, 20],
  mobile: [-460, 560],
  money: [160, 520],
  growth: [-80, -520],
  social: [640, -260],
  infra: [60, 20],
};

function anchorForce(target: (n: GNode) => [number, number] | null, strength: number) {
  let nodes: GNode[] = [];
  const force = (alpha: number) => {
    for (const n of nodes) {
      const t = target(n);
      if (!t) continue;
      n.vx += (t[0] - n.x) * strength * alpha;
      n.vy += (t[1] - n.y) * strength * alpha;
    }
  };
  force.initialize = (ns: GNode[]) => {
    nodes = ns;
  };
  return force;
}

function collideForce(pad: number, strength = 1, xSquash = 1) {
  // xSquash < 1 asks for more room side to side than top to bottom,
  // since labels are wider than they are tall.
  let nodes: GNode[] = [];
  const force = () => {
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = (b.x - a.x) * xSquash || 0.01;
          const dy = b.y - a.y || 0.01;
          const min = a.r + b.r + pad;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5 * strength;
          const aw = b.fx != null ? 2 : 1;
          const bw = a.fx != null ? 2 : 1;
          if (a.fx == null) {
            a.x -= (dx / xSquash) * push * aw;
            a.y -= dy * push * aw;
          }
          if (b.fx == null) {
            b.x += (dx / xSquash) * push * bw;
            b.y += dy * push * bw;
          }
        }
      }
    }
  };
  force.initialize = (ns: GNode[]) => {
    nodes = ns;
  };
  return force;
}

// ── Component ─────────────────────────────────────────────────────

export function SystemMap() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("systems");
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showServices, setShowServices] = useState(true);
  const [showTables, setShowTables] = useState(false);
  const [hiddenGroups, setHiddenGroups] = useState<Set<Group>>(new Set());
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const graphRef = useRef<GNode>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fitted = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/system-map")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed (${r.status})`))))
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
    // Deep links: ?view=files&system=adlab
    const q = new URLSearchParams(window.location.search);
    const v = q.get("view") as View | null;
    if (v === "files" && q.get("system")) {
      setView("files");
      setFocus(q.get("system"));
    } else if (v === "all") setView("all");
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (view !== "systems") q.set("view", view);
    if (view === "files" && focus) q.set("system", focus);
    const s = q.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [view, focus]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(200, width), h: Math.max(200, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const sysById = useMemo(() => new Map((data?.systems ?? []).map((s) => [s.id, s])), [data]);
  const svcById = useMemo(() => new Map((data?.services ?? []).map((s) => [s.id, s])), [data]);
  const colorOf = useCallback((sysId: string) => GROUPS[sysById.get(sysId)?.group ?? "infra"].color, [sysById]);

  const layoutKey = view === "files" ? `files.${focus}` : view;

  // ── Build the graph for the current view ────────────────────────
  const graph = useMemo(() => {
    if (!data) return { nodes: [] as GNode[], links: [] as GLink[] };
    const saved = loadLayout(layoutKey);
    const place = (n: GNode) => {
      const p = saved[n.id];
      if (p) {
        n.x = n.fx = p[0];
        n.y = n.fy = p[1];
      }
      return n;
    };
    const visibleSys = (id: string) => !hiddenGroups.has(sysById.get(id)?.group ?? "infra");

    if (view === "systems") {
      const nodes: GNode[] = data.systems
        .filter((s) => visibleSys(s.id))
        .map((s) =>
          place({
            id: `sys:${s.id}`,
            kind: "system",
            ref: s.id,
            label: s.label,
            color: GROUPS[s.group].color,
            r: 7 + Math.sqrt(s.lines) / 9,
            status: s.status,
            // Start near the group's region so the first layout settles fast.
            ...(saved[`sys:${s.id}`] ? {} : { x: GROUP_ANCHOR[s.group][0] + (Math.random() - 0.5) * 120, y: GROUP_ANCHOR[s.group][1] + (Math.random() - 0.5) * 120 }),
          })
        );
      const ids = new Set(nodes.map((n) => n.id));
      const links: GLink[] = data.systemEdges
        .filter((e) => ids.has(`sys:${e.source}`) && ids.has(`sys:${e.target}`))
        .map((e) => ({
          source: `sys:${e.source}`,
          target: `sys:${e.target}`,
          w: e.i + e.a * 2 + e.e * 3,
          type: e.e ? "e" : e.a ? "a" : "i",
          detail: e,
        }));
      const pairs = new Set(links.map((l) => `${l.source}>${l.target}`));
      for (const l of links) l.curve = pairs.has(`${l.target}>${l.source}`) ? 0.18 : 0;
      if (showServices) {
        for (const svc of data.services) {
          const users = data.systems.filter((s) => ids.has(`sys:${s.id}`) && s.services.some(([v]) => v === svc.id));
          if (!users.length) continue;
          nodes.push(place({ id: `svc:${svc.id}`, kind: "service", ref: svc.id, label: svc.label, color: SERVICE_COLOR, r: 5 }));
          for (const s of users) {
            const count = s.services.find(([v]) => v === svc.id)![1];
            links.push({ source: `sys:${s.id}`, target: `svc:${svc.id}`, w: count, type: "svc", curve: 0 });
          }
        }
      }
      return { nodes, links };
    }

    // File-level views
    const inFocus = (i: number) => (view === "all" ? visibleSys(data.files[i].s) : data.files[i].s === focus);
    const keep = new Set<number>();
    data.files.forEach((_, i) => inFocus(i) && keep.add(i));
    const core = new Set(keep);
    if (view === "files") {
      for (const [a, b] of data.edges) {
        if (core.has(a) && !core.has(b)) keep.add(b);
        if (core.has(b) && !core.has(a)) keep.add(a);
      }
    }
    const nodes: GNode[] = [...keep].map((i) => {
      const f = data.files[i];
      const isCore = core.has(i);
      return place({
        id: `f:${i}`,
        kind: "file",
        ref: i,
        label: f.k === "page" || f.k === "route" ? f.u ?? baseName(f.p) : baseName(f.p),
        color: colorOf(f.s),
        r: (view === "all" ? 3 : 2.5) + Math.sqrt(f.n) / (view === "all" ? 9 : 8),
        outside: !isCore,
        fileKind: f.k,
      });
    });
    const links: GLink[] = data.edges
      .filter(([a, b]) => keep.has(a) && keep.has(b) && (core.has(a) || core.has(b)))
      .map(([a, b, t]) => ({ source: `f:${a}`, target: `f:${b}`, type: t, w: 1, curve: 0 }));
    if (view === "files") {
      if (showTables) {
        const tables = new Map<string, number[]>();
        for (const i of core) for (const t of data.files[i].t ?? []) tables.set(t, [...(tables.get(t) ?? []), i]);
        for (const [t, users] of tables) {
          nodes.push(place({ id: `tbl:${t}`, kind: "table", ref: t, label: t, color: TABLE_COLOR, r: 3 + Math.sqrt(users.length) * 1.4 }));
          for (const i of users) links.push({ source: `f:${i}`, target: `tbl:${t}`, type: "tbl", w: 1, curve: 0 });
        }
      }
      if (showServices) {
        const svcs = new Map<string, number[]>();
        for (const i of core) for (const v of data.files[i].v ?? []) svcs.set(v, [...(svcs.get(v) ?? []), i]);
        for (const [v, users] of svcs) {
          nodes.push(place({ id: `svc:${v}`, kind: "service", ref: v, label: svcById.get(v)?.label ?? v, color: SERVICE_COLOR, r: 5 }));
          for (const i of users) links.push({ source: `f:${i}`, target: `svc:${v}`, type: "svc", w: 1, curve: 0 });
        }
      }
    }
    return { nodes, links };
    // layoutVersion: rebuild (dropping pins) after "Reset layout"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, view, focus, showServices, showTables, hiddenGroups, layoutKey, layoutVersion, sysById, svcById, colorOf]);

  // Neighbour lookup for hover highlighting
  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const id = (x: GNode) => (typeof x === "object" ? x.id : x);
    for (const l of graph.links) {
      const a = id(l.source);
      const b = id(l.target);
      if (!m.has(a)) m.set(a, new Set());
      if (!m.has(b)) m.set(b, new Set());
      m.get(a)!.add(b);
      m.get(b)!.add(a);
    }
    return m;
  }, [graph]);

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2 || !data) return null;
    const hits = new Set<string>();
    for (const n of graph.nodes) {
      const extra =
        n.kind === "file"
          ? `${data.files[n.ref].p} ${data.files[n.ref].d ?? ""}`
          : n.kind === "system"
            ? sysById.get(n.ref)?.description ?? ""
            : "";
      if (`${n.label} ${extra}`.toLowerCase().includes(q)) hits.add(n.id);
    }
    return hits;
  }, [search, graph, data, sysById]);

  const selectedNodeId = useMemo(() => {
    if (!selected) return null;
    if (selected.type === "system") return view === "systems" ? `sys:${selected.id}` : null;
    if (selected.type === "service") return `svc:${selected.id}`;
    if (selected.type === "file") return `f:${selected.id}`;
    return `tbl:${selected.id}`;
  }, [selected, view]);

  // Forces per view
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg || !ready) return;
    const charge = view === "systems" ? -180 : view === "files" ? -45 : -16;
    const dist = view === "systems" ? 160 : view === "files" ? 42 : 20;
    fg.d3Force("charge")?.strength(charge);
    fg.d3Force("link")
      ?.distance((l: GLink) => (l.type === "svc" || l.type === "tbl" ? dist * 1.3 : dist))
      // Systems are all loosely connected to each other, so links only
      // nudge; the group anchors do the arranging.
      .strength(view === "systems" ? (l: GLink) => (l.type === "svc" ? 0.02 : 0.004) : view === "all"
          ? 0.03
          : (l: GLink) => (l.type === "svc" || l.type === "tbl" || l.source?.outside || l.target?.outside ? 0.03 : 0.4));
    if (view === "systems") {
      // Outside services sit just beyond the systems that call them:
      // the average of their users' regions, pushed outward.
      const svcAnchor = new Map<string, [number, number]>();
      const acc = new Map<string, [number, number, number]>();
      for (const l of graph.links) {
        if (l.type !== "svc") continue;
        const sysId = (typeof l.source === "object" ? l.source.id : l.source).slice(4);
        const svcId = typeof l.target === "object" ? l.target.id : l.target;
        const a = GROUP_ANCHOR[sysById.get(sysId)?.group ?? "infra"];
        const cur = acc.get(svcId) ?? [0, 0, 0];
        acc.set(svcId, [cur[0] + a[0] * l.w, cur[1] + a[1] * l.w, cur[2] + l.w]);
      }
      for (const [id, [x, y, w]] of acc) {
        const cx = x / w;
        const cy = y / w;
        const len = Math.hypot(cx, cy) || 1;
        svcAnchor.set(id, [cx + (cx / len) * 260, cy + (cy / len) * 260]);
      }
      const anchor = (n: GNode): [number, number] | null => {
        if (n.kind === "service") return svcAnchor.get(n.id) ?? null;
        return GROUP_ANCHOR[sysById.get(n.ref)?.group ?? "infra"];
      };
      fg.d3Force("anchor", anchorForce(anchor, 0.12));
      fg.d3Force("collide", collideForce(58, 0.9, 0.36));
    } else {
      // Each system gets a spot on a circle (ordered by group so related
      // systems sit side by side). Files view: the focused system's files
      // sit in the middle and neighbours gather on the rim by system.
      // Everything view: every system forms its own cluster.
      const order = [...(data?.systems ?? [])].sort(
        (a, b) => Object.keys(GROUPS).indexOf(a.group) - Object.keys(GROUPS).indexOf(b.group)
      );
      const ring = (id: string, radius: number): [number, number] => {
        const i = Math.max(0, order.findIndex((x) => x.id === id));
        const t = (i / Math.max(1, order.length)) * Math.PI * 2;
        return [Math.cos(t) * radius, Math.sin(t) * radius];
      };
      const svcIds = (data?.services ?? []).map((x) => x.id);
      const svcRing = (id: string, radius: number): [number, number] => {
        const t = (Math.max(0, svcIds.indexOf(id)) / Math.max(1, svcIds.length)) * Math.PI * 2 + 0.2;
        return [Math.cos(t) * radius, Math.sin(t) * radius];
      };
      const fileSys = (n: GNode) => data!.files[n.ref].s;
      if (view === "files") {
        fg.d3Force(
          "anchor",
          anchorForce((n: GNode) => {
            if (n.kind === "service") return svcRing(n.ref, 520);
            if (n.kind === "table") return null;
            return n.outside ? ring(fileSys(n), 420) : [0, 0];
          }, 0.1)
        );
        fg.d3Force("collide", collideForce(3, 0.6));
      } else {
        fg.d3Force("anchor", anchorForce((n: GNode) => ring(fileSys(n), 900), 0.08));
        fg.d3Force("collide", null);
      }
    }
    fg.d3ReheatSimulation();
  }, [graph, view, ready, sysById, data]);

  const onEngineStop = useCallback(() => {
        if (!fitted.current.has(layoutKey)) {
      fitted.current.add(layoutKey);
      // Systems view fits the systems themselves; outside services may
      // sit just past the edge.
      graphRef.current?.zoomToFit(500, 90, view === "systems" ? (n: GNode) => n.kind === "system" : undefined);
    }
  }, [layoutKey, view]);

  // ── Drawing ─────────────────────────────────────────────────────
  const activeSet = useMemo(() => {
    const focusId = hoverId ?? selectedNodeId;
    if (!focusId) return null;
    const s = new Set(neighbours.get(focusId) ?? []);
    s.add(focusId);
    return s;
  }, [hoverId, selectedNodeId, neighbours]);

  const drawNode = useCallback(
    (node: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const dimmedByHover = activeSet && !activeSet.has(node.id);
      const dimmedBySearch = searchHits && !searchHits.has(node.id);
      const alpha = dimmedBySearch ? 0.08 : dimmedByHover ? 0.14 : node.outside ? 0.5 : 1;
      ctx.globalAlpha = alpha;
      const r = node.r;

      ctx.beginPath();
      if (node.kind === "table") {
        ctx.rect(node.x - r, node.y - r, r * 2, r * 2);
      } else if (node.kind === "service") {
        ctx.moveTo(node.x, node.y - r * 1.2);
        ctx.lineTo(node.x + r * 1.2, node.y);
        ctx.lineTo(node.x, node.y + r * 1.2);
        ctx.lineTo(node.x - r * 1.2, node.y);
        ctx.closePath();
      } else {
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      }
      ctx.fillStyle = node.color;
      if (node.kind === "system") {
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 14;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      if (node.status === "partial" || node.status === "retired") {
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 3, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (node.id === selectedNodeId || (searchHits?.has(node.id) ?? false)) {
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 5 / scale + 1, 0, 2 * Math.PI);
        ctx.stroke();
      }

      const showLabel =
        node.kind === "system" ||
        node.kind === "service" ||
        node.id === hoverId ||
        node.id === selectedNodeId ||
        (searchHits?.has(node.id) ?? false) ||
        (activeSet?.has(node.id) && view !== "all") ||
        (view === "files" && (scale > 1.2 || node.kind === "table")) ||
        (view === "all" && scale > 3.2);
      if (showLabel) {
        const size = node.kind === "system" ? 13 : 11;
        const px = view === "systems" ? Math.max(size * 1.5, size / scale) : size / scale;
        ctx.font = `${node.kind === "system" ? 600 : 500} ${px}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const y = node.y + r + 4 / scale + (node.kind === "service" ? r * 0.2 : 0);
        ctx.lineWidth = 3 / scale;
        ctx.strokeStyle = "rgba(14,17,26,0.9)";
        ctx.strokeText(node.label, node.x, y);
        ctx.fillStyle = node.kind === "service" || node.kind === "table" ? "#C9CED8" : "#F3F5F8";
        ctx.fillText(node.label, node.x, y);
      }
      ctx.globalAlpha = 1;
    },
    [activeSet, searchHits, selectedNodeId, hoverId, view]
  );

  const paintPointer = useCallback((node: GNode, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.r + 3, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  const linkTouchesActive = useCallback(
    (l: GLink) => {
      const focusId = hoverId ?? selectedNodeId;
      if (!focusId) return false;
      return l.source?.id === focusId || l.target?.id === focusId;
    },
    [hoverId, selectedNodeId]
  );

  const linkColor = useCallback(
    (l: GLink) => {
      const base = l.type === "svc" ? "201,206,216" : l.type === "tbl" ? "125,135,153" : EDGE_COLOR[l.type as EdgeType] ?? EDGE_COLOR.i;
      const focused = hoverId ?? selectedNodeId;
      let a: number;
      if (focused) a = linkTouchesActive(l) ? 0.85 : 0.04;
      else if (view === "systems") a = l.type === "svc" ? 0.12 : Math.min(0.4, 0.05 + Math.log2(1 + l.w) * 0.045);
      else a = view === "all" ? 0.05 : 0.3;
      if (searchHits) a = Math.min(a, 0.08);
      return `rgba(${base},${a})`;
    },
    [hoverId, selectedNodeId, linkTouchesActive, view, searchHits]
  );

  const linkWidth = useCallback(
    (l: GLink) => {
      if (view !== "systems") return linkTouchesActive(l) ? 1.4 : 0.6;
      return 0.5 + Math.log2(1 + l.w) * (linkTouchesActive(l) ? 0.75 : 0.5);
    },
    [view, linkTouchesActive]
  );

  // ── Interaction ─────────────────────────────────────────────────
  const onNodeClick = useCallback(
    (n: GNode) => {
      if (n.kind === "system") setSelected({ type: "system", id: n.ref });
      else if (n.kind === "service") setSelected({ type: "service", id: n.ref });
      else if (n.kind === "table") setSelected({ type: "table", id: n.ref });
      else setSelected({ type: "file", id: n.ref });
    },
    []
  );

  const onNodeDragEnd = useCallback(
    (n: GNode) => {
      n.fx = n.x;
      n.fy = n.y;
      saveLayout(layoutKey, graph.nodes);
    },
    [layoutKey, graph]
  );

  const openSystemFiles = useCallback((id: string, fileIdx?: number) => {
    setView("files");
    setFocus(id);
    setHoverId(null);
    setSelected(fileIdx != null ? { type: "file", id: fileIdx } : { type: "system", id });
  }, []);

  const resetLayout = useCallback(() => {
    clearLayout(layoutKey);
    for (const n of graph.nodes) {
      n.fx = undefined;
      n.fy = undefined;
    }
    fitted.current.delete(layoutKey);
    setLayoutVersion((v) => v + 1);
  }, [layoutKey, graph]);

  const centerOnSearch = useCallback(() => {
    if (!searchHits?.size) return;
    const n = graph.nodes.find((x: GNode) => searchHits.has(x.id));
    if (n && n.x != null) {
      graphRef.current?.centerAt(n.x, n.y, 600);
      graphRef.current?.zoom(view === "systems" ? 1.6 : 3, 600);
      onNodeClick(n);
    }
  }, [searchHits, graph, view, onNodeClick]);

  // ── Render ──────────────────────────────────────────────────────
  if (error) {
    return <div className="p-8 text-sm text-acuity-bad">Couldn&apos;t load the map: {error}</div>;
  }
  if (!data) {
    return <div className="p-8 text-sm text-acuity-text-sec">Loading the map…</div>;
  }

  const focusSys = focus ? sysById.get(focus) : null;
  const totalLines = data.systems.reduce((n, s) => n + s.lines, 0);

  return (
    <div className="flex h-[calc(100dvh-68px)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-acuity-line px-4 py-3 sm:px-6">
        <div className="mr-2 min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="neo-title text-lg font-semibold">System map</h1>
            {view === "files" && focusSys && (
              <span className="truncate text-sm text-acuity-text-sec">
                <button className="hover:text-acuity-text" onClick={() => { setView("systems"); setSelected({ type: "system", id: focusSys.id }); }}>
                  All systems
                </button>
                {" › "}
                <span className="text-acuity-text">{focusSys.label}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-acuity-text-ter">
            Built from the code at {data.commit || "local"} · {new Date(data.generatedAt).toLocaleDateString()} ·{" "}
            {data.systems.length} systems · {fmt(data.files.length)} files · {fmt(totalLines)} lines · {data.jobs.length} background jobs
          </p>
        </div>

        <div className="flex rounded-lg border border-acuity-line p-0.5 text-sm">
          {(
            [
              ["systems", "Systems"],
              ["files", "Files in a system"],
              ["all", "Everything"],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => {
                if (v === "files" && !focus) {
                  const pick = selected?.type === "system" ? selected.id : "content-factory";
                  openSystemFiles(pick);
                  return;
                }
                setView(v);
                setHoverId(null);
              }}
              className={`rounded-md px-3 py-1 transition ${view === v ? "bg-acuity-primary-soft text-acuity-primary" : "text-acuity-text-sec hover:text-acuity-text"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "files" && (
          <select
            value={focus ?? ""}
            onChange={(e) => openSystemFiles(e.target.value)}
            className="rounded-lg border border-acuity-line bg-acuity-bg-inset px-2 py-1 text-sm text-acuity-text"
          >
            {data.systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.files})
              </option>
            ))}
          </select>
        )}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && centerOnSearch()}
          placeholder="Search (Enter to jump)"
          className="w-48 rounded-lg border border-acuity-line bg-acuity-bg-inset px-3 py-1 text-sm text-acuity-text placeholder:text-acuity-text-quiet focus:outline-none focus:ring-1 focus:ring-acuity-primary"
        />
        {searchHits && <span className="text-xs text-acuity-text-ter">{searchHits.size} match{searchHits.size === 1 ? "" : "es"}</span>}

        <div className="ml-auto flex items-center gap-3 text-sm text-acuity-text-sec">
          {view !== "all" && (
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={showServices} onChange={(e) => setShowServices(e.target.checked)} />
              Outside services
            </label>
          )}
          {view === "files" && (
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={showTables} onChange={(e) => setShowTables(e.target.checked)} />
              Database tables
            </label>
          )}
          <button onClick={resetLayout} className="rounded-lg border border-acuity-line px-2.5 py-1 hover:text-acuity-text" title="Forget where you dragged things in this view">
            Reset layout
          </button>
        </div>
      </div>

      {/* Canvas + panel */}
      <div className="relative min-h-0 flex-1">
        <div ref={boxRef} className="absolute inset-0">
          <ForceGraphCanvas
            graphRef={graphRef}
            onReady={() => setReady(true)}
            width={size.w}
            height={size.h}
            graphData={graph}
            backgroundColor="rgba(0,0,0,0)"
            nodeId="id"
            nodeVal={(n: GNode) => n.r}
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={paintPointer}
            nodeLabel={(n: GNode) =>
              n.kind === "file" ? `${shortPath(data.files[n.ref].p)}${data.files[n.ref].d ? `\n${data.files[n.ref].d}` : ""}` : ""
            }
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkCurvature={(l: GLink) => l.curve ?? 0}
            linkDirectionalArrowLength={(l: GLink) => (l.type === "svc" || l.type === "tbl" ? 0 : view === "systems" ? 5 : view === "files" ? 3 : 0)}
            linkDirectionalArrowRelPos={0.92}
            linkDirectionalParticles={(l: GLink) => (linkTouchesActive(l) && l.type !== "tbl" ? (view === "systems" ? 3 : 2) : 0)}
            linkDirectionalParticleWidth={view === "systems" ? 3 : 2}
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalParticleColor={(l: GLink) => `rgb(${l.type === "svc" ? "201,206,216" : EDGE_COLOR[l.type as EdgeType] ?? EDGE_COLOR.i})`}
            onNodeHover={(n: GNode | null) => setHoverId(n?.id ?? null)}
            onNodeClick={onNodeClick}
            onNodeDragEnd={onNodeDragEnd}
            onBackgroundClick={() => setSelected(null)}
            onEngineStop={onEngineStop}
            cooldownTicks={view === "all" ? 250 : 400}
            warmupTicks={view === "all" ? 60 : 0}
            d3VelocityDecay={0.32}
            minZoom={0.05}
            maxZoom={12}
          />
        </div>

        {/* Legend */}
        <div className="neo-glass pointer-events-auto absolute bottom-3 left-3 max-w-[calc(100%-24px)] rounded-xl border border-acuity-line px-3 py-2.5 text-xs text-acuity-text-sec">
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {(Object.keys(GROUPS) as Group[]).map((g) => {
              const off = hiddenGroups.has(g);
              return (
                <button
                  key={g}
                  onClick={() =>
                    setHiddenGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(g)) next.delete(g);
                      else next.add(g);
                      return next;
                    })
                  }
                  className={`flex items-center gap-1.5 ${off ? "opacity-35 line-through" : "hover:text-acuity-text"}`}
                  title={off ? "Show" : "Hide"}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GROUPS[g].color }} />
                  {GROUPS[g].label}
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-acuity-text-ter">
            {view !== "all" && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rotate-45" style={{ background: SERVICE_COLOR }} /> outside service
              </span>
            )}
            {view === "files" && showTables && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2" style={{ background: TABLE_COLOR }} /> database table
              </span>
            )}
            {view === "systems" && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-white" /> partly retired
              </span>
            )}
            {view !== "systems" &&
              (["i", "a", "e"] as EdgeType[]).map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-3" style={{ background: `rgb(${EDGE_COLOR[t]})` }} />
                  {t === "i" ? "uses code" : t === "a" ? "calls API" : "triggers job"}
                </span>
              ))}
            <span>Drag to arrange (remembered on this browser) · hover to trace · click for details</span>
          </div>
        </div>

        {selected && (
          <aside className="neo-glass absolute inset-x-2 bottom-2 max-h-[60%] overflow-y-auto rounded-xl border border-acuity-line p-4 text-sm sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3 sm:max-h-none sm:w-[380px]">
            <button
              onClick={() => setSelected(null)}
              className="float-right -mr-1 -mt-1 rounded px-2 text-lg leading-none text-acuity-text-ter hover:text-acuity-text"
              aria-label="Close"
            >
              ×
            </button>
            {selected.type === "system" && (
              <SystemPanel
                data={data}
                sys={sysById.get(selected.id)!}
                colorOf={colorOf}
                svcLabel={(id) => svcById.get(id)?.label ?? id}
                inFilesView={view === "files" && focus === selected.id}
                onOpenFiles={(fileIdx) => openSystemFiles(selected.id, fileIdx)}
                onSelect={setSelected}
              />
            )}
            {selected.type === "service" && (
              <ServicePanel data={data} id={selected.id} label={svcById.get(selected.id)?.label ?? selected.id} sysById={sysById} colorOf={colorOf} onSelect={setSelected} onOpenFile={(i) => openSystemFiles(data.files[i].s, i)} />
            )}
            {selected.type === "table" && (
              <TablePanel data={data} name={selected.id} sysById={sysById} colorOf={colorOf} onOpenFile={(i) => openSystemFiles(data.files[i].s, i)} />
            )}
            {selected.type === "file" && (
              <FilePanel
                data={data}
                idx={selected.id}
                sysById={sysById}
                colorOf={colorOf}
                svcLabel={(id) => svcById.get(id)?.label ?? id}
                onOpenFile={(i) => (view === "files" && data.files[i].s !== focus ? openSystemFiles(data.files[i].s, i) : setSelected({ type: "file", id: i }))}
                onOpenSystem={(id) => openSystemFiles(id)}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

// ── Panels ────────────────────────────────────────────────────────

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-acuity-text-ter">
        {title}
        {count != null && <span className="ml-1 font-normal normal-case tracking-normal">({count})</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) {
  const cls = "inline-flex items-center gap-1 rounded-md border border-acuity-line bg-acuity-bg-inset px-1.5 py-0.5 text-xs text-acuity-text-sec";
  return onClick ? (
    <button className={`${cls} hover:text-acuity-text`} onClick={onClick} title={title}>
      {children}
    </button>
  ) : (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

function JobRow({ job, data }: { job: Job; data: MapData }) {
  const when = job.crons.length ? job.crons.map(humanCron).join(" · ") : job.events.length ? "when triggered" : "on demand";
  return (
    <li className="flex items-start gap-2 py-1" title={shortPath(data.files[job.file].p)}>
      <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${job.registered ? "bg-acuity-good" : "bg-acuity-text-quiet"}`} />
      <span className="min-w-0">
        <span className="text-acuity-text">{job.label}</span>
        <span className="block text-xs text-acuity-text-ter">
          {when}
          {!job.registered && " · not registered (off)"}
        </span>
      </span>
    </li>
  );
}

function FileRow({ data, idx, colorOf, onClick, showSystem }: { data: MapData; idx: number; colorOf: (s: string) => string; onClick: () => void; showSystem?: boolean }) {
  const f = data.files[idx];
  return (
    <li>
      <button onClick={onClick} className="w-full rounded-md px-1.5 py-1 text-left hover:bg-acuity-bg-inset">
        <span className="flex items-center gap-1.5 text-acuity-text">
          {showSystem && <Dot color={colorOf(f.s)} />}
          <span className="truncate">{f.u ?? baseName(f.p)}</span>
          <span className="ml-auto shrink-0 text-xs text-acuity-text-quiet">{fmt(f.n)}</span>
        </span>
        {f.d && <span className="line-clamp-2 block text-xs text-acuity-text-ter">{f.d}</span>}
      </button>
    </li>
  );
}

function SystemPanel({
  data,
  sys,
  colorOf,
  svcLabel,
  inFilesView,
  onOpenFiles,
  onSelect,
}: {
  data: MapData;
  sys: Sys;
  colorOf: (s: string) => string;
  svcLabel: (id: string) => string;
  inFilesView: boolean;
  onOpenFiles: (fileIdx?: number) => void;
  onSelect: (s: Selection) => void;
}) {
  const myFiles = data.files.map((f, i) => ({ f, i })).filter(({ f }) => f.s === sys.id);
  const jobs = data.jobs.filter((j) => data.files[j.file].s === sys.id);
  const cron = jobs.filter((j) => j.crons.length);
  const other = jobs.filter((j) => !j.crons.length);
  const pages = myFiles.filter(({ f }) => f.k === "page");
  const routes = myFiles.filter(({ f }) => f.k === "route");
  const screens = myFiles.filter(({ f }) => f.k === "screen");
  const uses = data.systemEdges.filter((e) => e.source === sys.id).sort((a, b) => b.i + b.a + b.e - (a.i + a.a + a.e));
  const usedBy = data.systemEdges.filter((e) => e.target === sys.id).sort((a, b) => b.i + b.a + b.e - (a.i + a.a + a.e));
  const biggest = [...myFiles].sort((a, b) => b.f.n - a.f.n).slice(0, 8);
  const sysLabel = (id: string) => data.systems.find((s) => s.id === id)?.label ?? id;

  const linkSummary = (e: { i: number; a: number; e: number }) =>
    [e.i && `${e.i} code`, e.a && `${e.a} API`, e.e && `${e.e} job trigger${e.e > 1 ? "s" : ""}`].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="flex items-center gap-2 pr-6">
        <Dot color={colorOf(sys.id)} />
        <h2 className="text-base font-semibold text-acuity-text">{sys.label}</h2>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
        <span className={`rounded px-1.5 py-0.5 ${sys.status === "live" ? "bg-acuity-good-soft text-acuity-good" : "bg-acuity-warn-soft text-acuity-warn"}`}>
          {sys.status === "live" ? "Live" : sys.status === "partial" ? "Partly retired" : "Retired"}
        </span>
        <span className="text-acuity-text-ter">{GROUPS[sys.group].label}</span>
      </div>
      <p className="mt-2 text-acuity-text-sec">{sys.description}</p>
      {sys.statusNote && <p className="mt-1.5 text-xs text-acuity-warn">{sys.statusNote}</p>}

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[
          [sys.files, "files"],
          [fmt(sys.lines), "lines"],
          [jobs.length, "jobs"],
          [sys.tables.length, "tables"],
        ].map(([v, l]) => (
          <div key={String(l)} className="rounded-lg bg-acuity-bg-inset py-1.5">
            <div className="font-semibold text-acuity-text">{v}</div>
            <div className="text-[11px] text-acuity-text-ter">{l}</div>
          </div>
        ))}
      </div>
      {!inFilesView && (
        <button onClick={() => onOpenFiles()} className="mt-3 w-full rounded-lg bg-acuity-primary-soft py-1.5 font-medium text-acuity-primary hover:brightness-125">
          Open its {sys.files} files →
        </button>
      )}

      {(uses.length > 0 || usedBy.length > 0) && (
        <Section title="Connections">
          {uses.length > 0 && <div className="mb-1 text-xs text-acuity-text-ter">Relies on</div>}
          <ul>
            {uses.map((e) => (
              <li key={`u${e.target}`}>
                <button onClick={() => onSelect({ type: "system", id: e.target })} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-acuity-bg-inset">
                  <Dot color={colorOf(e.target)} />
                  <span className="text-acuity-text">{sysLabel(e.target)}</span>
                  <span className="ml-auto text-xs text-acuity-text-quiet">{linkSummary(e)}</span>
                </button>
              </li>
            ))}
          </ul>
          {usedBy.length > 0 && <div className="mb-1 mt-2 text-xs text-acuity-text-ter">Relied on by</div>}
          <ul>
            {usedBy.map((e) => (
              <li key={`b${e.source}`}>
                <button onClick={() => onSelect({ type: "system", id: e.source })} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-acuity-bg-inset">
                  <Dot color={colorOf(e.source)} />
                  <span className="text-acuity-text">{sysLabel(e.source)}</span>
                  <span className="ml-auto text-xs text-acuity-text-quiet">{linkSummary(e)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {cron.length > 0 && (
        <Section title="Runs on a schedule" count={cron.length}>
          <ul>{cron.map((j) => <JobRow key={j.name} job={j} data={data} />)}</ul>
        </Section>
      )}
      {other.length > 0 && (
        <Section title="Runs when triggered" count={other.length}>
          <ul>{other.map((j) => <JobRow key={j.name} job={j} data={data} />)}</ul>
        </Section>
      )}

      {sys.services.length > 0 && (
        <Section title="Outside services">
          <div className="flex flex-wrap gap-1">
            {sys.services.map(([id, n]) => (
              <Chip key={id} onClick={() => onSelect({ type: "service", id })} title={`${n} file${n > 1 ? "s" : ""}`}>
                {svcLabel(id)} <span className="text-acuity-text-quiet">{n}</span>
              </Chip>
            ))}
          </div>
        </Section>
      )}
      {sys.tables.length > 0 && (
        <Section title="Database tables" count={sys.tables.length}>
          <div className="flex flex-wrap gap-1">
            {sys.tables.map(([t, n]) => (
              <Chip key={t} onClick={() => onSelect({ type: "table", id: t })} title={`${n} file${n > 1 ? "s" : ""}`}>
                {t}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {pages.length > 0 && (
        <Section title="Web pages" count={pages.length}>
          <div className="flex flex-wrap gap-1">
            {pages.slice(0, 40).map(({ f, i }) =>
              f.u && !f.u.includes("[") && !f.u.startsWith("/admin") ? (
                <a key={i} href={f.u} target="_blank" rel="noreferrer" className="rounded-md border border-acuity-line bg-acuity-bg-inset px-1.5 py-0.5 text-xs text-acuity-secondary hover:underline">
                  {f.u}
                </a>
              ) : (
                <Chip key={i}>{f.u}</Chip>
              )
            )}
          </div>
        </Section>
      )}
      {screens.length > 0 && (
        <Section title="App screens" count={screens.length}>
          <div className="flex flex-wrap gap-1">
            {screens.slice(0, 40).map(({ f, i }) => (
              <Chip key={i} onClick={() => onOpenFiles(i)}>
                {f.p.replace(/^apps\/mobile\/app\//, "").replace(/\.tsx$/, "")}
              </Chip>
            ))}
          </div>
        </Section>
      )}
      {routes.length > 0 && (
        <Section title="API routes" count={routes.length}>
          <details>
            <summary className="cursor-pointer text-xs text-acuity-text-ter hover:text-acuity-text">Show all</summary>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-acuity-text-sec">
              {routes.map(({ f, i }) => (
                <li key={i}>{f.u}</li>
              ))}
            </ul>
          </details>
        </Section>
      )}

      <Section title="Biggest files">
        <ul>
          {biggest.map(({ i }) => (
            <FileRow key={i} data={data} idx={i} colorOf={colorOf} onClick={() => onOpenFiles(i)} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function ServicePanel({
  data,
  id,
  label,
  sysById,
  colorOf,
  onSelect,
  onOpenFile,
}: {
  data: MapData;
  id: string;
  label: string;
  sysById: Map<string, Sys>;
  colorOf: (s: string) => string;
  onSelect: (s: Selection) => void;
  onOpenFile: (i: number) => void;
}) {
  const users = data.files.map((f, i) => ({ f, i })).filter(({ f }) => f.v?.includes(id));
  const bySys = new Map<string, number>();
  for (const { f } of users) bySys.set(f.s, (bySys.get(f.s) ?? 0) + 1);
  return (
    <div>
      <div className="flex items-center gap-2 pr-6">
        <span className="inline-block h-2.5 w-2.5 rotate-45" style={{ background: SERVICE_COLOR }} />
        <h2 className="text-base font-semibold text-acuity-text">{label}</h2>
      </div>
      <p className="mt-1 text-xs text-acuity-text-ter">Outside service · called from {users.length} files</p>
      <Section title="Used by">
        <ul>
          {[...bySys].sort((a, b) => b[1] - a[1]).map(([s, n]) => (
            <li key={s}>
              <button onClick={() => onSelect({ type: "system", id: s })} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-acuity-bg-inset">
                <Dot color={colorOf(s)} />
                <span className="text-acuity-text">{sysById.get(s)?.label ?? s}</span>
                <span className="ml-auto text-xs text-acuity-text-quiet">{n} files</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Files">
        <ul>
          {users.slice(0, 60).map(({ i }) => (
            <FileRow key={i} data={data} idx={i} colorOf={colorOf} showSystem onClick={() => onOpenFile(i)} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function TablePanel({
  data,
  name,
  sysById,
  colorOf,
  onOpenFile,
}: {
  data: MapData;
  name: string;
  sysById: Map<string, Sys>;
  colorOf: (s: string) => string;
  onOpenFile: (i: number) => void;
}) {
  const users = data.files.map((f, i) => ({ f, i })).filter(({ f }) => f.t?.includes(name));
  const bySys = new Map<string, number>();
  for (const { f } of users) bySys.set(f.s, (bySys.get(f.s) ?? 0) + 1);
  return (
    <div>
      <div className="flex items-center gap-2 pr-6">
        <span className="inline-block h-2.5 w-2.5" style={{ background: TABLE_COLOR }} />
        <h2 className="text-base font-semibold text-acuity-text">{name}</h2>
      </div>
      <p className="mt-1 text-xs text-acuity-text-ter">Database table · read or written by {users.length} files</p>
      <Section title="Systems that touch it">
        <div className="flex flex-wrap gap-1">
          {[...bySys].sort((a, b) => b[1] - a[1]).map(([s, n]) => (
            <Chip key={s}>
              <Dot color={colorOf(s)} /> {sysById.get(s)?.label ?? s} <span className="text-acuity-text-quiet">{n}</span>
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Files">
        <ul>
          {users.slice(0, 80).map(({ i }) => (
            <FileRow key={i} data={data} idx={i} colorOf={colorOf} showSystem onClick={() => onOpenFile(i)} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function FilePanel({
  data,
  idx,
  sysById,
  colorOf,
  svcLabel,
  onOpenFile,
  onOpenSystem,
}: {
  data: MapData;
  idx: number;
  sysById: Map<string, Sys>;
  colorOf: (s: string) => string;
  svcLabel: (id: string) => string;
  onOpenFile: (i: number) => void;
  onOpenSystem: (id: string) => void;
}) {
  const f = data.files[idx];
  const jobs = data.jobs.filter((j) => j.file === idx);
  const out = data.edges.filter(([a]) => a === idx);
  const inc = data.edges.filter(([, b]) => b === idx);
  const sys = sysById.get(f.s);

  const groupEdges = (list: [number, number, EdgeType][], pick: (e: [number, number, EdgeType]) => number) => {
    const byType = new Map<EdgeType, number[]>();
    for (const e of list) byType.set(e[2], [...(byType.get(e[2]) ?? []), pick(e)]);
    return byType;
  };
  const outBy = groupEdges(out, (e) => e[1]);
  const incBy = groupEdges(inc, (e) => e[0]);

  return (
    <div>
      <div className="flex items-center gap-2 pr-6">
        <Dot color={colorOf(f.s)} />
        <h2 className="break-all text-base font-semibold text-acuity-text">{f.u ?? baseName(f.p)}</h2>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-acuity-text-ter">
        <span>{KIND_LABEL[f.k]}</span>·<span>{f.n} lines</span>·
        <button onClick={() => onOpenSystem(f.s)} className="text-acuity-text-sec hover:text-acuity-text">
          {sys?.label}
        </button>
      </div>
      <div className="mt-2 break-all font-mono text-[11px] text-acuity-text-ter">{f.p}</div>
      {f.d && <p className="mt-2 text-acuity-text-sec">{f.d}</p>}
      <a href={GITHUB + f.p} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-acuity-secondary hover:underline">
        Open on GitHub ↗
      </a>

      {jobs.length > 0 && (
        <Section title="Background jobs defined here">
          <ul>{jobs.map((j) => <JobRow key={j.name} job={j} data={data} />)}</ul>
        </Section>
      )}
      {f.v && (
        <Section title="Outside services">
          <div className="flex flex-wrap gap-1">{f.v.map((v) => <Chip key={v}>{svcLabel(v)}</Chip>)}</div>
        </Section>
      )}
      {f.t && (
        <Section title="Database tables">
          <div className="flex flex-wrap gap-1">{f.t.map((t) => <Chip key={t}>{t}</Chip>)}</div>
        </Section>
      )}
      {[...outBy].map(([t, list]) => (
        <Section key={`o${t}`} title={`This file ${EDGE_LABEL[t]}`} count={list.length}>
          <ul>{list.slice(0, 40).map((i) => <FileRow key={i} data={data} idx={i} colorOf={colorOf} showSystem onClick={() => onOpenFile(i)} />)}</ul>
        </Section>
      ))}
      {[...incBy].map(([t, list]) => (
        <Section key={`i${t}`} title={t === "i" ? "Used by" : t === "a" ? "Called by" : "Kicked off by"} count={list.length}>
          <ul>{list.slice(0, 40).map((i) => <FileRow key={i} data={data} idx={i} colorOf={colorOf} showSystem onClick={() => onOpenFile(i)} />)}</ul>
        </Section>
      ))}
    </div>
  );
}
