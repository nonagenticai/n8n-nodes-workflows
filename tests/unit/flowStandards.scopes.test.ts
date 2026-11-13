import { describe, test, expect } from "@jest/globals";
import { lintFlowStandards } from "../../helpers/flowStandards";

/**
 * Module scope recognition.
 *
 * The estate registry serves `@nonagentic/*` and the public npm builds are
 * `@nonagenticai/*`. A tool node's type carries the scope of the package it was
 * installed from, so S5 must accept both and still reject anything else.
 */
function flowWithTool(toolType: string) {
  return {
    name: "cap.demo.one",
    nodes: [
      { name: "Agent doing judge", type: "@n8n/n8n-nodes-langchain.agent", parameters: {} },
      { name: "Artifacts Tool", type: toolType, parameters: {} },
    ],
    connections: {
      "Artifacts Tool": { ai_tool: [[{ node: "Agent doing judge", type: "ai_tool", index: 0 }]] },
    },
  };
}

/** The S5 violation the tool-type check adds, if any. */
function toolViolations(toolType: string): string[] {
  const { violations } = lintFlowStandards(flowWithTool(toolType)).standards.S5;
  return violations.filter((v) => v.includes("must be a module"));
}

describe("flow standards: module scopes", () => {
  test.each(["@nonagentic", "@nonagenticai"])(
    "S5 accepts a *Tool node from the %s scope",
    (scope) => {
      expect(toolViolations(`${scope}/n8n-nodes-artifacts.artifactsTool`)).toEqual([]);
    },
  );

  test("S5 still rejects a tool from a foreign scope", () => {
    expect(toolViolations("@evil/n8n-nodes-artifacts.artifactsTool")).not.toEqual([]);
  });

  test("S5 still rejects a non-Tool node from a known scope", () => {
    expect(toolViolations("@nonagenticai/n8n-nodes-artifacts.artifacts")).not.toEqual([]);
  });
});
