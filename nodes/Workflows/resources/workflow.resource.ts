import { INodeProperties } from "n8n-workflow";

export const workflowOperations: INodeProperties = {
  displayName: "Operation",
  name: "operation",
  type: "options",
  // No noDataExpression: the operation may be set by expression
  // (read → lint → diff → update → publish, one generic node per step).
  displayOptions: { show: { resource: ["workflow"] } },
  options: [
    { name: "List", value: "list", action: "List workflows", description: "GET /workflows — paginated list" },
    { name: "Get", value: "get", action: "Get a workflow", description: "GET /workflows/{id}" },
    { name: "Create", value: "create", action: "Create a workflow", description: "POST /workflows (readonly fields stripped automatically)" },
    {
      name: "Update",
      value: "update",
      action: "Save a workflow draft",
      description:
        "PUT /workflows/{id}?publishIfActive=false — saves a DRAFT; a published flow keeps its live version until Publish",
    },
    { name: "Delete", value: "delete", action: "Delete a workflow", description: "DELETE /workflows/{id}; waits out the 409 n8n returns right after unpublish" },
    {
      name: "Publish",
      value: "publish",
      action: "Publish a workflow",
      description: "POST /workflows/{id}/publish — puts the latest draft (or the given Version ID) live",
    },
    { name: "Unpublish", value: "unpublish", action: "Unpublish a workflow", description: "POST /workflows/{id}/unpublish" },
    { name: "History", value: "history", action: "List workflow versions", description: "GET /workflows/{id}/history — paginated version list" },
    {
      name: "Get Version",
      value: "getVersion",
      action: "Get a workflow version",
      description: "GET /workflows/{id}/versions/{versionId} — nodes and connections of one version",
    },
    {
      name: "Restore",
      value: "restore",
      action: "Restore a workflow version as a draft",
      description:
        "Writes the version's nodes and connections back as a DRAFT (PUT, publishIfActive=false). Publish separately to roll back.",
    },
    {
      name: "Diff",
      value: "diff",
      action: "Diff two workflow versions",
      description:
        "Local structural diff (S8). Base: Baseline JSON, else From Version ID, else the live flow. Target: Workflow JSON, else To Version ID, else the live flow.",
    },
    {
      name: "Lint",
      value: "lint",
      action: "Check a workflow against standards S1–S7 + S9",
      description: "Pure local check of flow standards S1–S7 + S9. Returns { ok, kind, standards, violations[] }; never throws.",
    },
    {
      name: "Validate",
      value: "validate",
      action: "Validate a workflow payload",
      description:
        "Pure local structural check (named unique nodes, connections reference existing nodes). Returns { ok, violations[], nodeCount }.",
    },
    {
      name: "Transfer Ownership",
      value: "transferOwnership",
      action: "Transfer workflow ownership",
      description: "PUT /workflows/{id}/transfer (admin only)",
    },
  ],
  default: "list",
};

export const workflowFields: INodeProperties[] = [
  {
    displayName: "Workflow ID",
    name: "workflowId",
    type: "string",
    required: false,
    default: "",
    description: "n8n workflow ID",
    displayOptions: {
      show: {
        resource: ["workflow"],
        operation: [
          "get",
          "update",
          "delete",
          "publish",
          "unpublish",
          "history",
          "getVersion",
          "restore",
          "diff",
          "transferOwnership",
        ],
      },
    },
  },
  {
    displayName: "Version ID",
    name: "versionId",
    type: "string",
    default: "",
    description: "Workflow version ID (from History). Publish: empty = the latest draft.",
    displayOptions: {
      show: { resource: ["workflow"], operation: ["publish", "getVersion", "restore"] },
    },
  },
  {
    displayName: "Workflow JSON",
    name: "workflowPayload",
    type: "json",
    required: false,
    default: "",
    placeholder: '{ "name": "", "nodes": [], "connections": {}, "settings": {} }',
    description:
      "Full workflow definition. Only fields the PUT schema accepts (name, nodes, connections, settings, nodeGroups, description, pinData, parentFolderId) are sent on create/update; readonly fields (id, versionId, active, tags, meta, …) and staticData (runtime trigger state) are stripped. Diff: the target; empty = To Version ID or the live flow.",
    displayOptions: {
      show: {
        resource: ["workflow"],
        operation: ["create", "update", "lint", "validate", "diff"],
      },
    },
  },
  {
    displayName: "Baseline JSON",
    name: "baselinePayload",
    type: "json",
    default: "",
    description:
      "Diff: the base (empty = From Version ID or the live flow). Lint: the flow before the change; S4 then refuses an agent whose maxIterations rose.",
    displayOptions: { show: { resource: ["workflow"], operation: ["diff", "lint"] } },
  },
  {
    displayName: "From Version ID",
    name: "fromVersionId",
    type: "string",
    default: "",
    description: "Diff base when Baseline JSON is empty (empty = the live flow)",
    displayOptions: { show: { resource: ["workflow"], operation: ["diff"] } },
  },
  {
    displayName: "To Version ID",
    name: "toVersionId",
    type: "string",
    default: "",
    description: "Diff target when Workflow JSON is empty (empty = the live flow)",
    displayOptions: { show: { resource: ["workflow"], operation: ["diff"] } },
  },
  {
    displayName: "History Options",
    name: "historyFilters",
    type: "collection",
    placeholder: "Add option",
    default: {},
    displayOptions: { show: { resource: ["workflow"], operation: ["history"] } },
    options: [
      { displayName: "Limit", name: "limit", type: "number", default: 100, description: "Max items (1-250)" },
      { displayName: "Cursor", name: "cursor", type: "string", default: "", description: "Pagination cursor from previous response" },
    ],
  },
  {
    displayName: "Destination Project ID",
    name: "destinationProjectId",
    type: "string",
    required: false,
    default: "",
    description: "Target project ID for ownership transfer",
    displayOptions: {
      show: { resource: ["workflow"], operation: ["transferOwnership"] },
    },
  },
  {
    displayName: "Filters",
    name: "filters",
    type: "collection",
    placeholder: "Add filter",
    default: {},
    description: "Optional filters for list",
    displayOptions: { show: { resource: ["workflow"], operation: ["list"] } },
    options: [
      {
        displayName: "Active",
        name: "active",
        type: "boolean",
        default: false,
        description: "Whether to return only active workflows",
      },
      { displayName: "Name", name: "name", type: "string", default: "" },
      { displayName: "Tags", name: "tags", type: "string", default: "" },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        default: 100,
        description: "Max items (1-250)",
      },
      {
        displayName: "Cursor",
        name: "cursor",
        type: "string",
        default: "",
        description: "Pagination cursor from previous response",
      },
    ],
  },
];
