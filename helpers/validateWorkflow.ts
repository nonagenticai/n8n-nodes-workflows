/**
 * Generic workflow-validity check — payload edition (standard S7).
 *
 * Validates that a payload is a structurally valid, non-corrupt n8n workflow
 * of any shape: a name, non-empty uniquely named nodes with a type, and
 * connections that reference only existing nodes. Used by the `validate`
 * operation and by `lint` (flowStandards S7).
 *
 * Never throws on a contract violation: violations are returned as data. An
 * unusable input is reported as a violation, again as data, not an exception.
 */
import { IDataObject } from "n8n-workflow";

export interface WorkflowValidityResult {
  ok: boolean;
  violations: string[];
  nodeCount: number;
}

/**
 * Validate that `wf` is a structurally sound n8n workflow.
 * Returns structured data (never throws).
 */
export function validateWorkflowPayload(wf: unknown): WorkflowValidityResult {
  const violations: string[] = [];

  if (!wf || typeof wf !== "object" || Array.isArray(wf)) {
    return {
      ok: false,
      violations: ["workflow payload is not a JSON object"],
      nodeCount: 0,
    };
  }
  const w = wf as IDataObject;

  // 1. Name present and non-empty.
  if (typeof w.name !== "string" || w.name.trim() === "") {
    violations.push('workflow must have a non-empty string "name"');
  }

  // 2. Nodes: non-empty array.
  const nodes: IDataObject[] = Array.isArray(w.nodes)
    ? (w.nodes as IDataObject[])
    : [];
  if (!Array.isArray(w.nodes)) {
    violations.push('"nodes" must be an array');
  } else if (nodes.length === 0) {
    violations.push("workflow has no nodes");
  }

  // 3. Every node has a non-empty string name + type; collect names for ref + dup checks.
  const nodeNames = new Set<string>();
  const seenNames = new Set<string>();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n || typeof n !== "object" || Array.isArray(n)) {
      violations.push(`node at index ${i} is not an object`);
      continue;
    }
    const name = n.name;
    const type = n.type;
    if (typeof name !== "string" || name.trim() === "") {
      violations.push(`node at index ${i} is missing a string "name"`);
    } else {
      if (seenNames.has(name)) {
        violations.push(`duplicate node name "${name}" (node names must be unique)`);
      }
      seenNames.add(name);
      nodeNames.add(name);
    }
    if (typeof type !== "string" || type.trim() === "") {
      violations.push(
        `node "${typeof name === "string" ? name : i}" is missing a string "type"`,
      );
    }
  }

  // 4. Connections: object whose source keys + every target reference an existing node.
  const conns = w.connections;
  if (conns === undefined || conns === null) {
    violations.push('"connections" is missing (use {} for a node-less graph)');
  } else if (typeof conns !== "object" || Array.isArray(conns)) {
    violations.push('"connections" must be an object');
  } else {
    for (const [source, outputs] of Object.entries(conns as IDataObject)) {
      if (!nodeNames.has(source)) {
        violations.push(
          `connection source "${source}" references a node that does not exist`,
        );
      }
      // outputs shape: { main: [ [ {node,type,index}, ... ], ... ], ... }
      const groups = (outputs as IDataObject) || {};
      for (const connList of Object.values(groups)) {
        if (!Array.isArray(connList)) continue;
        for (const port of connList) {
          if (!Array.isArray(port)) continue;
          for (const c of port) {
            const target =
              c && typeof c === "object" ? (c as IDataObject).node : undefined;
            if (typeof target !== "string" || !nodeNames.has(target)) {
              violations.push(
                `connection from "${source}" targets node "${String(
                  target,
                )}" that does not exist`,
              );
            }
          }
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    nodeCount: nodes.length,
  };
}
