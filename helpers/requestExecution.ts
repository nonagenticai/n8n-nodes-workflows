import { IExecuteFunctions, NodeApiError } from "n8n-workflow";


// Methods that are idempotent by HTTP semantics (RFC 9110 SS9.2.2): re-sending
// one cannot change the outcome beyond the first application, so an HTTP 5xx is
// safe to retry. POST and PATCH are absent DELIBERATELY - see executeWithRetry.
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "PUT",
  "DELETE",
  "OPTIONS",
  "TRACE",
]);

export function isIdempotentMethod(method?: string): boolean {
  if (typeof method !== "string" || method.length === 0) return false;
  return IDEMPOTENT_METHODS.has(method.toUpperCase());
}

// Connection-layer failures. These carry no HTTP status, so the 5xx branch below
// never saw them: a `read ECONNRESET` was thrown on the FIRST attempt although the
// comment below always said transport failures retry. Measured 2026-10-31 23:38Z:
// the n8n main pod (this node's API target) was down 11s during a rollout and
// `Find flow` / `Find sub.card_action` failed at once, asking a person to unblock.
const TRANSIENT_NET_CODES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "EPIPE",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
]);
const TRANSIENT_NET_MESSAGE_RE = /socket hang up|connection (?:reset|aborted)|ECONNRESET|ECONNREFUSED/i;
// Failures that prove no request byte reached the server: safe to retry for ANY method.
const PRE_SEND_NET_CODES: ReadonlySet<string> = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

function netCode(error: any): string | undefined {
  const code = error?.code ?? error?.cause?.code ?? error?.error?.code;
  return typeof code === "string" ? code : undefined;
}

export function isTransientNetworkError(error: any): boolean {
  if (!error || typeof error !== "object") return false;
  const code = netCode(error);
  if (code !== undefined && TRANSIENT_NET_CODES.has(code)) return true;
  return typeof error.message === "string" && TRANSIENT_NET_MESSAGE_RE.test(error.message);
}

export function isPreSendNetworkError(error: any): boolean {
  const code = netCode(error);
  return code !== undefined && PRE_SEND_NET_CODES.has(code);
}

export class RetryingRequest {
  // 6 attempts, ~30s of backoff: covers an n8n main restart (11s measured) plus routing settle.
  private readonly RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000];
  private readonly MAX_RETRIES = this.RETRY_DELAYS.length + 1;

  async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    context: IExecuteFunctions,
    options?: { method?: string },
  ): Promise<T> {
    let lastError: Error;
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        return await requestFn();
      } catch (error: any) {
        lastError = error;
        const statusCode = error?.statusCode || error?.response?.status;
        if (statusCode === 401) {
          throw new NodeApiError(context.getNode(), error, {
            message: "Authentication failed",
            description: "Check the API key and the n8n base URL in credential settings.",
          });
        }
        if (statusCode === 403) {
          throw new NodeApiError(context.getNode(), error, {
            message: "Access denied",
            description: "These credentials do not permit this operation.",
          });
        }
        if (statusCode === 429) {
          throw new NodeApiError(context.getNode(), error, {
            message: "Rate limit exceeded",
            description: "Wait before retrying.",
          });
        }
        // An HTTP status means the server RESPONDED, so the request was delivered
        // and processed to some degree. For a NON-idempotent method that makes a
        // retry a double-apply risk: a 504 means the gateway stopped waiting for
        // an upstream that may well have committed the write. Transport failures
        // stay retryable for every method - delivery is unproven there.
        // An absent or unrecognised method fails SAFE: treated as non-idempotent.
        const idempotent = isIdempotentMethod(options?.method);
        const retryable =
          (statusCode === undefined && isPreSendNetworkError(error)) ||
          (idempotent && (statusCode >= 500 || (statusCode === undefined && isTransientNetworkError(error))));
        if (retryable && attempt < this.MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, this.RETRY_DELAYS[attempt]));
          continue;
        }
        throw error;
      }
    }
    throw lastError!;
  }
}
