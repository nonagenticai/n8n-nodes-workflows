import { INodeProperties } from "n8n-workflow";

export const executionOperations: INodeProperties = {
  displayName: "Operation",
  name: "operation",
  type: "options",
  // No noDataExpression: operation is expression-driven at runtime by dispatch.
  displayOptions: { show: { resource: ["execution"] } },
  options: [
    {
      name: "List",
      value: "list",
      action: "List executions",
      description: "GET /executions",
    },
    {
      name: "Get",
      value: "get",
      action: "Get an execution",
      description: "GET /executions/{id}",
    },
    {
      name: "Delete",
      value: "delete",
      action: "Delete an execution",
      description: "DELETE /executions/{id}",
    },
  ],
  default: "list",
};

export const executionFields: INodeProperties[] = [
  {
    displayName: "Execution ID",
    name: "executionId",
    type: "string",
    required: false,
    default: "",
    description: "n8n execution ID",
    displayOptions: {
      show: { resource: ["execution"], operation: ["get", "delete"] },
    },
  },
  {
    displayName: "Include Data",
    name: "includeData",
    type: "boolean",
    default: false,
    description:
      "Whether to return the execution's detailed data (GET /executions/{id}?includeData=true): the run data, including the Start node's input",
    displayOptions: { show: { resource: ["execution"], operation: ["get"] } },
  },
  {
    displayName: "Filters",
    name: "filters",
    type: "collection",
    placeholder: "Add filter",
    default: {},
    description: "Optional filters for list",
    displayOptions: { show: { resource: ["execution"], operation: ["list"] } },
    options: [
      {
        displayName: "Workflow ID",
        name: "workflowId",
        type: "string",
        default: "",
      },
      {
        displayName: "Status",
        name: "status",
        type: "options",
        default: "success",
        options: [
          { name: "Success", value: "success" },
          { name: "Error", value: "error" },
          { name: "Waiting", value: "waiting" },
          { name: "New", value: "new" },
          { name: "Running", value: "running" },
        ],
        description:
          "One status. Without status=running, n8n's public list hides running executions (n8n 2.42.6 excludeRunning), so ask for running explicitly",
      },
      {
        displayName: "Include Data",
        name: "includeData",
        type: "boolean",
        default: false,
      },
      { displayName: "Limit", name: "limit", type: "number", default: 100 },
      { displayName: "Cursor", name: "cursor", type: "string", default: "" },
    ],
  },
];
