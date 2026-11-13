/**
 * Operations dispatcher for Workflows node.
 * Talks to n8n's Public API on the same instance the node is running in.
 * Uses n8n's built-in this.helpers.request — no axios.
 */
import { IDataObject, IExecuteFunctions } from "n8n-workflow";
import { RetryingRequest } from "../../../helpers/requestExecution";
import { cleanWorkflowPayload } from "../../../helpers/cleanWorkflowPayload";
import { lintFlowStandards } from "../../../helpers/flowStandards";
import { diffWorkflows } from "../../../helpers/diffWorkflows";
import { validateWorkflowPayload } from "../../../helpers/validateWorkflow";
import {
  buildWebhookUrl,
  WebhookFlavor,
} from "../../../helpers/webhookUrl";

type OperationContext = {
  auth: RetryingRequest;
  baseUrl: string;
  ctx: IExecuteFunctions;
  getParam: <T = unknown>(name: string, defaultValue?: T) => T;
  headers: Record<string, string>;
  itemIndex: number;
};

type OperationHandler = (context: OperationContext) => Promise<unknown>;
type ResourceHandlers = Record<string, OperationHandler>;

function parseJsonish<T = IDataObject>(input: unknown, fallback: T): T {
  if (input === undefined || input === null || input === "") return fallback;
  if (typeof input === "object") return input as T;
  if (typeof input === "string") {
    try {
      return JSON.parse(input) as T;
    } catch {
      throw new Error(`Expected JSON object, got: ${input.slice(0, 60)}`);
    }
  }
  return fallback;
}

function compactQuery(filters: IDataObject): IDataObject {
  const out: IDataObject = {};
  for (const [k, v] of Object.entries(filters || {})) {
    if (v === "" || v === null || v === undefined) continue;
    out[k] = v as IDataObject[string];
  }
  return out;
}

async function apiCall(
  { ctx, auth, baseUrl, headers }: OperationContext,
  method: string,
  path: string,
  extra: IDataObject = {},
): Promise<IDataObject> {
  return auth.executeWithRetry(
    () =>
      ctx.helpers.request({
        method,
        uri: `${baseUrl}${path}`,
        headers,
        json: true,
        ...extra,
      } as never),
    ctx,
    { method },
  ) as Promise<IDataObject>;
}

function getWorkflow(context: OperationContext, id: string) {
  return apiCall(context, "GET", `/workflows/${encodeURIComponent(id)}`);
}

function getVersion(context: OperationContext, id: string, versionId: string) {
  return apiCall(
    context,
    "GET",
    `/workflows/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`,
  );
}

/** PUT with publishIfActive=false: a write always saves a draft (K20). */
function saveDraft(context: OperationContext, id: string, body: unknown) {
  return apiCall(context, "PUT", `/workflows/${encodeURIComponent(id)}`, {
    qs: { publishIfActive: "false" },
    body: body as IDataObject,
  });
}

