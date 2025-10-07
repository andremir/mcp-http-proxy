# MCP HTTP Proxy - Troubleshooting Guide

## Zod Validation Errors with Remote MCP Servers

### Problem
When connecting Claude Desktop to remote MCP servers via HTTP proxy, you may see Zod validation errors appear as notifications during initialization:

```
MCP brave: [{ "code": "invalid_union", "unionErrors": [{ "issues": [{
  "code": "invalid_type", "expected": "string", "received": "null",
  "path": ["id"], "message": "Expected string, received null" }]...
```

These errors appear even though the MCP server connection works and tools are available.

### Root Cause

The issue occurs when remote MCP servers return **JSON-RPC error responses** (`-32601 "Method not found"`) for:

1. **Optional MCP methods** like:
   - `prompts/list` - MCP servers without prompt support
   - `resources/list` - MCP servers without resource support

2. **Notification messages** like:
   - `notifications/initialized` - Notifications shouldn't receive responses per JSON-RPC spec

Claude Desktop's strict Zod validation rejects these error responses because:
- Error responses have `"id": null` instead of the request ID
- Notifications shouldn't receive any response (violates JSON-RPC spec)
- The `error` field doesn't match expected response schemas

### Solution

The HTTP proxy intercepts these problematic responses and:

1. **Drops error responses for notifications** (they shouldn't exist)
2. **Converts `-32601` errors to empty results** for optional methods:
   - `prompts/list` → `{"prompts": []}`
   - `resources/list` → `{"resources": []}`
3. **Passes through all other responses** unchanged

### Implementation

The fix is in `/tmp/mcp-http-proxy/index.js` lines 70-102:

```javascript
res.on('end', () => {
  try {
    const response = JSON.parse(data);
    const method = request ? request.method : 'unknown';
    const requestId = request ? request.id : undefined;

    // Drop error responses for notifications (no ID = notification)
    if (response.error && response.error.code === -32601 && requestId === undefined) {
      process.stderr.write(`[PROXY] Dropped -32601 error for notification: ${method}\n`);
      return; // Don't send any response
    }

    // Convert "Method not found" to empty results for optional MCP methods
    if (response.error && response.error.code === -32601 && request) {
      if (method === 'prompts/list') {
        const converted = JSON.stringify({ jsonrpc: '2.0', id: requestId, result: { prompts: [] } });
        console.log(converted);
        return;
      } else if (method === 'resources/list') {
        const converted = JSON.stringify({ jsonrpc: '2.0', id: requestId, result: { resources: [] } });
        console.log(converted);
        return;
      }
    }
  } catch (e) {
    process.stderr.write(`[PROXY] Parse error: ${e.message}\n`);
  }
  // Pass through all other responses unchanged
  console.log(data);
});
```

### Why Other Connectors Don't Have This Issue

Local MCP servers typically implement stub handlers that return empty results instead of errors:

```javascript
// Good: Returns empty array
async function listPrompts() {
  return { prompts: [] };
}

// Bad: Returns error (causes Zod validation failures)
async function listPrompts() {
  throw new Error("Method not found");
}
```

Remote MCP servers deployed via frameworks may not implement these stubs, returning `-32601` errors instead.

### Deployment Instructions

#### Option 1: Using npx with wrapper (Recommended)

If you have multiple Node versions via nvm, Claude Desktop may use the wrong Node version causing `Cannot find module 'node:path'` errors. Use the wrapper script:

1. Clone the repository:
```bash
git clone https://github.com/andremir/mcp-http-proxy /tmp/mcp-http-proxy
chmod +x /tmp/mcp-http-proxy/npx-wrapper.sh
```

2. Edit the wrapper to use your working Node version:
```bash
# Edit /tmp/mcp-http-proxy/npx-wrapper.sh
# Change NODE_VERSION="v22.20.0" to your version
```

3. Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "your-server-name": {
      "type": "stdio",
      "command": "/tmp/mcp-http-proxy/npx-wrapper.sh",
      "args": [
        "-y",
        "github:andremir/mcp-http-proxy",
        "https://your-mcp-server.com/mcp"
      ],
      "autoApprove": [],
      "disabled": false,
      "timeout": 60
    }
  }
}
```

The wrapper forces npx to use the correct Node version, bypassing PATH issues.

#### Option 2: Direct npx (if you don't use nvm)

If you have a single Node installation, use npx directly:

```json
{
  "mcpServers": {
    "your-server-name": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "github:andremir/mcp-http-proxy",
        "https://your-mcp-server.com/mcp"
      ]
    }
  }
}
```

#### Option 3: Local file (fallback)

```bash
git clone https://github.com/andremir/mcp-http-proxy /tmp/mcp-http-proxy
```

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "your-server-name": {
      "type": "stdio",
      "command": "/path/to/node",
      "args": [
        "/tmp/mcp-http-proxy/index.js",
        "https://your-mcp-server.com/mcp"
      ],
      "autoApprove": [],
      "disabled": false,
      "timeout": 60
    }
  }
}
```

**Important**: Use the full path to node (e.g., from `which node` or `~/.nvm/versions/node/vX.X.X/bin/node`).

#### 3. Verify Installation
Check logs at `~/Library/Logs/Claude/mcp-server-{name}.log` for:

```
MCP HTTP Proxy started: https://your-mcp-server.com/mcp
[PROXY] Dropped -32601 error for notification: notifications/initialized
[PROXY] Converted prompts/list error to empty result
[PROXY] Converted resources/list error to empty result
```

**No Zod errors should appear.**

#### 4. Test the Connection
In Claude Desktop, you should see your MCP tools available without any error notifications.

### Common Issues

#### Error: `spawn mcp-http-proxy ENOENT`
- **Cause**: Package not installed or npx not found
- **Solution**: Use full node path and direct file path instead of package name

#### Error: `Cannot find module 'node:path'`
- **Cause**: Corrupted npm installation
- **Solution**: Run proxy directly with node, bypassing npm/npx

#### Error: `{"detail":"Not Found"}`
- **Cause**: Missing `/mcp` path in URL
- **Solution**: Ensure URL ends with `/mcp` (e.g., `https://server.com/mcp`)

#### Errors still appearing after fix
- **Cause**: Claude Desktop cached the old proxy
- **Solution**: Fully quit Claude Desktop (Cmd+Q) and restart

### Testing Other MCP Servers

To test if a remote MCP server will have this issue:

```bash
# Send a prompts/list request
curl -X POST https://your-server.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"prompts/list","params":{},"id":1}'

# If you get: {"error":{"code":-32601,...}} → Will need proxy fix
# If you get: {"result":{"prompts":[]}} → Works without proxy fix
```

### References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [MCP HTTP Proxy Repository](https://github.com/andremir/mcp-http-proxy)

---

**Last Updated**: October 2024
**Tested With**: Claude Desktop, Node.js v22.9.0, Brave Search MCP Server
