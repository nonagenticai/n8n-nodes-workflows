import { describe, test, expect } from "@jest/globals";
import { validateWorkflowPayload } from "../../helpers/validateWorkflow";

/** A structurally valid (non-cell) n8n workflow. */
function validWorkflow() {
  return {
    name: "Some Business Workflow",
    nodes: [
      { name: "Webhook", type: "n8n-nodes-base.webhook", parameters: {} },
      { name: "HTTP", type: "n8n-nodes-base.httpRequest", parameters: {} },
      { name: "Set", type: "n8n-nodes-base.set", parameters: {} },
    ],
    connections: {
      Webhook: { main: [[{ node: "HTTP", type: "main", index: 0 }]] },
      HTTP: { main: [[{ node: "Set", type: "main", index: 0 }]] },
    },
    settings: {},
  };
}

describe("validateWorkflowPayload — valid workflows", () => {
  test("a structurally sound, non-cell workflow passes", () => {
    const r = validateWorkflowPayload(validWorkflow());
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.nodeCount).toBe(3);
  });

  test("httpRequest and many nodes are fine (validate checks structure, not node types)", () => {
    const wf = validWorkflow();
    for (let i = 0; i < 20; i++) {
      wf.nodes.push({ name: `Extra ${i}`, type: "n8n-nodes-base.noOp", parameters: {} });
    }
    const r = validateWorkflowPayload(wf);
    expect(r.ok).toBe(true);
    expect(r.nodeCount).toBe(23);
  });

  test("empty connections object is valid", () => {
    const wf = validWorkflow();
    wf.connections = {};
    expect(validateWorkflowPayload(wf).ok).toBe(true);
  });
});

describe("validateWorkflowPayload — corruption the RFC-6902 patch can produce", () => {
  test("non-object payload", () => {
    const r = validateWorkflowPayload("nope" as unknown);
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toMatch(/not a JSON object/);
  });

  test("empty nodes array", () => {
    const wf = validWorkflow();
    wf.nodes = [];
    const r = validateWorkflowPayload(wf);
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("workflow has no nodes");
  });

  test("missing name", () => {
    const wf = validWorkflow() as Record<string, unknown>;
    delete wf.name;
    const r = validateWorkflowPayload(wf);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => /name/.test(v))).toBe(true);
  });

  test("dangling connection target (deleted node still referenced)", () => {
    const wf = validWorkflow();
    wf.nodes = wf.nodes.filter((n) => n.name !== "Set"); // remove target, keep the edge
    const r = validateWorkflowPayload(wf);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => /targets node "Set" that does not exist/.test(v))).toBe(true);
  });

  test("connection source references a non-existent node", () => {
    const wf = validWorkflow();
    (wf.connections as Record<string, unknown>)["Ghost"] = {
      main: [[{ node: "Set", type: "main", index: 0 }]],
    };
    const r = validateWorkflowPayload(wf);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => /source "Ghost"/.test(v))).toBe(true);
  });

  test("duplicate node names", () => {
    const wf = validWorkflow();
    wf.nodes.push({ name: "Set", type: "n8n-nodes-base.set", parameters: {} });
    const r = validateWorkflowPayload(wf);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => /duplicate node name "Set"/.test(v))).toBe(true);
  });

  test("node missing a type", () => {
    const wf = validWorkflow();
    wf.nodes.push({ name: "Typeless", parameters: {} } as never);
    const r = validateWorkflowPayload(wf);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => /Typeless".*type|type.*Typeless/.test(v))).toBe(true);
  });
});
