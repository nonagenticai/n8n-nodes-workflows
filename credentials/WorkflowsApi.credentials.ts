import type {
  ICredentialDataDecryptedObject,
  ICredentialType,
  IHttpRequestOptions,
  INodeProperties,
} from "n8n-workflow";

/**
 * n8n Public API base URL.
 *
 * Service addresses come from the deployment environment, not from code-side
 * fallbacks: the empty string is the only fallback, and
 * `validateProductionConfig()` below fails loudly in production if
 * N8N_API_URL is unset.
 *
 * The credential UI `baseUrl` field still takes precedence at runtime.
 */
export const N8N_API_URL = process.env.N8N_API_URL || "";

/**
 * Required-in-production env vars.
 */
const REQUIRED_IN_PRODUCTION: ReadonlyArray<string> = ["N8N_API_URL"];

/**
 * Startup-time validator for production-only invariants.
 *
 * The credential UI baseUrl may override at runtime, but the env-level default
 * must be set so workflows that don't override get a working URL.
 *
 * @throws Error when any required var is unset and the runtime is production.
 */
export function validateProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const runtime = env.NODE_ENV || env.N8N_ENV || "development";
  if (runtime !== "production") return;
  const missing = REQUIRED_IN_PRODUCTION.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `[@nonagenticai/n8n-nodes-workflows] Missing required env var(s) in ` +
        `production: ${missing.join(", ")}. Set them in the n8n deployment ` +
        `manifest and redeploy.`,
    );
  }
}

export class WorkflowsApi implements ICredentialType {
  name = "workflowsApi";
  displayName = "n8n Workflows API";
  icon = "file:workflows.svg" as const;
  documentationUrl = "https://docs.n8n.io/api/";

  properties: INodeProperties[] = [
    {
      displayName: "Base URL",
      name: "baseUrl",
      type: "string",
      default: "",
      required: false,
      placeholder: "http://localhost:5678/api/v1",
      description:
        "n8n Public API base URL, including the /api/v1 suffix. Leave empty to use the N8N_API_URL env var.",
    },
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description:
        "n8n Public API key (Settings → API → Create). Sent as X-N8N-API-KEY header.",
    },
    {
      displayName: "Tenant ID",
      name: "tenantId",
      type: "string",
      default: "",
      required: false,
      description:
        "Optional X-Tenant-ID header, for a gateway in front of n8n that routes by tenant. Leave EMPTY to omit the header.",
    },
  ];

  // ⛔ Deliberately NO `test` here. n8n never invokes a function-valued
  // ICredentialType.test (CredentialsTester wraps it as `{ testRequest: type.test }`
  // and routes `.request` off a function, i.e. undefined). The test must honour the
  // N8N_API_URL fallback, which a declarative request cannot express, so it lives on
  // the NODE as `methods.credentialTest.workflowsApiTest`, referenced by `testedBy`.

  async authenticate(
    credentials: ICredentialDataDecryptedObject,
    requestOptions: IHttpRequestOptions,
  ): Promise<IHttpRequestOptions> {
    if (!credentials.apiKey) {
      throw new Error("n8n API key is required");
    }
    if (!requestOptions.headers) {
      requestOptions.headers = {};
    }
    requestOptions.headers["X-N8N-API-KEY"] = credentials.apiKey as string;
    if (credentials.tenantId) {
      requestOptions.headers["X-Tenant-ID"] = credentials.tenantId as string;
    }
    return requestOptions;
  }
}
