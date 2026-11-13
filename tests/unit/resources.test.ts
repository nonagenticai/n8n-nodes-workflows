import { describe, test, expect } from "@jest/globals";
import {
  resourceSelector,
  workflowOperations,
  executionOperations,
  webhookOperations,
  workflowFields,
  executionFields,
  webhookFields,
} from "../../nodes/Workflows/resources";

describe("resources/index", () => {
  test("resourceSelector lists workflow + execution + webhook", () => {
    expect(resourceSelector.name).toBe("resource");
    const values = (resourceSelector.options as Array<{ value: string }>).map(
      (o) => o.value,
    );
    expect(values).toEqual(["workflow", "execution", "webhook"]);
    expect(resourceSelector.default).toBe("workflow");
  });

  test("webhookOperations is scoped to webhook resource", () => {
    const values = (webhookOperations.options as Array<{ value: string }>).map(
      (o) => o.value,
    );
    expect(values).toEqual(["invoke"]);
    expect(webhookOperations.displayOptions?.show?.resource).toEqual([
      "webhook",
    ]);
  });

  test("webhookFields are scoped to webhook resource", () => {
    for (const f of webhookFields) {
      expect(f.displayOptions?.show?.resource).toEqual(["webhook"]);
    }
  });

  test("workflowOperations covers all 14 ops with proper displayOptions", () => {
    const values = (
      workflowOperations.options as Array<{ value: string }>
    ).map((o) => o.value);
    expect(values).toEqual([
      "list",
      "get",
      "create",
      "update",
      "delete",
      "publish",
      "unpublish",
      "history",
      "getVersion",
      "restore",
      "diff",
      "lint",
      "validate",
      "transferOwnership",
    ]);
    expect(workflowOperations.displayOptions?.show?.resource).toEqual([
      "workflow",
    ]);
  });

  test("executionOperations covers all 3 ops", () => {
    const values = (
      executionOperations.options as Array<{ value: string }>
    ).map((o) => o.value);
    expect(values).toEqual(["list", "get", "delete"]);
    expect(executionOperations.displayOptions?.show?.resource).toEqual([
      "execution",
    ]);
  });

  test("execution.get exposes includeData; execution.list status offers new and running (R311 PR 4)", () => {
    const inc = executionFields.find((f) => f.name === "includeData");
    expect(inc?.type).toBe("boolean");
    expect(inc?.default).toBe(false);
    expect(inc?.displayOptions?.show?.operation).toEqual(["get"]);
    const filters = executionFields.find((f) => f.name === "filters") as any;
    const status = filters.options.find((o: any) => o.name === "status");
    expect(status.type).toBe("options");
    expect(status.options.map((o: any) => o.value)).toEqual(
      expect.arrayContaining(["success", "error", "waiting", "new", "running"]),
    );
  });

  test("each field is scoped via displayOptions to its resource", () => {
    for (const f of workflowFields) {
      expect(f.displayOptions?.show?.resource).toEqual(["workflow"]);
    }
    for (const f of executionFields) {
      expect(f.displayOptions?.show?.resource).toEqual(["execution"]);
    }
  });
});
