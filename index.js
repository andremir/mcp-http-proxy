#!/usr/bin/env node

/**
 * MCP HTTP Proxy - Converts STDIO to HTTP for remote MCP servers
 * Usage: mcp-http-proxy <mcp-server-url>
 * Example: mcp-http-proxy https://mcp-perplexity-37svygdpla-uc.a.run.app/mcp
 */

const https = require('https');
const http = require('http');
const readline = require('readline');

// Get MCP server URL from command line
const serverUrl = process.argv[2];

if (!serverUrl) {
  console.error('Error: MCP server URL required');
  console.error('Usage: mcp-http-proxy <mcp-server-url>');
  console.error('Example: mcp-http-proxy https://example.com/mcp');
  process.exit(1);
}

let url;
try {
  url = new URL(serverUrl);
} catch (error) {
  console.error(`Error: Invalid URL: ${serverUrl}`);
  process.exit(1);
}

const isHttps = url.protocol === 'https:';
const httpModule = isHttps ? https : http;

// Create readline interface for STDIO
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Process each JSON-RPC message from stdin
rl.on('line', (line) => {
  if (!line.trim()) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch (e) {
    // Invalid JSON, pass through as-is
  }

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(line)
    }
  };

  const req = httpModule.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      // Intercept -32601 errors for optional methods and return empty results
      try {
        const response = JSON.parse(data);
        const method = request ? request.method : 'unknown';
        const requestId = request ? request.id : undefined;

        // Drop error responses for notifications (they have no ID and shouldn't get responses)
        if (response.error && response.error.code === -32601 && requestId === undefined) {
          process.stderr.write(`[PROXY] Dropped -32601 error for notification: ${method}\n`);
          return; // Don't send any response for notifications
        }

        // Convert "Method not found" to empty results for optional MCP methods
        if (response.error && response.error.code === -32601 && request) {
          if (method === 'prompts/list') {
            const converted = JSON.stringify({ jsonrpc: '2.0', id: requestId, result: { prompts: [] } });
            console.log(converted);
            process.stderr.write(`[PROXY] Converted prompts/list error to empty result\n`);
            return;
          } else if (method === 'resources/list') {
            const converted = JSON.stringify({ jsonrpc: '2.0', id: requestId, result: { resources: [] } });
            console.log(converted);
            process.stderr.write(`[PROXY] Converted resources/list error to empty result\n`);
            return;
          }
        }
      } catch (e) {
        process.stderr.write(`[PROXY] Parse error: ${e.message}\n`);
      }
      // Pass through all other responses unchanged
      console.log(data);
    });
  });

  req.on('error', (error) => {
    console.error(`HTTP Error: ${error.message}`);
  });

  req.write(line);
  req.end();
});

// Handle process termination
process.on('SIGTERM', () => {
  rl.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  rl.close();
  process.exit(0);
});

// Log startup to stderr (won't interfere with STDIO)
process.stderr.write(`MCP HTTP Proxy started: ${serverUrl}\n`);
