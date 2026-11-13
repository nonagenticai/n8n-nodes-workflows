import { RetryingRequest } from "../../helpers/requestExecution";

const ctx = { getNode: () => ({ name: "Find flow" }) } as any;

function auth(): RetryingRequest {
  const a = new RetryingRequest();
  (a as any).RETRY_DELAYS = [0, 0, 0, 0, 0];
  return a;
}

function failing(errors: any[], result = { ok: true }) {
  let calls = 0;
  const fn = async () => {
    const e = errors[calls++];
    if (e) throw e;
    return result;
  };
  return { fn, calls: () => calls };
}

const reset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5678"), { code: "ECONNREFUSED" });

describe("RetryingRequest.executeWithRetry transport failures", () => {
  it("retries a GET through socket resets (n8n main restart) and returns", async () => {
    const f = failing([reset, reset, reset]);
    await expect(auth().executeWithRetry(f.fn, ctx, { method: "GET" })).resolves.toEqual({ ok: true });
    expect(f.calls()).toBe(4);
  });

  it("gives up after the backoff budget and rethrows the transport error", async () => {
    const f = failing(Array(10).fill(reset));
    await expect(auth().executeWithRetry(f.fn, ctx, { method: "GET" })).rejects.toBe(reset);
    expect(f.calls()).toBe(6);
  });

  it("never re-sends a POST after a reset (the write may have landed)", async () => {
    const f = failing([reset]);
    await expect(auth().executeWithRetry(f.fn, ctx, { method: "POST" })).rejects.toBe(reset);
    expect(f.calls()).toBe(1);
  });

  it("re-sends a POST when the connect was refused (nothing was sent)", async () => {
    const f = failing([refused, refused]);
    await expect(auth().executeWithRetry(f.fn, ctx, { method: "POST" })).resolves.toEqual({ ok: true });
    expect(f.calls()).toBe(3);
  });

  it("still fails a 4xx at once", async () => {
    const f = failing([Object.assign(new Error("not found"), { statusCode: 404 })]);
    await expect(auth().executeWithRetry(f.fn, ctx, { method: "GET" })).rejects.toThrow("not found");
    expect(f.calls()).toBe(1);
  });
});
