/**
 * Structural diff of two n8n workflow JSONs (standard S8). Pure, local: the
 * n8n 2.46.1 public API has no version-diff endpoint.
 *
 * Nodes are matched by name. A changed node lists the top-level keys that
 * differ, with `parameters.<key>` granularity; a position-only change goes to
 * nodesMoved so callers can ignore layout. Edges are
 * "src -[type:outputIndex]-> dst" (dst gets "[n]" when it enters input n > 0).
 * name/settings are compared only when BOTH sides are workflows (a payload or
 * the live flow), never when either is a history version (GET /versions/{id}):
 * a version has no settings and its `name` is the version label, not the
 * workflow name. A side is a version when the caller says so (opts) or when it
 * carries `workflowId` (versions do, workflows do not).
 *
 * Never throws: a side that is not a JSON object (null, an array, a string
 * that does not parse) returns { ok: false, error }.
 */
type Obj = Record<string, unknown>;

export interface WorkflowDiff {
  ok: true;
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesChanged: Array<{ name: string; fields: string[] }>;
  nodesMoved: string[];
  edgesAdded: string[];
  edgesRemoved: string[];
  settingsChanged: string[];
  nameChanged: { from: string; to: string } | null;
}

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** JSON with sorted object keys, so key order never reads as a change. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (isObj(v)) {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "undefined";
}

function nodeMap(wf: Obj): Map<string, Obj> {
  const out = new Map<string, Obj>();
  if (!Array.isArray(wf.nodes)) return out;
  for (const n of wf.nodes) {
    if (isObj(n) && typeof n.name === "string") out.set(n.name, n);
  }
  return out;
}

function edgeSet(wf: Obj): Set<string> {
  const out = new Set<string>();
  if (!isObj(wf.connections)) return out;
  for (const [src, groups] of Object.entries(wf.connections)) {
    if (!isObj(groups)) continue;
    for (const [type, ports] of Object.entries(groups)) {
      if (!Array.isArray(ports)) continue;
      ports.forEach((port, i) => {
        if (!Array.isArray(port)) return;
        for (const c of port) {
          if (!isObj(c) || typeof c.node !== "string") continue;
          const into = typeof c.index === "number" && c.index > 0 ? `[${c.index}]` : "";
          out.add(`${src} -[${type}:${i}]-> ${c.node}${into}`);
        }
      });
    }
  }
  return out;
}

function changedKeys(a: Obj, b: Obj, prefix = ""): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => canon(a[k]) !== canon(b[k])).map((k) => prefix + k).sort();
}

export interface WorkflowDiffError {
  ok: false;
  error: string;
}

/** A JSON string is parsed; anything that is not then an object is an error. */
function asWorkflow(v: unknown, label: string): { wf?: Obj; error?: string } {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch (e) {
      return { error: `${label}: PARSE ERROR: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  if (!isObj(x)) {
    return { error: `${label}: not a JSON object (got ${x === null ? "null" : Array.isArray(x) ? "array" : typeof x})` };
  }
  return { wf: x };
}

export interface DiffOptions {
  baseIsVersion?: boolean;
  targetIsVersion?: boolean;
}

function looksLikeVersion(wf: Obj): boolean {
  return typeof wf.workflowId === "string";
}

export function diffWorkflows(
  baseInput: unknown,
  targetInput: unknown,
  opts: DiffOptions = {},
): WorkflowDiff | WorkflowDiffError {
  const b0 = asWorkflow(baseInput, "base");
  const t0 = asWorkflow(targetInput, "target");
  if (!b0.wf || !t0.wf) {
    return { ok: false, error: [b0.error, t0.error].filter(Boolean).join("; ") };
  }
  const base = b0.wf;
  const target = t0.wf;
  const from = nodeMap(base);
  const to = nodeMap(target);
  const nodesChanged: WorkflowDiff["nodesChanged"] = [];
  const nodesMoved: string[] = [];
  for (const [name, b] of from) {
    const t = to.get(name);
    if (!t) continue;
    const fields: string[] = [];
    for (const k of changedKeys(b, t)) {
      if (k === "position") nodesMoved.push(name);
      else if (k === "parameters" && isObj(b.parameters) && isObj(t.parameters)) {
        fields.push(...changedKeys(b.parameters, t.parameters, "parameters."));
      } else fields.push(k);
    }
    if (fields.length) nodesChanged.push({ name, fields });
  }

  const ea = edgeSet(base);
  const eb = edgeSet(target);
  const bothWorkflows =
    !opts.baseIsVersion && !opts.targetIsVersion && !looksLikeVersion(base) && !looksLikeVersion(target);
  const bothSettings = bothWorkflows && isObj(base.settings) && isObj(target.settings);
  const bothNames = bothWorkflows && typeof base.name === "string" && typeof target.name === "string";

  return {
    ok: true,
    nodesAdded: [...to.keys()].filter((n) => !from.has(n)),
    nodesRemoved: [...from.keys()].filter((n) => !to.has(n)),
    nodesChanged,
    nodesMoved,
    edgesAdded: [...eb].filter((e) => !ea.has(e)),
    edgesRemoved: [...ea].filter((e) => !eb.has(e)),
    settingsChanged: bothSettings
      ? changedKeys(base.settings as Obj, target.settings as Obj)
      : [],
    nameChanged:
      bothNames && base.name !== target.name
        ? { from: base.name as string, to: target.name as string }
        : null,
  };
}
