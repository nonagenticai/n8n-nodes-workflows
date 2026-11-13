import { describe, test, expect } from "@jest/globals";
import {
  cleanWorkflowPayload,
  READONLY_WORKFLOW_FIELDS,
} from "../../helpers/cleanWorkflowPayload";

describe("cleanWorkflowPayload", () => {
  test("strips readonly fields, carries every field PUT accepts", () => {
    const dirty = {
      id: "abc",
      versionId: "v1",
      active: true,
      tags: [{ id: "t1" }],
      meta: { foo: "bar" },
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
      staticData: {},
      pinData: {},
      shared: [],
      homeProject: { id: "p1" },
      isArchived: false,
      triggerCount: 5,
      name: "smoke-test",
      nodes: [],
      connections: {},
      settings: {},
      nodeGroups: [{ id: "g1", name: "G", nodeIds: [] }],
      description: "d",
      activeVersion: { versionId: "v1" },
    };
    const clean = cleanWorkflowPayload(dirty);
    for (const field of READONLY_WORKFLOW_FIELDS) {
      expect((clean as Record<string, unknown>)[field]).toBeUndefined();
    }
    expect(clean).toEqual({
      name: "smoke-test",
      nodes: [],
      connections: {},
      settings: {},
      nodeGroups: [{ id: "g1", name: "G", nodeIds: [] }],
      description: "d",
      pinData: {},
    });
  });

  test("accepts a JSON string and parses it", () => {
    const json = JSON.stringify({
      name: "from-string",
      nodes: [],
      connections: {},
      settings: {},
    });
    const clean = cleanWorkflowPayload(json);
    expect(clean.name).toBe("from-string");
  });

  test("defaults missing connections and settings to empty objects", () => {
    const clean = cleanWorkflowPayload({ name: "minimal", nodes: [] });
    expect(clean.connections).toEqual({});
    expect(clean.settings).toEqual({});
  });

  test("rejects payload without a name", () => {
    expect(() => cleanWorkflowPayload({ nodes: [] })).toThrow(/name/);
  });

  test("rejects payload without a nodes array", () => {
    expect(() => cleanWorkflowPayload({ name: "x" })).toThrow(/nodes/);
  });

  test("rejects invalid JSON", () => {
    expect(() => cleanWorkflowPayload("{not json")).toThrow(/JSON/);
  });

  test("rejects non-object input", () => {
    expect(() => cleanWorkflowPayload(null)).toThrow(/object/);
  });
});
