/**
 * Unit tests for the operations dispatcher.
 * Mocks ctx.helpers.request and asserts that each operation builds the right
 * HTTP method + URL + headers + body + query string.
 */
import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import { executeOperation } from "../../nodes/Workflows/operations";

const BASE = "http://n8n.test/api/v1";
const HEADERS = {
  "X-N8N-API-KEY": "k",
  "X-Tenant-ID": "00000000-0000-4000-8000-000000000001",
};

function makeCtx(params: Record<string, unknown>) {
  const request = jest.fn() as jest.MockedFunction<(opts: unknown) => Promise<unknown>>;
  const ctx = {
    getNodeParameter: (name: string, _idx: number, defaultValue?: unknown) =>
      params[name] !== undefined ? params[name] : defaultValue,
    helpers: { request },
    getNode: () => ({ name: "Workflows", type: "n8nWorkflowsApi" }),
    continueOnFail: () => false,
    getInputData: () => [{ json: {} }],
  } as never;
  return { ctx, request };
}

describe("workflow resource", () => {
  test("list compacts query and GETs /workflows", async () => {
    const { ctx, request } = makeCtx({
      filters: { active: true, name: "", limit: 50, cursor: "" },
    });
    request.mockResolvedValue({ data: [] });
    await executeOperation(ctx, BASE, HEADERS, "workflow", "list", 0);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      uri: `${BASE}/workflows`,
      headers: HEADERS,
      qs: { active: true, limit: 50 },
      json: true,
    });
  });

  test("get encodes the workflow id", async () => {
    const { ctx, request } = makeCtx({ workflowId: "wf 1/foo" });
    request.mockResolvedValue({});
    await executeOperation(ctx, BASE, HEADERS, "workflow", "get", 0);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        uri: `${BASE}/workflows/wf%201%2Ffoo`,
      }),
    );
  });

  test("create strips readonly fields and POSTs", async () => {
    const { ctx, request } = makeCtx({
      workflowPayload: {
        id: "should-strip",
        active: true,
        name: "smoke",
        nodes: [],
        connections: {},
        settings: {},
      },
    });
    request.mockResolvedValue({ id: "new-id" });
    await executeOperation(ctx, BASE, HEADERS, "workflow", "create", 0);
    const call = request.mock.calls[0][0] as Record<string, unknown>;
    expect(call.method).toBe("POST");
    expect(call.uri).toBe(`${BASE}/workflows`);
    expect(call.body).toEqual({
      name: "smoke",
      nodes: [],
      connections: {},
      settings: {},
    });
  });

  test("update PUTs a draft to /workflows/{id} with cleaned body", async () => {
    const { ctx, request } = makeCtx({
      workflowId: "abc",
      workflowPayload: {
        name: "updated",
        nodes: [],
        connections: {},
        settings: {},
        versionId: "x",
      },
    });
    request.mockResolvedValue({});
    await executeOperation(ctx, BASE, HEADERS, "workflow", "update", 0);
    const call = request.mock.calls[0][0] as Record<string, unknown>;
    expect(call.method).toBe("PUT");
    expect(call.uri).toBe(`${BASE}/workflows/abc`);
    expect((call.body as Record<string, unknown>).versionId).toBeUndefined();
    expect(call.qs).toEqual({ publishIfActive: "false" });
  });

  test("delete DELETEs /workflows/{id}", async () => {
    const { ctx, request } = makeCtx({ workflowId: "abc" });
    request.mockResolvedValue({});
    await executeOperation(ctx, BASE, HEADERS, "workflow", "delete", 0);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        uri: `${BASE}/workflows/abc`,
      }),
    );
  });

  test("publish POSTs /workflows/{id}/publish", async () => {
    const { ctx, request } = makeCtx({ workflowId: "abc" });
    request.mockResolvedValue({});
    await executeOperation(ctx, BASE, HEADERS, "workflow", "publish", 0);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        uri: `${BASE}/workflows/abc/publish`,
      }),
    );
  });

  test("unpublish POSTs /workflows/{id}/unpublish", async () => {
    const { ctx, request } = makeCtx({ workflowId: "abc" });
    request.mockResolvedValue({});
    await executeOperation(ctx, BASE, HEADERS, "workflow", "unpublish", 0);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        uri: `${BASE}/workflows/abc/unpublish`,
      }),
    );
  });

  test("transferOwnership PUTs the destination project id", async () => {
    const { ctx, request } = makeCtx({
      workflowId: "abc",
      destinationProjectId: "p-42",
    });
    request.mockResolvedValue({});
    await executeOperation(
      ctx,
      BASE,
      HEADERS,
      "workflow",
      "transferOwnership",
      0,
    );
    const call = request.mock.calls[0][0] as Record<string, unknown>;
    expect(call.method).toBe("PUT");
    expect(call.uri).toBe(`${BASE}/workflows/abc/transfer`);
    expect(call.body).toEqual({ destinationProjectId: "p-42" });
  });
});

