# n8n Workflows Node Documentation

## Resources

### Workflow
- list, get, create, update, delete, publish, unpublish, history, getVersion, restore, diff, lint, validate, transferOwnership

`update` and `restore` save a draft (`publishIfActive=false`); `publish` puts a version live.

### Execution
- list, get, delete

### Webhook
- invoke

## Auth

- `X-N8N-API-KEY` (n8n Public API key)
- `X-Tenant-ID` (optional tenant header)

See README.md for full configuration.
