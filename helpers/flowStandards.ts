/**
 * Flow standards S1–S7 + S9 (S8 is the `diff` operation).
 *
 * Pure: no API call, never throws. A bad payload (unparseable JSON, not an
 * object) is reported as an S7 violation so a caller can branch on it.
 *
 * Calibrated against a production n8n instance: the flows are
 * `<type>.<LIST>`, carry two triggers (Webhook + Execute Workflow),
 * have no error workflow, and READY runs one agent.
 */
import { validateWorkflowPayload } from "./validateWorkflow";

export type FlowKind =
  | "card"
  | "kata"
  | "cap"
  | "sub"
  | "err"
  | "trigger"
  | "mcp"
  | "other";

export type StandardId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S9";

export interface StandardResult {
  applies: boolean;
  ok: boolean;
  violations: string[];
}

export interface FlowStandardsResult {
  ok: boolean;
  kind: FlowKind;
  standards: Record<StandardId, StandardResult>;
  /** Every violation, formatted "S5 :: <node> :: <why>". */
  violations: string[];
}

export interface FlowStandardsOptions {
  /**
   * S4: agents may not raise maxIterations above this flow's same-named agent.
   * A baseline that is given but unparseable, nodeless, or of another flow
   * (different name) is an S4 violation (fail closed).
   */
  baseline?: unknown;
}

type Obj = Record<string, unknown>;
type Node = Obj & { name: string; type: string; parameters?: Obj };

export const CARD_ROLES = ["readying", "doing", "inspecting", "releasing"] as const;
const READY_ROLE = "readying" as const;

const AGENT_TYPE = "@n8n/n8n-nodes-langchain.agent";
const MODEL_TYPE = "@n8n/n8n-nodes-langchain.lmChatOpenAi";
const PARSER_TYPE = "@n8n/n8n-nodes-langchain.outputParserStructured";
const TRIGGER_TYPE = "n8n-nodes-base.executeWorkflowTrigger";
const LOCAL_MODEL = "local-llm";

const BANNED_TYPES = [
  "n8n-nodes-base.httpRequest",
  "@n8n/n8n-nodes-langchain.toolHttpRequest",
];
/**
 * Module scopes. The estate registry serves `@nonagentic/*`; the public npm
 * builds are `@nonagenticai/*` (the only organisation we own on npmjs). A tool
 * node carries whichever scope its package was installed from, so both count —
 * a flow linted on a public install must not look like it uses a foreign tool.
 */
const MODULE_SCOPES = ["@nonagentic/", "@nonagenticai/"] as const;
/** Module types whose every call must carry a project (house rule). */
const PROJECT_SCOPED_TYPE_PREFIXES = MODULE_SCOPES.flatMap((s) => [
  `${s}n8n-nodes-coding.`,
  `${s}n8n-nodes-artifacts.`,
]);
const BANNED_STRINGS: Array<[RegExp, string]> = [
  [/\$env\b/, "uses $env"],
  [/svc\.cluster\.local/, "addresses cluster DNS (svc.cluster.local)"],
  // Bare hosts too ("service.internal" in a Code node), not only http(s) URLs.
  // Calibrated against a live instance; the lookbehind keeps expressions such as
  // $json.internal out.
  [/(?<![$\w.])[a-z0-9-]+(\.[a-z0-9-]+)*\.internal\b/i, "addresses an *.internal host"],
];

const NAME_PATTERNS: Record<Exclude<FlowKind, "other">, RegExp> = {
  // Card flows have no prefix: <card_type>.<LIST>.
  card: /^[a-z0-9_]+\.(READY|DOING|QA|DONE)$/,
  // A sandbox copy: kata.<kata_id>.<original flow name> (the flow may have dots).
  kata: /^kata\.[a-z0-9_]+\..+$/,
  cap: /^cap\.[a-z0-9_]+\.[a-z0-9_]+$/,
  sub: /^sub\.[a-z0-9_]+$/,
  err: /^err\.[a-z0-9_]+$/,
  trigger: /^trigger\.[a-z0-9_]+$/,
  mcp: /^mcp\.[a-z0-9_.]+$/,
};

/** S5: what may feed an agent's ai_tool input — module tools and sub-flow tools. */
const TOOL_WORKFLOW_TYPE = "@n8n/n8n-nodes-langchain.toolWorkflow";
function isAllowedToolType(type: string | undefined): boolean {
  if (!type) return false;
  if (type === TOOL_WORKFLOW_TYPE) return true;
  return MODULE_SCOPES.some((s) => type.startsWith(`${s}n8n-nodes-`)) && type.endsWith("Tool");
}