describe("workflow lint operation", () => {
  const cleanPayload = {
    name: "sub.example",
    nodes: [
      { name: "Start", type: "n8n-nodes-base.executeWorkflowTrigger", parameters: {} },
      { name: "Return Result", type: "n8n-nodes-base.code", parameters: {} },
    ],
    connections: {
      Start: { main: [[{ node: "Return Result", type: "main", index: 0 }]] },
    },
    settings: {},
  };

  test("clean payload returns ok and makes no API call", async () => {
    const { ctx, request } = makeCtx({ workflowPayload: cleanPayload });
    const out = (await executeOperation(ctx, BASE, HEADERS, "workflow", "lint", 0)) as {
      ok: boolean;
      violations: string[];
    };
    expect(out.ok).toBe(true);
    expect(out.violations).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  test("bad payload returns violations (no throw)", async () => {
    const bad = { ...cleanPayload, settings: { errorWorkflow: "f702NW6Tii1haZhh" } };
    const { ctx } = makeCtx({ workflowPayload: bad });
    const out = (await executeOperation(ctx, BASE, HEADERS, "workflow", "lint", 0)) as {
      ok: boolean;
      violations: string[];
    };
    expect(out.ok).toBe(false);
    expect(out.violations.length).toBeGreaterThan(0);
  });

  test("unparseable JSON string is reported as a violation, not thrown", async () => {
    const { ctx } = makeCtx({ workflowPayload: "{not json" });
    const out = (await executeOperation(ctx, BASE, HEADERS, "workflow", "lint", 0)) as {
      ok: boolean;
      violations: string[];
    };
    expect(out.ok).toBe(false);
    expect(out.violations[0]).toMatch(/PARSE ERROR/);
  });
});

describe("workflow validate operation", () => {
  const validPayload = {
    name: "Some Business Workflow",
    nodes: [
      { name: "Webhook", type: "n8n-nodes-base.webhook", parameters: {} },
      { name: "Set", type: "n8n-nodes-base.set", parameters: {} },
    ],
    connections: { Webhook: { main: [[{ node: "Set", type: "main", index: 0 }]] } },
    settings: {},
  };

  test("a valid non-cell workflow passes and makes no API call", async () => {
    const { ctx, request } = makeCtx({ workflowPayload: validPayload });
    const out = (await executeOperation(ctx, BASE, HEADERS, "workflow", "validate", 0)) as {
      ok: boolean;
      violations: string[];
      nodeCount: number;
    };
    expect(out.ok).toBe(true);
    expect(out.violations).toEqual([]);
    expect(out.nodeCount).toBe(2);
    expect(request).not.toHaveBeenCalled();
  });

  test("a corrupt candidate (dangling connection) returns violations, no throw", async () => {
    const bad = { ...validPayload, nodes: [validPayload.nodes[0]] }; // drop "Set" target
    const { ctx } = makeCtx({ workflowPayload: bad });
    const out = (await executeOperation(ctx, BASE, HEADERS, "workflow", "validate", 0)) as {
      ok: boolean;
      violations: string[];
    };
    expect(out.ok).toBe(false);
    expect(out.violations.length).toBeGreaterThan(0);
  });

  test("unparseable JSON string is a violation, not thrown", async () => {
    const { ctx } = makeCtx({ workflowPayload: "{not json" });
    const out = (await executeOperation(ctx, BASE, HEADERS, "workflow", "validate", 0)) as {
      ok: boolean;
      violations: string[];
    };
    expect(out.ok).toBe(false);
    expect(out.violations[0]).toMatch(/PARSE ERROR/);
  });
});

describe("execution resource", () => {
  test("list compacts filters", async () => {
    const { ctx, request } = makeCtx({
      filters: { workflowId: "abc", limit: 25, cursor: "" },
    });
    request.mockResolvedValue({ data: [] });
    await executeOperation(ctx, BASE, HEADERS, "execution", "list", 0);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        uri: `${BASE}/executions`,
        qs: { workflowId: "abc", limit: 25 },
      }),
    );
  });

  test("get / delete", async () => {
    {
      const { ctx, request } = makeCtx({ executionId: "e1" });
      request.mockResolvedValue({});
      await executeOperation(ctx, BASE, HEADERS, "execution", "get", 0);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ method: "GET", uri: `${BASE}/executions/e1` }),
      );
    }
    {
      const { ctx, request } = makeCtx({ executionId: "e2" });
      request.mockResolvedValue({});
      await executeOperation(ctx, BASE, HEADERS, "execution", "delete", 0);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "DELETE",
          uri: `${BASE}/executions/e2`,
        }),
      );
    }
  });
});

