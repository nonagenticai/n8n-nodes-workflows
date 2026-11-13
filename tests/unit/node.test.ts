/**
 * Tests for the Workflows node class itself: header construction,
 * credential validation, list-unwrapping, and continueOnFail behaviour.
 */
import { describe, test, expect, jest } from "@jest/globals";
import { Workflows } from "../../nodes/Workflows/Workflows.node";

function makeExecCtx(opts: {
  credentials: Record<string, unknown>;
  resource: string;
  operation: string;
  params?: Record<string, unknown>;
  request: jest.Mock;
  inputItems?: number;
  continueOnFail?: boolean;
}) {
  const params: Record<string, unknown> = {
    resource: opts.resource,
    operation: opts.operation,
    ...(opts.params || {}),
  };
  return {
    getInputData: () =>
      Array.from({ length: opts.inputItems ?? 1 }, () => ({ json: {} })),
    getCredentials: jest.fn().mockResolvedValue(opts.credentials as never),
    getNodeParameter: (name: string, _idx: number, def?: unknown) =>
      params[name] !== undefined ? params[name] : def,
    helpers: { request: opts.request },
    getNode: () => ({ name: "Workflows", type: "n8nWorkflowsApi" }),
    continueOnFail: () => opts.continueOnFail ?? false,
  } as never;
}

describe("Workflows.node", () => {
  test("description metadata", () => {
    const node = new Workflows();
    expect(node.description.name).toBe("n8nWorkflowsApi");
    expect(node.description.displayName).toBe("n8n Workflows");
    expect(node.description.credentials).toEqual([
      { name: "workflowsApi", required: true, testedBy: "workflowsApiTest" },
    ]);
  });

  test("execute throws when apiKey is missing", async () => {
    const node = new Workflows();
    const request = jest.fn();
    const ctx = makeExecCtx({
      credentials: {},
      resource: "workflow",
      operation: "list",
      request: request as never,
    });
    await expect(node.execute.call(ctx)).rejects.toThrow(/n8n API key/i);
    expect(request).not.toHaveBeenCalled();
  });


  test("execute sends X-N8N-API-KEY + X-Tenant-ID and unwraps {data}", async () => {
    const node = new Workflows();
    const request = jest.fn().mockResolvedValue({
      data: [
        { id: "wf1", name: "one" },
        { id: "wf2", name: "two" },
      ],
      nextCursor: null,
    } as never);
    const ctx = makeExecCtx({
      credentials: {
        apiKey: "K",
        tenantId: "00000000-0000-4000-8000-000000000001",
        baseUrl: "http://n8n.test/api/v1",
      },
      resource: "workflow",
      operation: "list",
      params: { filters: {} },
      request: request as never,
    });
    const result = await node.execute.call(ctx);
    expect(result[0]).toHaveLength(2);
    expect(result[0][0].json).toEqual({ id: "wf1", name: "one" });
    const call = request.mock.calls[0][0] as Record<string, unknown>;
    expect(call.headers).toEqual(
      expect.objectContaining({
        "X-N8N-API-KEY": "K",
        "X-Tenant-ID": "00000000-0000-4000-8000-000000000001",
      }),
    );
    expect(call.uri).toBe("http://n8n.test/api/v1/workflows");
  });

  test("execute respects continueOnFail and surfaces error per item", async () => {
    const node = new Workflows();
    const request = jest
      .fn()
      .mockRejectedValue(new Error("boom") as never);
    const ctx = makeExecCtx({
      credentials: { apiKey: "k" },
      resource: "workflow",
      operation: "get",
      params: { workflowId: "wf1" },
      request: request as never,
      continueOnFail: true,
    });
    const result = await node.execute.call(ctx);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json).toEqual(
      expect.objectContaining({
        error: expect.stringMatching(/boom/),
        resource: "workflow",
        operation: "get",
      }),
    );
  });
});
