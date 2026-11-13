# n8n-nodes-workflows

[![npm version](https://img.shields.io/npm/v/@nonagentic/n8n-nodes-workflows.svg)](https://www.npmjs.com/package/@nonagentic/n8n-nodes-workflows)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/nonagenticai/n8n-nodes-workflows/actions/workflows/ci.yml/badge.svg)](https://github.com/nonagenticai/n8n-nodes-workflows/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/nonagenticai/n8n-nodes-workflows)](https://github.com/nonagenticai/n8n-nodes-workflows/releases)

An n8n community node for managing the workflows and executions of the **running n8n instance**
through its Public API — so one workflow can read, check, diff, write, publish and roll back other
workflows.

## Operations

**workflow**

- `list` — GET /workflows (filters: active, name, tags, limit, cursor).
- `get` — GET /workflows/{id}.
- `create` — POST /workflows (read-only fields stripped).
- `update` — PUT /workflows/{id}?publishIfActive=false: saves a **draft**; a published flow keeps its
  live version until `publish`.
- `delete` — DELETE /workflows/{id}. Waits out the 409 n8n returns right after `unpublish`; a 404 on
  a retry counts as deleted.
- `publish` — POST /workflows/{id}/publish; puts the latest draft (or a named `versionId`) live.
  409 on a webhook-path conflict or an open review.
- `unpublish` — POST /workflows/{id}/unpublish.
- `history` — GET /workflows/{id}/history (limit, cursor): the version list.
- `getVersion` — GET /workflows/{id}/versions/{versionId}: nodes and connections of one version.
- `restore` — reads a version and writes its nodes + connections back as a **draft** (current name
  and settings kept). Does not publish.
- `diff` — local structural diff (S8): base = `baselinePayload` / `fromVersionId` / live flow,
  target = `workflowPayload` / `toVersionId` / live flow. Returns nodesAdded/Removed/Changed
  (`parameters.<key>` granularity), nodesMoved (position only), edgesAdded/Removed,
  settingsChanged, nameChanged.
- `lint` — local house-standard check S1–S7 + S9 (`helpers/flowStandards.ts`); returns
  `{ ok, kind, standards, violations[] }`, never throws.
- `validate` — local structural check (unique named nodes, connections reference existing nodes).
- `transferOwnership` — PUT /workflows/{id}/transfer (admin only).

**execution**

- `list` — GET /executions. `get` — GET /executions/{id} (optional includeData). `delete` —
  DELETE /executions/{id}.

**webhook**

- `invoke` — calls a flow's webhook URL at `/webhook/{path}` or `/webhook-test/{path}`.

**Rollback = `restore` (draft) then `publish`.** The Public API has no server-side restore and no
version-diff endpoint; both are done here.

## Installation

### n8n GUI (recommended)

**Settings → Community Nodes → Install** → `@nonagentic/n8n-nodes-workflows`.

### Manual

```bash
npm install @nonagentic/n8n-nodes-workflows
```

Restart n8n afterwards.

## Credentials

Create an **n8n Workflows API** credential:

| Field | Required | Notes |
|---|---|---|
| **Base URL** | no | The n8n Public API base URL including `/api/v1`, e.g. `http://localhost:5678/api/v1`. Defaults to the `N8N_API_URL` env var. |
| **API Key** | **yes** | n8n Public API key — Settings → API → Create. Sent as `X-N8N-API-KEY`. |
| **Tenant ID** | no | Optional `X-Tenant-ID` header for a gateway in front of n8n that routes by tenant. |

Click **Test** — it should return *"API key valid and instance reachable"*.

## Examples

**Read a workflow as a draft and re-publish it**

```
Resource: workflow
Operation: get
Workflow ID: <id>
```

**Diff two versions before publishing**

```
Resource: workflow
Operation: diff
Workflow ID: <id>
From Version ID: <version-a>
To Version ID: <version-b>
```

**Trigger a flow by its webhook**

```
Resource: webhook
Operation: invoke
Webhook Path: my-flow
HTTP Method: POST
```

## Gotchas

- **A Webhook node defaults to GET.** Invoking it with POST returns `404 - This webhook is not
  registered for POST requests`. Set `httpMethod: "POST"` on the receiver.
- **`/webhook-test/...` is single-shot** — each invocation consumes the registration. Production
  webhooks on active workflows handle unlimited calls.
- **`create` rejects extras.** Publish in a separate step rather than setting `active: true` in the
  payload.
- **`transferOwnership` is admin-only** and 403s for a non-owner API key.
- **`webhook.invoke` does not forward `X-N8N-API-KEY` or `X-Tenant-ID`** — webhooks are
  public-by-path endpoints and control-plane headers do not belong on them.

## What this module is not

- It is not a wrapper around `IExecuteFunctions`; it talks to n8n over HTTP, the same way an
  external client would. That works the same in-cluster, against a remote n8n, or against a
  different version.
- It does not expose `workflow.execute` — the Public API does not. Triggering goes through
  `webhook.invoke`.
- It does not manage tags, variables or users; those endpoints exist but are out of scope here.

## Development

```bash
npm install
npm run build     # tsc + icons + generated reference docs
npm run lint
npm test
```

`npm run build` writes `dist/`, which is what the `n8n` block in `package.json` points at.

## Security

Report vulnerabilities privately through the repository's Security tab — see
[`SECURITY.md`](SECURITY.md). Do not open a public issue for a security problem.

## Contributing

Issues and pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the
development commands and the commit conventions. Commits carry DCO sign-off.

## License

[Apache-2.0](./LICENSE)
