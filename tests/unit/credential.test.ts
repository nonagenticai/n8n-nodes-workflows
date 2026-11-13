/**
 * Unit tests for WorkflowsApi credential.
 * Exercises the real authenticate() and test() methods.
 */
import { describe, test, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import type {
  ICredentialDataDecryptedObject,
  IHttpRequestOptions,
} from "n8n-workflow";
import {
  N8N_API_URL,
  WorkflowsApi,
  validateProductionConfig,
} from "../../credentials/WorkflowsApi.credentials";
import { Workflows } from "../../nodes/Workflows/Workflows.node";

/**
 * The credential test now lives on the NODE (`methods.credentialTest`), because
 * n8n never invokes a function-valued ICredentialType.test. These helpers call it
 * the way n8n does: with the WRAPPER `{id, name, type, data}`, not the payload.
 */
function nodeTest() {
  const node: any = new Workflows();
  const fn = node.methods?.credentialTest?.workflowsApiTest;
  if (typeof fn !== "function") throw new Error("workflowsApiTest is not wired on the node");
  return fn;
}
const wrap = (data: Record<string, unknown>) => ({ id: "1", name: "w", type: "workflowsApi", data });

describe("WorkflowsApi credential", () => {
  test("name and displayName are stable identifiers", () => {
    const cred = new WorkflowsApi();
    expect(cred.name).toBe("workflowsApi");
    expect(cred.displayName).toBe("n8n Workflows API");
  });

  test("declares the required properties", () => {
    const cred = new WorkflowsApi();
    const names = cred.properties.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["baseUrl", "apiKey", "tenantId"]),
    );
    const apiKey = cred.properties.find((p) => p.name === "apiKey")!;
    expect(apiKey.required).toBe(true);
    const tenantId = cred.properties.find((p) => p.name === "tenantId")!;
    expect(tenantId.default).toBe("");
  });

  describe("tenantId handling (no hardcoded default)", () => {
    const HARDCODED_TENANT = "00000000-0000-4000-8000-000000000001";

    test("the workflowsApi credential tenantId field defaults to \"\" (no hardcoded tenant)", () => {
      const cred = new WorkflowsApi();
      const tenantProp = cred.properties.find((p) => p.name === "tenantId");
      expect(tenantProp).toBeDefined();
      expect(tenantProp!.default).toBe("");
    });

    test("the credential definition contains no hardcoded tenant literal", () => {
      const src = readFileSync(
        join(__dirname, "..", "..", "credentials", "WorkflowsApi.credentials.ts"),
        "utf8",
      );
      expect(src).not.toContain(HARDCODED_TENANT);
    });

    test("the node source contains no hardcoded tenant literal and only sets X-Tenant-ID when present", () => {
      const src = readFileSync(
        join(__dirname, "..", "..", "nodes", "Workflows", "Workflows.node.ts"),
        "utf8",
      );
      expect(src).not.toContain(HARDCODED_TENANT);
      // tenantId now degrades to "" (omit), not a hardcoded tenant.
      expect(src).toMatch(/tenantId = \(credentials\.tenantId as string\) \|\| "";/);
      // X-Tenant-ID is added only behind a truthiness gate.
      expect(src).toMatch(/if \(tenantId\) \{\s*headers\["X-Tenant-ID"\] = tenantId;/);
    });
  });

  test("default base URL is empty string (env-supplied)", () => {
    // No-hardcoded-URLs convention: the N8N_API_URL constant resolves from
    // process.env.N8N_API_URL only; absence in production is caught by
    // validateProductionConfig().
    expect(N8N_API_URL).toBe("");
  });

  describe("authenticate()", () => {
    test("injects X-N8N-API-KEY and X-Tenant-ID", async () => {
      const cred = new WorkflowsApi();
      const credentials: ICredentialDataDecryptedObject = {
        apiKey: "test-api-key",

        tenantId: "00000000-0000-4000-8000-000000000001",
      };
      const requestOptions: IHttpRequestOptions = {
        method: "GET",
        url: `${N8N_API_URL}/workflows`,
      };
      const result = await cred.authenticate(credentials, requestOptions);
      expect(result.headers!["X-N8N-API-KEY"]).toBe("test-api-key");
      expect(result.headers!["X-Tenant-ID"]).toBe("00000000-0000-4000-8000-000000000001");
      expect(result.headers).not.toHaveProperty("Authorization");
    });

    test("preserves existing headers", async () => {
      const cred = new WorkflowsApi();
      const requestOptions: IHttpRequestOptions = {
        method: "GET",
        url: `${N8N_API_URL}/workflows`,
        headers: { Accept: "application/json" },
      };
      const result = await cred.authenticate(
        { apiKey: "k", tenantId: "t" },
        requestOptions,
      );
      expect(result.headers!.Accept).toBe("application/json");
      expect(result.headers!["X-N8N-API-KEY"]).toBe("k");
    });

    test("omits X-Tenant-ID when tenantId is empty", async () => {
      const cred = new WorkflowsApi();
      const requestOptions: IHttpRequestOptions = {
        method: "GET",
        url: `${N8N_API_URL}/workflows`,
      };
      const result = await cred.authenticate({ apiKey: "k" }, requestOptions);
      expect(result.headers!["X-N8N-API-KEY"]).toBe("k");
      expect(result.headers).not.toHaveProperty("X-Tenant-ID");
    });

    test("throws when apiKey is missing", async () => {
      const cred = new WorkflowsApi();
      await expect(
        cred.authenticate({}, {
          method: "GET",
          url: `${N8N_API_URL}/workflows`,
        }),
      ).rejects.toThrow(/n8n API key/i);
    });
  });

  describe("credential test (on the node)", () => {
    test("is not a function on the credential (n8n would never call it)", () => {
      expect((new WorkflowsApi() as any).test).toBeUndefined();
    });

    test("the node declares testedBy and exposes the function", () => {
      const node: any = new Workflows();
      expect(node.description.credentials).toEqual([
        { name: "workflowsApi", required: true, testedBy: "workflowsApiTest" },
      ]);
      expect(typeof node.methods.credentialTest.workflowsApiTest).toBe("function");
    });

    test("returns Error when apiKey missing", async () => {
      const ctx = { helpers: { request: jest.fn() } } as any;
      const result = await nodeTest().call(ctx, wrap({}));
      expect(result.status).toBe("Error");
      expect(result.message).toMatch(/API key/i);
    });

    test("returns OK when the request succeeds", async () => {
      const request = jest.fn().mockResolvedValue({ data: [] } as never) as any;
      const ctx = { helpers: { request } } as any;
      const result = await nodeTest().call(
        ctx,
        wrap({ apiKey: "k", baseUrl: "http://localhost:5678/api/v1" }),
      );
      expect(result.status).toBe("OK");
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          uri: "http://localhost:5678/api/v1/workflows",
          headers: expect.objectContaining({ "X-N8N-API-KEY": "k" }),
          qs: { limit: 1 },
        }),
      );
    });

    test("returns Error when the request fails", async () => {
      const request = jest
        .fn()
        .mockRejectedValue(new Error("ECONNREFUSED") as never) as any;
      const ctx = { helpers: { request } } as any;
      const result = await nodeTest().call(
        ctx,
        wrap({ apiKey: "k", baseUrl: "http://localhost:5678/api/v1" }),
      );
      expect(result.status).toBe("Error");
      expect(result.message).toMatch(/ECONNREFUSED/);
    });

    test("returns Error when baseUrl unset and N8N_API_URL env unset", async () => {
      const request = jest.fn() as any;
      const ctx = { helpers: { request } } as any;
      const result = await nodeTest().call(ctx, wrap({ apiKey: "k" }));
      expect(result.status).toBe("Error");
      expect(result.message).toMatch(/N8N_API_URL|not configured/);
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe("validateProductionConfig()", () => {
    test("no-op outside production", () => {
      expect(() => validateProductionConfig({ NODE_ENV: "development" })).not.toThrow();
      expect(() => validateProductionConfig({ N8N_ENV: "test" })).not.toThrow();
    });

    test("throws in production when N8N_API_URL is unset", () => {
      expect(() =>
        validateProductionConfig({ NODE_ENV: "production" }),
      ).toThrow(/N8N_API_URL/);
    });

    test("passes in production when all required env vars are set", () => {
      expect(() =>
        validateProductionConfig({
          NODE_ENV: "production",
          N8N_API_URL: "http://n8n:5678/api/v1",
        }),
      ).not.toThrow();
    });
  });
});
