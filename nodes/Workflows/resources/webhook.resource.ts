import { INodeProperties } from "n8n-workflow";

export const webhookOperations: INodeProperties = {
  displayName: "Operation",
  name: "operation",
  type: "options",
  // No noDataExpression: operation is expression-driven at runtime by dispatch.
  displayOptions: { show: { resource: ["webhook"] } },
  options: [
    {
      name: "Invoke",
      value: "invoke",
      action: "Invoke a workflow webhook",
      description:
        "Calls the workflow's webhook URL directly (the canonical way to trigger an n8n workflow programmatically — n8n's Public API does not expose POST /workflows/{id}/execute)",
    },
  ],
  default: "invoke",
};

export const webhookFields: INodeProperties[] = [
  {
    displayName: "Webhook Path",
    name: "webhookPath",
    type: "string",
    required: false,
    default: "",
    placeholder: "smoke-test  (or /webhook/smoke-test, or full URL)",
    description:
      "Webhook path as configured on the target workflow's Webhook node. Leading slash and a /webhook/ or /webhook-test/ prefix are stripped before request.",
    displayOptions: {
      show: { resource: ["webhook"], operation: ["invoke"] },
    },
  },
  {
    displayName: "HTTP Method",
    name: "httpMethod",
    type: "options",
    default: "POST",
    options: [
      { name: "GET", value: "GET" },
      { name: "POST", value: "POST" },
      { name: "PUT", value: "PUT" },
      { name: "PATCH", value: "PATCH" },
      { name: "DELETE", value: "DELETE" },
    ],
    displayOptions: {
      show: { resource: ["webhook"], operation: ["invoke"] },
    },
  },
  {
    displayName: "Webhook Flavor",
    name: "webhookFlavor",
    type: "options",
    default: "production",
    options: [
      {
        name: "Production",
        value: "production",
        description: "Targets /webhook/{path} — workflow must be active",
      },
      {
        name: "Test",
        value: "test",
        description:
          "Targets /webhook-test/{path} — single-use; n8n UI must be open with 'Listen for test event' enabled",
      },
    ],
    displayOptions: {
      show: { resource: ["webhook"], operation: ["invoke"] },
    },
  },
  {
    displayName: "Body",
    name: "body",
    type: "json",
    default: "{}",
    description: "JSON body for POST/PUT/PATCH",
    displayOptions: {
      show: {
        resource: ["webhook"],
        operation: ["invoke"],
        httpMethod: ["POST", "PUT", "PATCH"],
      },
    },
  },
  {
    displayName: "Query Params",
    name: "queryParams",
    type: "json",
    default: "{}",
    description: "JSON object of query string parameters (mainly for GET)",
    displayOptions: {
      show: { resource: ["webhook"], operation: ["invoke"] },
    },
  },
  {
    displayName: "Extra Headers",
    name: "extraHeaders",
    type: "json",
    default: "{}",
    description:
      "JSON object of additional request headers. Auth headers (X-N8N-API-KEY, X-Tenant-ID) are intentionally NOT forwarded to webhooks.",
    displayOptions: {
      show: { resource: ["webhook"], operation: ["invoke"] },
    },
  },
  {
    displayName: "Timeout (Seconds)",
    name: "timeoutSeconds",
    type: "number",
    default: 60,
    description: "Request timeout for the webhook call",
    displayOptions: {
      show: { resource: ["webhook"], operation: ["invoke"] },
    },
  },
];
