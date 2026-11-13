/**
 * Derive a webhook URL from the credential baseUrl + a user-supplied path.
 *
 * Credential baseUrl typically targets the n8n Public API (e.g.
 * `http://localhost:5678/api/v1`). Webhooks live on the same
 * host but at `/webhook/{path}` or `/webhook-test/{path}`, NOT under /api/v1.
 *
 * The path argument tolerates these shapes; all collapse to the same URL:
 *   "smoke-test"
 *   "/smoke-test"
 *   "/webhook/smoke-test"
 *   "https://n8n.example.com/webhook/smoke-test"   (taken verbatim if absolute)
 */
export type WebhookFlavor = "production" | "test";

const WEBHOOK_PREFIXES = ["/webhook/", "/webhook-test/"];

export function buildWebhookUrl(
  baseUrl: string,
  rawPath: string,
  flavor: WebhookFlavor,
): string {
  const path = String(rawPath || "").trim();
  if (!path) throw new Error("webhookPath is required");

  if (/^https?:\/\//i.test(path)) {
    return path; // absolute URL — caller knows exactly what they want
  }

  const flavorSegment = flavor === "test" ? "/webhook-test/" : "/webhook/";
  const root = stripApiSuffix(baseUrl);
  const cleaned = stripWebhookPrefixes(stripLeadingSlashes(path));
  return `${root}${flavorSegment}${cleaned}`;
}

function stripApiSuffix(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/api\/v1$/i, "");
}

function stripLeadingSlashes(s: string): string {
  return s.replace(/^\/+/, "");
}

function stripWebhookPrefixes(s: string): string {
  for (const p of WEBHOOK_PREFIXES) {
    const lower = "/" + s.toLowerCase();
    if (lower.startsWith(p)) return s.slice(p.length - 1);
  }
  return s;
}
