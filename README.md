# MCP HTTP Proxy

Converts STDIO transport to HTTP transport for remote MCP (Model Context Protocol) servers, with automatic error handling for Claude Desktop compatibility.

## Features

- **STDIO to HTTP Bridge**: Enables Claude Desktop to connect to remote MCP servers
- **Error Handling**: Automatically fixes JSON-RPC errors that cause Zod validation failures
- **Notification Filtering**: Drops invalid error responses for notification messages
- **Empty Result Conversion**: Converts `-32601` errors to empty results for optional methods

## Quick Start

### Using npx (Recommended)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-remote-server": {
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

### Local Installation

```bash
git clone https://github.com/andremir/mcp-http-proxy
cd mcp-http-proxy
node index.js https://your-mcp-server.com/mcp
```

## Usage

```bash
mcp-http-proxy <mcp-server-url>
```

Example:
```bash
npx github:andremir/mcp-http-proxy https://mcp-search-brave-com-37svygdpla-uc.a.run.app/mcp
```

## Problem Solved

Remote MCP servers may return JSON-RPC error responses (`-32601 "Method not found"`) for:
- Optional methods (prompts/list, resources/list)
- Notification messages (notifications/initialized)

Claude Desktop's strict Zod validation rejects these error responses, causing connection errors.

This proxy intercepts and fixes these responses:
- **Drops** error responses for notifications (they shouldn't exist per JSON-RPC spec)
- **Converts** `-32601` errors to empty results for optional methods
- **Passes through** all other responses unchanged

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed deployment instructions and common issues.

## Requirements

- Node.js >= 14.0.0
- Claude Desktop

## License

MIT

## Author

Andre Miranda