export function flowKind(name: unknown): FlowKind {
  if (typeof name !== "string") return "other";
  // The rebuilt card name has no prefix, so the full shape decides first.
  if (NAME_PATTERNS.card.test(name)) return "card";
  if (NAME_PATTERNS.kata.test(name)) return "kata";
  const prefix = name.split(".")[0];
  // Own keys only: "constructor", "__proto__", "toString" are not prefixes
  // (Object.hasOwn is ES2022; lib here is ES2019).
  return Object.prototype.hasOwnProperty.call(NAME_PATTERNS, prefix)
    ? (prefix as FlowKind)
    : "other";
}

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function emptyResults(): Record<StandardId, StandardResult> {
  const out = {} as Record<StandardId, StandardResult>;
  for (const id of ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S9"] as StandardId[]) {
    out[id] = { applies: true, ok: true, violations: [] };
  }
  return out;
}

function parse(input: unknown): { wf?: Obj; error?: string } {
  let v = input;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch (e) {
      return { error: `PARSE ERROR: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  if (!isObj(v)) return { error: "workflow payload is not a JSON object" };
  return { wf: v };
}

interface Edge {
  src: string;
  dst: string;
  type: string;
}

function edgesOf(wf: Obj): Edge[] {
  const out: Edge[] = [];
  if (!isObj(wf.connections)) return out;
  for (const [src, groups] of Object.entries(wf.connections)) {
    if (!isObj(groups)) continue;
    for (const [type, ports] of Object.entries(groups)) {
      if (!Array.isArray(ports)) continue;
      for (const port of ports) {
        if (!Array.isArray(port)) continue;
        for (const c of port) {
          if (isObj(c) && typeof c.node === "string") {
            out.push({ src, dst: c.node, type });
          }
        }
      }
    }
  }
  return out;
}

function nodesOf(wf: Obj): Node[] {
  if (!Array.isArray(wf.nodes)) return [];
  return wf.nodes.filter(
    (n): n is Node => isObj(n) && typeof n.name === "string" && typeof n.type === "string",
  );
}

/** Role of an agent node: the word after "Agent", e.g. "Agent doing judge" → "doing". */
function agentRole(name: string): string | null {
  const m = /^Agent ([a-z_]+)(?: .+)?$/.exec(name);
  return m ? m[1] : null;
}

function modelName(model: unknown): unknown {
  return isObj(model) ? model.value : model;
}

function isFilled(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (isObj(v)) return "value" in v ? isFilled(v.value) : Object.keys(v).length > 0;
  return true;
}

function maxIterations(n: Node): unknown {
  const opts = n.parameters?.options;
  return isObj(opts) ? opts.maxIterations : undefined;
}

function walkStrings(v: unknown, visit: (s: string) => void): void {
  if (typeof v === "string") visit(v);
  else if (Array.isArray(v)) v.forEach((x) => walkStrings(x, visit));
  else if (isObj(v)) Object.values(v).forEach((x) => walkStrings(x, visit));
}

export function lintFlowStandards(
  input: unknown,
  opts: FlowStandardsOptions = {},
): FlowStandardsResult {
  const standards = emptyResults();
  const add = (id: StandardId, node: string, why: string) => {
    standards[id].violations.push(`${id} :: ${node} :: ${why}`);
  };
  const finish = (kind: FlowKind): FlowStandardsResult => {
    const violations: string[] = [];
    for (const r of Object.values(standards)) {
      r.ok = r.violations.length === 0;
      violations.push(...r.violations);
    }
    return { ok: violations.length === 0, kind, standards, violations };
  };

  const { wf, error } = parse(input);
  if (!wf) {
    for (const id of Object.keys(standards) as StandardId[]) {
      if (id !== "S7") standards[id].applies = false;
    }
    add("S7", "(workflow)", error as string);
    return finish("other");
  }

  const name = typeof wf.name === "string" ? wf.name : "";
  const kind = flowKind(name);
  standards.S1.applies = kind === "card";
  standards.S4.applies = kind === "card";
  standards.S9.applies = kind === "card";

  const nodes = nodesOf(wf);
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const edges = edgesOf(wf);
  const agents = nodes.filter((n) => n.type === AGENT_TYPE);
  const inputs = (dst: string, type: string) =>
    edges.filter((e) => e.dst === dst && e.type === type);

  // S1 — card shape: the two triggers reach the role chain, and every phase
  // ends in its own computed move. READY is one agent; DOING/QA/DONE
  // run readying -> doing -> inspecting -> releasing.
  if (kind === "card") {
    const webhooks = nodes.filter(
      (n) =>
        n.type === "n8n-nodes-base.webhook" &&
        isObj(n.parameters) &&
        n.parameters.path === name,
    );
    const starts = nodes.filter((n) => n.type === TRIGGER_TYPE);
    if (webhooks.length !== 1) {
      add("S1", "(workflow)", `needs exactly one Webhook whose path is "${name}" (found ${webhooks.length})`);
    }
    if (starts.length !== 1) {
      add("S1", "(workflow)", `needs exactly one ${TRIGGER_TYPE} (found ${starts.length})`);
    }
    // Reachability from both triggers, not depth: the flows fan the two
    // triggers into Flow object, then the chain. A shortcut may skip roles.
    const reach = (from: string[]): Set<string> => {
      const seen = new Set<string>();
      const queue = [...from];
      while (queue.length) {
        const cur = queue.shift() as string;
        for (const e of edges) {
          if (e.src === cur && e.type === "main" && !seen.has(e.dst)) {
            seen.add(e.dst);
            queue.push(e.dst);
          }
        }
      }
      return seen;
    };
    const list = name.split(".").pop();
    const roles = list === "READY" ? [READY_ROLE] : CARD_ROLES;
    let prev: { label: string; names: string[] } = {
      label: "the triggers",
      names: [...webhooks, ...starts].map((n) => n.name),
    };
    for (const role of roles) {
      const ofRole = agents.filter((a) => agentRole(a.name) === role).map((a) => a.name);
      if (ofRole.length === 0) {
        add("S1", "(workflow)", `no agent for role "${role}"`);
        continue;
      }
      const reached = reach(prev.names);
      if (!ofRole.some((n) => reached.has(n))) {
        add("S1", ofRole[0], `not reached on main connections from ${prev.label}`);
      }
      prev = { label: `Agent ${role}`, names: ofRole };
    }
    if (list === "READY" && agents.length !== 1) {
      add("S1", "(workflow)", `READY carries one agent; found ${agents.length}`);
    }
    const lastRole = roles[roles.length - 1];
    const lastAgents = agents.filter((a) => agentRole(a.name) === lastRole);
    const movesOn = lastAgents.some((a) =>
      edges.some(
        (e) => e.src === a.name && e.type === "main" && byName.get(e.dst)?.type !== AGENT_TYPE,
      ),
    );
    if (lastAgents.length > 0 && !movesOn) {
      add("S1", `Agent ${lastRole}`, "is not followed on main by a non-agent node (the computed move)");
    }
    for (const n of nodes) {
      if (!/^Move to BLOCKED \(/.test(n.name)) continue;
      const inbound = edges.filter((e) => e.dst === n.name && e.type === "main").length;
      if (inbound !== 1) {
        add("S1", n.name, `${inbound} inbound main edges; each phase's block move has exactly one`);
      }
    }
  }

  // S2 — naming. Tools are the module's own names (`cd.*`, `kb.*`, `art.*`);
  // only the agent keeps its role prefix.
  if (kind === "other") {
    add("S2", "(workflow)", `name "${name}" has no known prefix (card/cap/kata/sub/err/trigger/mcp)`);
  } else if (!NAME_PATTERNS[kind].test(name)) {
    add("S2", "(workflow)", `name "${name}" does not match ${NAME_PATTERNS[kind]}`);
  }
  for (const a of agents) {
    const role = agentRole(a.name);
    if (!role || (kind === "card" && !(CARD_ROLES as readonly string[]).includes(role))) {
      add("S2", a.name, kind === "card"
        ? `agent name must start with "Agent <${CARD_ROLES.join("|")}>"`
        : 'agent name must start with "Agent <role>"');
    }
  }

  // S3 — no error workflow. The rebuilt instance has no err.* flows and the
  // live settings carry none; a flow that names one is the violation.
  if (kind === "err") {
    standards.S3.applies = false;
  } else {
    const ew = isObj(wf.settings) ? wf.settings.errorWorkflow : undefined;
    if (isFilled(ew)) {
      add("S3", "(workflow)", `settings.errorWorkflow is ${JSON.stringify(ew)}; this instance has no error workflow`);
    }
  }

  // S4 — agent contract (card only).
  if (kind === "card") {
    let baseline: Obj | undefined;
    if (opts.baseline !== undefined) {
      const parsed = parse(opts.baseline);
      baseline = parsed.wf;
      if (!baseline) {
        add("S4", "(baseline)", parsed.error as string);
      } else if (!sameFlow(baseline, wf, name) || nodesOf(baseline).length === 0) {
        // {} or another flow would make the maxIterations check vacuous.
        add("S4", "(baseline)", `not the same flow (baseline ${JSON.stringify(baseline.name ?? null)} with ${nodesOf(baseline).length} nodes, target "${name}")`);
        baseline = undefined;
      }
    }
    const baseAgents = new Map(
      (baseline ? nodesOf(baseline) : [])
        .filter((n) => n.type === AGENT_TYPE)
        .map((n) => [n.name, n]),
    );
    for (const a of agents) {
      const lms = inputs(a.name, "ai_languageModel");
      if (lms.length !== 1) {
        add("S4", a.name, `needs exactly one language model input (found ${lms.length})`);
      } else {
        const lm = byName.get(lms[0].src);
        const model = modelName(lm?.parameters?.model);
        if (lm?.type !== MODEL_TYPE || model !== LOCAL_MODEL) {
          add("S4", a.name, `model must be ${MODEL_TYPE} "${LOCAL_MODEL}" (found ${lm?.type} ${JSON.stringify(model)})`);
        }
      }
      const parsers = inputs(a.name, "ai_outputParser");
      if (a.parameters?.hasOutputParser !== true || parsers.length !== 1 || byName.get(parsers[0].src)?.type !== PARSER_TYPE) {
        add("S4", a.name, "needs hasOutputParser: true and one outputParserStructured input");
      }
      const mi = maxIterations(a);
      if (typeof mi !== "number" || !(mi > 0)) {
        add("S4", a.name, `options.maxIterations must be a number > 0 (found ${JSON.stringify(mi)})`);
      } else {
        const base = baseAgents.get(a.name);
        const bmi = base ? maxIterations(base) : undefined;
        if (typeof bmi === "number" && mi > bmi) {
          add("S4", a.name, `maxIterations raised from ${bmi} to ${mi}`);
        }
      }
      if (a.retryOnFail === true) {
        add("S4", a.name, "retryOnFail must not be true (card agents do not retry)");
      }
      if (a.onError !== "continueRegularOutput") {
        add("S4", a.name, `onError must be "continueRegularOutput" (found ${JSON.stringify(a.onError ?? null)})`);
      }
    }
  }

  // S5 — no raw HTTP, no $env, no cluster addresses; an agent's ai_tool
  // inputs are module *Tool nodes or Execute Workflow tools only.
  for (const n of nodes) {
    if (BANNED_TYPES.includes(n.type)) add("S5", n.name, `node type ${n.type} is not allowed`);
    const hits = new Set<string>();
    walkStrings(n.parameters, (s) => {
      for (const [re, why] of BANNED_STRINGS) if (re.test(s)) hits.add(why);
    });
    for (const why of hits) add("S5", n.name, `parameter ${why}`);
  }
  for (const a of agents) {
    for (const t of inputs(a.name, "ai_tool")) {
      const type = byName.get(t.src)?.type;
      if (!isAllowedToolType(type)) {
        add("S5", t.src, `tool of "${a.name}" must be a module *Tool node or ${TOOL_WORKFLOW_TYPE} (found ${type ?? "missing node"})`);
      }
    }
  }

  // S6 — every call that can name a project names one.
  for (const n of nodes) {
    const params = isObj(n.parameters) ? n.parameters : {};
    const scoped = PROJECT_SCOPED_TYPE_PREFIXES.some((p) => n.type.startsWith(p));
    if ((scoped || "projectId" in params) && !isFilled(params.projectId)) {
      add("S6", n.name, "parameters.projectId is empty");
    }
  }

  // S7 — structurally valid workflow.
  for (const v of validateWorkflowPayload(wf).violations) add("S7", "(workflow)", v);

  // S9 — the flow documents itself. Card flows carry three info boxes; the
  // live cap.* flows carry two, so this is card-only.
  if (kind === "card") {
    const boxes = new Map(
      nodes
        .filter((n) => n.type === "n8n-nodes-base.stickyNote")
        .map((n) => [n.name, n.parameters?.content]),
    );
    for (const box of ["Info box 1", "Info box 2", "Info box 3"]) {
      const content = boxes.get(box);
      if (typeof content !== "string" || content.trim() === "") {
        add("S9", box, "missing or empty");
      }
    }
    const box1 = boxes.get("Info box 1");
    if (typeof box1 === "string" && box1.trim() !== "" && !box1.includes(name)) {
      add("S9", "Info box 1", `does not name the flow (${name})`);
    }
  }

  return finish(kind);
}

/**
 * Whether a baseline is the same flow as the target. A version object (getVersion,
 * or a GET's activeVersion) carries workflowId and its own label as name, so ids
 * decide when both sides have one; names decide only for two plain payloads.
 */
function sameFlow(baseline: Obj, target: Obj, targetName: string): boolean {
  const targetId = typeof target.id === "string" ? target.id : "";
  const baseId =
    typeof baseline.workflowId === "string"
      ? baseline.workflowId
      : typeof baseline.id === "string"
        ? baseline.id
        : "";
  if (baseId && targetId) return baseId === targetId;
  if (typeof baseline.workflowId === "string") return false; // a version, target has no id to match
  return baseline.name === targetName;
}