describe("execution resource (R311 PR 4)", () => {
  test("get sends includeData=true only when asked", async () => {
    {
      const { ctx, request } = makeCtx({ executionId: "e1", includeData: true });
      request.mockResolvedValue({});
      await executeOperation(ctx, BASE, HEADERS, "execution", "get", 0);
      const req = request.mock.calls[0][0];
      expect(req.uri).toBe(`${BASE}/executions/e1`);
      expect(req.qs).toEqual({ includeData: "true" });
    }
    {
      const { ctx, request } = makeCtx({ executionId: "e1", includeData: "true" });
      request.mockResolvedValue({});
      await executeOperation(ctx, BASE, HEADERS, "execution", "get", 0);
      expect(request.mock.calls[0][0].qs).toEqual({ includeData: "true" });
    }
    for (const includeData of [false, undefined, "false", ""]) {
      const params: Record<string, unknown> = { executionId: "e1" };
      if (includeData !== undefined) params.includeData = includeData;
      const { ctx, request } = makeCtx(params);
      request.mockResolvedValue({});
      await executeOperation(ctx, BASE, HEADERS, "execution", "get", 0);
      expect(request.mock.calls[0][0]).not.toHaveProperty("qs");
    }
  });

  test.each(["running", "new", "waiting", "error", "success"])(
    "list sends the single status %s",
    async (status) => {
      const { ctx, request } = makeCtx({ filters: { workflowId: "w1", status } });
      request.mockResolvedValue({ data: [] });
      await executeOperation(ctx, BASE, HEADERS, "execution", "list", 0);
      expect(request.mock.calls[0][0].qs).toEqual({ workflowId: "w1", status });
    },
  );
});

describe("webhook resource", () => {
  test("invoke POSTs to /webhook/{path} with body and no API auth headers", async () => {
    const { ctx, request } = makeCtx({
      webhookPath: "smoke-test",
      httpMethod: "POST",
      webhookFlavor: "production",
      body: { hello: "world" },
      queryParams: {},
      extraHeaders: {},
      timeoutSeconds: 30,
    });
    request.mockResolvedValue({ ok: true });
    await executeOperation(ctx, BASE, HEADERS, "webhook", "invoke", 0);
    const call = request.mock.calls[0][0] as Record<string, unknown>;
    expect(call.method).toBe("POST");
    expect(call.uri).toBe("http://n8n.test/webhook/smoke-test");
    expect(call.body).toEqual({ hello: "world" });
    expect((call.headers as Record<string, unknown>)["X-N8N-API-KEY"]).toBeUndefined();
    expect((call.headers as Record<string, unknown>)["X-Tenant-ID"]).toBeUndefined();
  });

  test("invoke uses /webhook-test/ for test flavor", async () => {
    const { ctx, request } = makeCtx({
      webhookPath: "smoke",
      httpMethod: "POST",
      webhookFlavor: "test",
    });
    request.mockResolvedValue({});
    await executeOperation(ctx, BASE, HEADERS, "webhook", "invoke", 0);
    expect((request.mock.calls[0][0] as Record<string, unknown>).uri).toBe(
      "http://n8n.test/webhook-test/smoke",
    );
  });

  test("GET passes queryParams as qs and omits body", async () => {
    const { ctx, request } = makeCtx({
      webhookPath: "ping",
      httpMethod: "GET",
      webhookFlavor: "production",
      queryParams: { foo: "bar", n: 1 },
    });
    request.mockResolvedValue({});
    await executeOperation(ctx, BASE, HEADERS, "webhook", "invoke", 0);
    const call = request.mock.calls[0][0] as Record<string, unknown>;
    expect(call.method).toBe("GET");
    expect(call.qs).toEqual({ foo: "bar", n: 1 });
    expect(call.body).toBeUndefined();
  });

  test("invoke parses stringified JSON for body / headers / qs", async () => {
    const { ctx, request } = makeCtx({
      webhookPath: "smoke",
      httpMethod: "POST",
      body: '{"a":1}',
      queryParams: '{"b":2}',
      extraHeaders: '{"X-Custom":"yes"}',
    });
    request.mockResolvedValue({});
    await executeOperation(ctx, BASE, HEADERS, "webhook", "invoke", 0);
    const call = request.mock.calls[0][0] as Record<string, unknown>;
    expect(call.body).toEqual({ a: 1 });
    expect(call.qs).toEqual({ b: 2 });
    expect((call.headers as Record<string, unknown>)["X-Custom"]).toBe("yes");
  });

  test("invoke rejects empty webhookPath", async () => {
    const { ctx } = makeCtx({ webhookPath: "" });
    await expect(
      executeOperation(ctx, BASE, HEADERS, "webhook", "invoke", 0),
    ).rejects.toThrow(/required/);
  });
});

describe("dispatcher errors", () => {
  test("unknown resource throws", async () => {
    const { ctx } = makeCtx({});
    await expect(
      executeOperation(ctx, BASE, HEADERS, "nope", "list", 0),
    ).rejects.toThrow(/Unknown resource/);
  });

  test("unknown operation throws", async () => {
    const { ctx } = makeCtx({});
    await expect(
      executeOperation(ctx, BASE, HEADERS, "workflow", "frobnicate", 0),
    ).rejects.toThrow(/Unknown workflow operation/);
  });
});
