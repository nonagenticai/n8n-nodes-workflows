/**
 * Body for POST /workflows and PUT /workflows/{id}. Both request schemas set
 * additionalProperties: false, so a GET response cannot be sent back as is.
 * Rule (same as `restore`): carry every field the PUT schema (operationId
 * updateWorkflow, n8n 2.46.1) accepts and the payload has; strip the rest.
 * Exception: staticData is runtime trigger state, not definition. A caller edits
 * a GET copy; writing that copy's staticData back would reset state that moved
 * since the GET, so it is never sent.
 */
export const WRITABLE_WORKFLOW_FIELDS = [
  "name",
  "nodes",
  "connections",
  "settings",
  "nodeGroups",
  "description",
  "pinData",
  "parentFolderId",
] as const;

/**
 * Fields a GET returns that the PUT schema marks readOnly (or, for `shared`,
 * accepts and ignores). Everything not in WRITABLE_WORKFLOW_FIELDS is
 * stripped; this list only documents the common ones.
 */
export const READONLY_WORKFLOW_FIELDS = [
  "id",
  "versionId",
  "active",
  "activeVersionId",
  "activeVersion",
  "staticData",
  "tags",
  "meta",
  "createdAt",
  "updatedAt",
  "shared",
  "homeProject",
  "isArchived",
  "triggerCount",
] as const;

export type WorkflowPayload = {
  name: string;
  nodes: unknown[];
  connections: Record<string, unknown>;
  settings: Record<string, unknown>;
  nodeGroups?: unknown[];
  description?: string;
  pinData?: Record<string, unknown> | null;
  parentFolderId?: string | null;
};

export function cleanWorkflowPayload(input: unknown): WorkflowPayload {
  const raw = (typeof input === "string" ? safeJsonParse(input) : input) as
    | Record<string, unknown>
    | null
    | undefined;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Workflow payload must be an object or JSON string");
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new Error("Workflow payload requires a non-empty 'name' field");
  }
  if (!Array.isArray(raw.nodes)) {
    throw new Error("Workflow payload requires a 'nodes' array");
  }

  const out: WorkflowPayload = {
    name: raw.name,
    nodes: raw.nodes,
    connections:
      raw.connections && typeof raw.connections === "object"
        ? (raw.connections as Record<string, unknown>)
        : {},
    settings:
      raw.settings && typeof raw.settings === "object"
        ? (raw.settings as Record<string, unknown>)
        : {},
  };
  // Optional fields, only in the shapes the schema accepts (a GET can return
  // description: null, which PUT rejects).
  if (Array.isArray(raw.nodeGroups)) out.nodeGroups = raw.nodeGroups;
  if (typeof raw.description === "string") out.description = raw.description;
  if (raw.pinData === null || (raw.pinData && typeof raw.pinData === "object" && !Array.isArray(raw.pinData))) {
    out.pinData = raw.pinData as Record<string, unknown> | null;
  }
  if (raw.parentFolderId === null || typeof raw.parentFolderId === "string") {
    out.parentFolderId = raw.parentFolderId;
  }
  return out;
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch (err) {
    throw new Error(
      `Workflow payload is not valid JSON: ${(err as Error).message}`,
    );
  }
}