const resourceHandlers: Record<string, ResourceHandlers> = {
  workflow: {
    list: async ({ ctx, auth, getParam, baseUrl, headers }) => {
      const filters = getParam<IDataObject>("filters", {} as IDataObject);
      return auth.executeWithRetry(
        () =>
          ctx.helpers.request({
            method: "GET",
            uri: `${baseUrl}/workflows`,
            headers,
            qs: compactQuery(filters),
            json: true,
          }),
        ctx,
        { method: "GET" },
      );
    },
    get: async ({ ctx, auth, getParam, baseUrl, headers }) => {
      const id = getParam<string>("workflowId");
      return auth.executeWithRetry(
        () =>
          ctx.helpers.request({
            method: "GET",
            uri: `${baseUrl}/workflows/${encodeURIComponent(id)}`,
            headers,
            json: true,
          }),
        ctx,
        { method: "GET" },
      );
    },
    create: async ({ ctx, auth, getParam, baseUrl, headers }) => {
      const raw = getParam<unknown>("workflowPayload");
      const body = cleanWorkflowPayload(raw);
      return auth.executeWithRetry(
        () =>
          ctx.helpers.request({
            method: "POST",
            uri: `${baseUrl}/workflows`,
            headers,
            json: true,
            body,
          }),
        ctx,
        { method: "POST" },
      );
    },
    update: async (context) => {
      const { getParam } = context;
      const id = getParam<string>("workflowId");
      const raw = getParam<unknown>("workflowPayload");
      return saveDraft(context, id, cleanWorkflowPayload(raw));
    },
    delete: async ({ ctx, auth, getParam, baseUrl, headers }) => {
      const id = getParam<string>("workflowId");
      // n8n 2.46.1 answers 409 "Workflow is still being unpublished" to a DELETE
      // sent right after unpublish (measured 2026-10-31), so this loop retries
      // 409 and 5xx itself (no inner retry: options omitted), and a 404 on a
      // retry means an earlier attempt already deleted the workflow.
      for (let attempt = 0; ; attempt++) {
        try {
          return await auth.executeWithRetry(
            () =>
              ctx.helpers.request({
                method: "DELETE",
                uri: `${baseUrl}/workflows/${encodeURIComponent(id)}`,
                headers,
                json: true,
              }),
            ctx,
          );
        } catch (error: any) {
          const status = error?.statusCode || error?.response?.status;
          if (status === 404 && attempt > 0) return { id, deleted: true };
          const retryable = status === 409 || (status >= 500 && status < 600);
          if (!retryable || attempt >= 5) throw error;
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    },
    publish: async (context) => {
      const id = context.getParam<string>("workflowId");
      const versionId = context.getParam<string>("versionId", "");
      return apiCall(context, "POST", `/workflows/${encodeURIComponent(id)}/publish`, {
        body: versionId ? { versionId } : {},
      });
    },
    unpublish: async (context) => {
      const id = context.getParam<string>("workflowId");
      return apiCall(context, "POST", `/workflows/${encodeURIComponent(id)}/unpublish`);
    },
    history: async (context) => {
      const id = context.getParam<string>("workflowId");
      const filters = context.getParam<IDataObject>("historyFilters", {} as IDataObject);
      return apiCall(context, "GET", `/workflows/${encodeURIComponent(id)}/history`, {
        qs: compactQuery(filters),
      });
    },
    getVersion: async (context) => {
      const id = context.getParam<string>("workflowId");
      const versionId = context.getParam<string>("versionId");
      return getVersion(context, id, versionId);
    },
    restore: async (context) => {
      // No server-side restore in the 2.46.1 public API: write the version's
      // graph back as a DRAFT. The caller publishes separately (K20).
      const id = context.getParam<string>("workflowId");
      const versionId = context.getParam<string>("versionId");
      if (!versionId) throw new Error("restore needs a versionId");
      const version = await getVersion(context, id, versionId);
      const current = await getWorkflow(context, id);
      // Every field the version carries that PUT accepts (nodes, connections,
      // nodeGroups); name/settings/description come from the live workflow —
      // a version's name/description are its own label, not the flow's.
      const body: IDataObject = {
        name: current.name,
        nodes: version.nodes,
        connections: version.connections,
        settings: current.settings ?? {},
      };
      if (Array.isArray(version.nodeGroups)) body.nodeGroups = version.nodeGroups;
      if (typeof current.description === "string") body.description = current.description;
      return saveDraft(context, id, body);
    },
    transferOwnership: async ({ ctx, auth, getParam, baseUrl, headers }) => {
      const id = getParam<string>("workflowId");
      const destinationProjectId = getParam<string>("destinationProjectId");
      return auth.executeWithRetry(
        () =>
          ctx.helpers.request({
            method: "PUT",
            uri: `${baseUrl}/workflows/${encodeURIComponent(id)}/transfer`,
            headers,
            json: true,
            body: { destinationProjectId },
          }),
        ctx,
        { method: "PUT" },
      );
    },
    lint: async ({ getParam }) => {
      // Pure local check of standards S1–S7 + S9 (S8 is diff). Bad JSON is
      // reported as a violation, never thrown.
      const baseline = getParam<unknown>("baselinePayload", "");
      return lintFlowStandards(getParam<unknown>("workflowPayload"), {
        baseline: baseline === "" || baseline === null ? undefined : baseline,
      });
    },
    validate: async ({ getParam }) => {
      // Pure local validation — no Public API call. Validates that a proposed
      // workflow payload is a structurally sound n8n workflow of ANY shape
      // (non-empty named nodes, unique node names, connections referencing only
      // existing nodes); S7 of lint reuses it. Bad input is a violation, not a
      // throw, so a coach step never crashes on bad LLM output.
      const raw = getParam<unknown>("workflowPayload");
      let wf: unknown;
      try {
        wf = parseJsonish<IDataObject>(raw, {} as IDataObject);
      } catch (e) {
        return {
          ok: false,
          violations: [
            `PARSE ERROR :: ${e instanceof Error ? e.message : String(e)}`,
          ],
          nodeCount: 0,
        };
      }
      return validateWorkflowPayload(wf);
    },
    diff: async (context) => {
      // Local diff (S8): the public API has no version-diff endpoint.
      // Base: baselinePayload, else version fromVersionId, else the live flow.
      // Target: workflowPayload, else version toVersionId, else the live flow.
      // Input problems (no source for a side, bad JSON) are { ok: false,
      // error }, never a throw.
      const id = context.getParam<string>("workflowId", "");
      const side = async (
        payloadParam: string,
        versionParam: string,
      ): Promise<{ value?: unknown; isVersion?: boolean; error?: string }> => {
        const payload = context.getParam<unknown>(payloadParam, "");
        if (payload !== "" && payload !== null && payload !== undefined) return { value: payload };
        const versionId = context.getParam<string>(versionParam, "");
        if (!id) return { error: `diff needs ${payloadParam} or a workflowId` };
        return versionId
          ? { value: await getVersion(context, id, versionId), isVersion: true }
          : { value: await getWorkflow(context, id) };
      };
      const base = await side("baselinePayload", "fromVersionId");
      const target = await side("workflowPayload", "toVersionId");
      if (base.error || target.error) {
        const parsed = diffWorkflows(base.value ?? {}, target.value ?? {});
        const errors = [base.error, target.error];
        if (!parsed.ok) errors.push(parsed.error);
        return { ok: false, error: errors.filter(Boolean).join("; ") };
      }
      return diffWorkflows(base.value, target.value, {
        baseIsVersion: base.isVersion,
        targetIsVersion: target.isVersion,
      });
    },
  },
  execution: {
    list: async ({ ctx, auth, getParam, baseUrl, headers }) => {
      const filters = getParam<IDataObject>("filters", {} as IDataObject);
      return auth.executeWithRetry(
        () =>
          ctx.helpers.request({
            method: "GET",
            uri: `${baseUrl}/executions`,
            headers,
            qs: compactQuery(filters),
            json: true,
          }),
        ctx,
        { method: "GET" },
      );
    },
    get: async ({ ctx, auth, getParam, baseUrl, headers }) => {
      const id = getParam<string>("executionId");
      // n8n's public API takes the string enum 'true' | 'false'; send it only
      // when asked, so the default request is unchanged.
      const rawIncludeData = getParam<unknown>("includeData", false);
      const includeData = rawIncludeData === true || rawIncludeData === "true";
      return auth.executeWithRetry(
        () =>
          ctx.helpers.request({
            method: "GET",
            uri: `${baseUrl}/executions/${encodeURIComponent(id)}`,
            headers,
            ...(includeData ? { qs: { includeData: "true" } } : {}),
            json: true,
          }),
        ctx,
        { method: "GET" },
      );
    },
    delete: async ({ ctx, auth, getParam, baseUrl, headers }) => {
      const id = getParam<string>("executionId");
      return auth.executeWithRetry(
        () =>
          ctx.helpers.request({
            method: "DELETE",
            uri: `${baseUrl}/executions/${encodeURIComponent(id)}`,
            headers,
            json: true,
          }),
        ctx,
        { method: "DELETE" },
      );
    },
  },
  webhook: {
    invoke: async ({ ctx, getParam, baseUrl }) => {
      const path = getParam<string>("webhookPath");
      const method = (
        getParam<string>("httpMethod", "POST") || "POST"
      ).toUpperCase();
      const flavor = (getParam<string>("webhookFlavor", "production") ||
        "production") as WebhookFlavor;
      const body = parseJsonish<IDataObject>(
        getParam("body", {} as IDataObject),
        {} as IDataObject,
      );
      const queryParams = parseJsonish<IDataObject>(
        getParam("queryParams", {} as IDataObject),
        {} as IDataObject,
      );
      const extraHeaders = parseJsonish<IDataObject>(
        getParam("extraHeaders", {} as IDataObject),
        {} as IDataObject,
      );
      const timeoutSec = Number(getParam("timeoutSeconds", 60)) || 60;

      const url = buildWebhookUrl(baseUrl, path, flavor);

      const requestOpts: IDataObject = {
        method,
        uri: url,
        headers: { Accept: "application/json", ...extraHeaders },
        timeout: timeoutSec * 1000,
        json: true,
        resolveWithFullResponse: false,
        // axios-style helpers in n8n accept rejectUnauthorized; allow through
        rejectUnauthorized: true,
      };
      if (Object.keys(queryParams).length > 0) requestOpts.qs = queryParams;
      if (
        method === "POST" ||
        method === "PUT" ||
        method === "PATCH"
      ) {
        requestOpts.body = body;
      }

      // Webhooks are PUBLIC endpoints — do NOT forward X-N8N-API-KEY or
      // X-Tenant-ID; those are control-plane headers and would either be
      // ignored (n8n) or leak (forwarded to user code).
      return ctx.helpers.request(requestOpts);
    },
  },
};

export async function executeOperation(
  ctx: IExecuteFunctions,
  baseUrl: string,
  headers: Record<string, string>,
  resource: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  const resourceOperations = resourceHandlers[resource];
  if (!resourceOperations) {
    throw new Error(`Unknown resource: ${resource}`);
  }
  const handler = resourceOperations[operation];
  if (!handler) {
    throw new Error(`Unknown ${resource} operation: ${operation}`);
  }
  const auth = new RetryingRequest();
  const context: OperationContext = {
    auth,
    baseUrl,
    ctx,
    getParam: <T = unknown>(name: string, defaultValue?: T) =>
      ctx.getNodeParameter(name, itemIndex, defaultValue as never) as T,
    headers,
    itemIndex,
  };
  return handler(context);
}
