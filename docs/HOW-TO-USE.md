# How to use `n8n Workflows`

Drop-in n8n node for performing CRUD on workflows + executions of the **running n8n instance** and triggering workflows via their webhook URLs. The whole point: an n8n workflow can author, deploy, and test other n8n workflows.

---

## 1. One-time credential setup

Settings → Credentials → New → **n8n Workflows API**

| Field | Value |
|---|---|
| **Base URL** | leave empty to use `N8N_API_URL`, or set e.g. `http://localhost:5678/api/v1` |
| **API Key** | Settings → API → Create — copy the JWT |
| **Tenant ID** | leave empty unless a gateway in front of n8n routes by tenant |

Click **Test** — should return *"API key valid and instance reachable"*.

---

## 2. Resources at a glance

| Resource | Operations | Underlying n8n endpoint |
|---|---|---|
| **workflow** | list, get, create, update, delete, publish, unpublish, history, getVersion, restore, diff, lint, validate, transferOwnership | `/workflows[/{id}[/publish\|unpublish\|history\|versions/{versionId}\|transfer]]` (diff, lint, validate are local) |
| **execution** | list, get, delete | `/executions[/{id}]` |
| **webhook** | invoke | `/webhook/{path}` or `/webhook-test/{path}` |

> **Drafts vs. published.** `update` and `restore` always save a **draft** (`PUT ?publishIfActive=false`): a published flow keeps running its published version until you call `publish` (optionally with a `versionId`). `unpublish` takes a flow offline. (n8n v1 called these "activate"/"deactivate".)

> n8n's Public API does **not** expose `POST /workflows/{id}/execute` — the way to trigger a workflow is its webhook URL. That's what `webhook.invoke` does.

---

## 3. The author-test-inspect loop (the autonomous flow)

This is what the module exists for. All steps in one n8n workflow:

```
[Manual Trigger]
    ↓
[n8n Workflows: workflow.create]   ← drop your nodes/connections JSON in
    ↓
[n8n Workflows: workflow.publish]  ← needs the {{ $json.id }} from previous
    ↓
[Wait 1s]                          ← let the webhook register
    ↓
[n8n Workflows: webhook.invoke]    ← POST a test payload at the new workflow
    ↓
[n8n Workflows: execution.list]    ← filter by the new workflowId
    ↓
[n8n Workflows: execution.get]     ← inspect the latest execution's data
    ↓
[n8n Workflows: workflow.delete]   ← clean up if it was a smoke test
```

A driver workflow can iterate on `workflow.update` + re-invoke until the target produces the expected output, then `workflow.publish` it — each `update` is only a draft until then.

---

## 4. Concrete examples

### Create a workflow

`workflow` → `create`. Paste a full workflow JSON into **Workflow JSON**:

```json
{
  "name": "my-new-flow",
  "nodes": [
    { "id": "t", "name": "Webhook", "type": "n8n-nodes-base.webhook",
      "typeVersion": 2, "position": [240,240],
      "parameters": { "path": "my-flow", "httpMethod": "POST",
                      "responseMode": "lastNode", "options": {} },
      "webhookId": "my-flow-id" }
  ],
  "connections": {},
  "settings": {}
}
```

The op auto-strips the readonly fields (`id`, `versionId`, `active`, `tags`, `meta`, `createdAt`, `updatedAt`, `shared`, `homeProject`, `isArchived`, `triggerCount`) before POST — n8n rejects them otherwise — and never sends `staticData` (runtime trigger state). `nodeGroups`, `description`, `pinData` and `parentFolderId` are carried. Returns the created workflow including the new `id`.

### Publish it

`workflow` → `publish`. **Workflow ID** = `{{ $json.id }}`. Leave **Version ID** empty to publish the current draft.

### Trigger via webhook

`webhook` → `invoke`:

| Field | Value |
|---|---|
| Webhook Path | `my-flow` *(or `/webhook/my-flow`, or full URL — all collapse to the same target)* |
| HTTP Method | POST |
| Webhook Flavor | Production |
| Body | `={{ { hello: "world" } }}` |

**The response body of the receiver becomes the next node's input.** This is how the driver gets the test result back synchronously — make the receiver use `responseMode: "lastNode"`.

`webhookFlavor: test` targets `/webhook-test/{path}` — single-use, only works while the n8n UI has *"Listen for test event"* enabled. Use `production` for autonomous flows.

### Inspect what just ran

`execution` → `list` with filters `{ workflowId: "<id>", limit: 1, includeData: true }`, then `execution` → `get` for the full data tree.

### Clean up

`workflow` → `unpublish`, then `workflow` → `delete`.

---

## 5. List + filter examples

`workflow` → `list` with **Filters**:
- `active: true` — only published ones
- `tags: "my-tag"` — comma-separated
- `limit: 100`, `cursor: "..."` — pagination (n8n returns `nextCursor`)

`execution` → `list` with **Filters**:
- `workflowId: "<id>"`
- `status: success | error | waiting`
- `includeData: true` — pulls the full input/output tree (heavy; use only in `execution.get`)
- `limit`, `cursor` — pagination

The node auto-unwraps n8n's `{ data: [...], nextCursor }` envelope into one item per row.

---

## 6. Gotchas

- **Webhook node default is GET.** If you build a workflow with a Webhook trigger and try to POST to it via `webhook.invoke`, you'll get `404 - This webhook is not registered for POST requests`. Set `httpMethod: "POST"` on the receiver's Webhook node.
- **`/webhook-test/...` is single-shot.** Each invocation consumes the registration. You then have to click "Listen for test event" again. Production webhooks (active workflows) handle unlimited calls.
- **Workflow.create rejects extras.** Don't try to set `active: true` in the create payload — publish it in a separate step. Same for `tags` (use the tags API after creation).
- **`transferOwnership` is admin-only.** Will 403 unless your API key belongs to a workspace owner.
- **`webhook.invoke` does NOT forward `X-N8N-API-KEY` or `X-Tenant-ID`.** Webhooks are public-by-path endpoints; control-plane headers don't belong on them.

---

## 7. What this module is *not*

- It's not a wrapper around n8n's internal `IExecuteFunctions` — it talks to n8n over HTTP, the same way an external client would. That's deliberate: it works the same in-cluster, against a remote n8n, or against a different version.
- It does not expose `workflow.execute` because the Public API doesn't. Triggering goes through `webhook.invoke` only. (Form/chat triggers also work — they're served at `/webhook/...` too.)
- It does not manage tags, variables, or users — those endpoints exist on n8n's Public API but are out of scope for this module's purpose (workflow lifecycle).

