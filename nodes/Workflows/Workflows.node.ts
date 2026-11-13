/**
 * n8n Workflows node — CRUD on workflows + executions of the running n8n
 * instance via the Public API. Uses n8n built-in HTTP helpers (no axios).
 */
import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  IDataObject,
  ICredentialDataDecryptedObject,
  ICredentialTestFunctions,
  ICredentialsDecrypted,
  INodeCredentialTestResult,
} from "n8n-workflow";

import { N8N_API_URL } from "../../credentials/WorkflowsApi.credentials";
import { executeOperation } from "./operations";
import {
  resourceSelector,
  workflowOperations,
  workflowFields,
  executionOperations,
  executionFields,
  webhookOperations,
  webhookFields,
} from "./resources";
import { mergeSameNameCollections } from "../../helpers/mergeSameNameCollections";

export class Workflows implements INodeType {
  description: INodeTypeDescription = {
    displayName: "n8n Workflows",
    name: "n8nWorkflowsApi",
    icon: "file:workflows.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
    description:
      "CRUD for workflows + executions of the running n8n instance via the Public API.",
    defaults: { name: "n8n Workflows" },
    inputs: ["main"],
    outputs: ["main"],
    // `testedBy` is what makes the credential test RUN. n8n resolves a test as:
    // the credential's declarative `test`, else this name looked up in
    // `methods.credentialTest`. A function-valued ICredentialType.test is never
    // called — CredentialsTester wraps it as `{ testRequest: type.test }` and
    // routes `.request` off a function, i.e. undefined.
    credentials: [{ name: "workflowsApi", required: true, testedBy: "workflowsApiTest" }],
    properties: mergeSameNameCollections([
      resourceSelector,
      workflowOperations,
      executionOperations,
      webhookOperations,
      ...workflowFields,
      ...executionFields,
      ...webhookFields,
    ]),
  };

  /**
   * Credential test — IMPERATIVE, so the N8N_API_URL fallback survives.
   *
   * A declarative `ICredentialTestRequest` can only address
   * `{{$credentials.baseUrl}}`, and this credential deliberately allows that field
   * to be empty with the host coming from the deployment's N8N_API_URL. Emptying
   * the field would make the test fail on an instance that works.
   *
   * It lives here because n8n never calls a function-valued `ICredentialType.test`;
   * the credential declaration points at it with `testedBy`.
   *
   * Note the call-site shape: a node-level test receives the WRAPPER
   * `{id, name, type, data}`, not the payload.
   */
  methods = {
    credentialTest: {
      async workflowsApiTest(
        this: ICredentialTestFunctions,
        credential: ICredentialsDecrypted<ICredentialDataDecryptedObject>,
      ): Promise<INodeCredentialTestResult> {
        const data = credential.data ?? {};
        const apiKey = data.apiKey as string;
        if (!apiKey) {
          return { status: "Error", message: "API key is required" };
        }
        const baseUrl = (data.baseUrl as string) || N8N_API_URL;
        if (!baseUrl) {
          return {
            status: "Error",
            message:
              "n8n API base URL not configured: set the credential's baseUrl field or the N8N_API_URL env var in the n8n deployment.",
          };
        }
        try {
          await this.helpers.request({
            method: "GET",
            uri: `${baseUrl}/workflows`,
            qs: { limit: 1 },
            headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
            json: true,
          });
          return { status: "OK", message: "API key valid and instance reachable" };
        } catch (error: any) {
          return {
            status: "Error",
            message: `Credential test failed: ${error.message || error}`,
          };
        }
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials("workflowsApi");
    const baseUrl = (credentials.baseUrl as string) || N8N_API_URL;
    const apiKey = credentials.apiKey as string;

    if (!apiKey) {
      throw new NodeOperationError(
        this.getNode(),
        "n8n API key required. Add in credentials.",
      );
    }

    // No hardcoded tenant default: when the credential carries no tenantId we OMIT the
    // X-Tenant-ID header (below) rather than forcing a foreign project's system tenant.
    const tenantId = (credentials.tenantId as string) || "";
    const headers: Record<string, string> = {
      "X-N8N-API-KEY": apiKey,
      Accept: "application/json",
    };
    // Only send X-Tenant-ID when a tenant is actually configured.
    if (tenantId) {
      headers["X-Tenant-ID"] = tenantId;
    }

    const resource = this.getNodeParameter("resource", 0) as string;
    const operation = this.getNodeParameter("operation", 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        const responseData = await executeOperation(
          this,
          baseUrl,
          headers,
          resource,
          operation,
          i,
        );
        const result = responseData as IDataObject;
        if (Array.isArray(result)) {
          returnData.push(
            ...result.map((item) => ({
              json: item as IDataObject,
              pairedItem: { item: i },
            })),
          );
        } else if (
          result &&
          typeof result === "object" &&
          Array.isArray((result as IDataObject).data)
        ) {
          // n8n list endpoints wrap as { data: [...], nextCursor }
          const list = (result as IDataObject).data as IDataObject[];
          returnData.push(
            ...list.map((item) => ({
              json: item,
              pairedItem: { item: i },
            })),
          );
        } else {
          returnData.push({ json: result, pairedItem: { item: i } });
        }
      } catch (error: unknown) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error instanceof Error ? error.message : String(error),
              resource,
              operation,
            } as IDataObject,
            pairedItem: { item: i },
          });
          continue;
        }
        throw new NodeOperationError(
          this.getNode(),
          error instanceof Error ? error : new Error(String(error)),
          { itemIndex: i },
        );
      }
    }

    return [returnData];
  }
}
