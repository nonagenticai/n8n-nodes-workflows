import { INodeProperties } from "n8n-workflow";

export {
  workflowOperations,
  workflowFields,
} from "./workflow.resource";
export {
  executionOperations,
  executionFields,
} from "./execution.resource";
export {
  webhookOperations,
  webhookFields,
} from "./webhook.resource";

export const resourceSelector: INodeProperties = {
  displayName: "Resource",
  name: "resource",
  type: "options",
  // No noDataExpression: the resource may be set via an expression at
  // runtime (one generic node, not a per-operation node).
  options: [
    { name: "Workflow", value: "workflow" },
    { name: "Execution", value: "execution" },
    { name: "Webhook", value: "webhook" },
  ],
  default: "workflow",
};
