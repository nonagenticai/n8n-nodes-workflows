const fs = require('fs');
const path = require('path');

console.log('Generating documentation for n8n-nodes-workflows...');

try {
  const docsDir = path.join(__dirname, 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Op lists come from the built resource definitions (this runs postbuild),
  // so the docs can never drift from the node.
  const r = require('./dist/nodes/Workflows/resources');
  const ops = (p) => p.options.map((o) => o.value);
  const resources = {
    workflow: ops(r.workflowOperations),
    execution: ops(r.executionOperations),
    webhook: ops(r.webhookOperations)
  };

  const reference = {
    name: 'n8n Workflows Node',
    version: require('./package.json').version,
    resources,
    description: 'CRUD on n8n workflows + executions of the running n8n instance via the Public API'
  };

  fs.writeFileSync(
    path.join(docsDir, 'workflows-reference.json'),
    JSON.stringify(reference, null, 2)
  );
  console.log('✓ Created workflows-reference.json');

  const indexContent = `# n8n Workflows Node Documentation

## Resources

### Workflow
- ${resources.workflow.join(', ')}

\`update\` and \`restore\` save a draft (\`publishIfActive=false\`); \`publish\` puts a version live.

### Execution
- ${resources.execution.join(', ')}

### Webhook
- ${resources.webhook.join(', ')}

## Auth

- \`X-N8N-API-KEY\` (n8n Public API key)
- \`X-Tenant-ID\` (optional tenant header)

See README.md for full configuration.
`;

  fs.writeFileSync(path.join(docsDir, 'INDEX.md'), indexContent);
  console.log('✓ Created INDEX.md');
  console.log('✓ Documentation generated successfully');
} catch (error) {
  console.error('Error generating documentation:', error);
  process.exit(0);
}
