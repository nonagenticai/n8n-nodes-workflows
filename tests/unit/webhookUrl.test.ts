import { describe, test, expect } from "@jest/globals";
import { buildWebhookUrl } from "../../helpers/webhookUrl";

const BASE = "http://localhost:5678/api/v1";

describe("buildWebhookUrl", () => {
  test("strips /api/v1 from baseUrl and prepends /webhook/", () => {
    expect(buildWebhookUrl(BASE, "smoke-test", "production")).toBe(
      "http://localhost:5678/webhook/smoke-test",
    );
  });

  test("uses /webhook-test/ for test flavor", () => {
    expect(buildWebhookUrl(BASE, "smoke-test", "test")).toBe(
      "http://localhost:5678/webhook-test/smoke-test",
    );
  });

  test("tolerates leading slashes", () => {
    expect(buildWebhookUrl(BASE, "/smoke-test", "production")).toBe(
      "http://localhost:5678/webhook/smoke-test",
    );
  });

  test("tolerates a /webhook/ prefix and does not double-prefix", () => {
    expect(buildWebhookUrl(BASE, "/webhook/smoke-test", "production")).toBe(
      "http://localhost:5678/webhook/smoke-test",
    );
  });

  test("tolerates a /webhook-test/ prefix", () => {
    expect(
      buildWebhookUrl(BASE, "/webhook-test/smoke-test", "test"),
    ).toBe(
      "http://localhost:5678/webhook-test/smoke-test",
    );
  });

  test("passes absolute URLs through verbatim", () => {
    expect(
      buildWebhookUrl(BASE, "https://n8n.example.com/webhook/foo", "production"),
    ).toBe("https://n8n.example.com/webhook/foo");
  });

  test("handles baseUrl without /api/v1 suffix", () => {
    expect(
      buildWebhookUrl("http://localhost:5678", "ping", "production"),
    ).toBe("http://localhost:5678/webhook/ping");
  });

  test("strips trailing slash from baseUrl", () => {
    expect(
      buildWebhookUrl("http://localhost:5678/api/v1/", "ping", "production"),
    ).toBe("http://localhost:5678/webhook/ping");
  });

  test("rejects empty path", () => {
    expect(() => buildWebhookUrl(BASE, "", "production")).toThrow(/required/);
  });
});
