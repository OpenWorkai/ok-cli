/**
 * MCP client — connects to a single MCP server and exposes its tools.
 *
 * Supports stdio (spawn a child process) and SSE transports.
 * Connection lifecycle: connect → listTools → use → close.
 */

import { Client, type Tool as McpTool, SSEClientTransport } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { isStdioConfig } from "./config.ts"
import type { McpServerConfig } from "./config.ts"

export interface McpConnection {
  /** Server name (key from mcp.json) */
  name: string
  /** Underlying MCP client — use to call tools */
  client: Client
  /** Available tools from this server */
  tools: McpTool[]
  /** Disconnect and clean up */
  close: () => Promise<void>
}

/**
 * Connect to a single MCP server and list its tools.
 * Throws if the connection or initial handshake fails.
 */
export async function connectMcpServer(
  name: string,
  config: McpServerConfig
): Promise<McpConnection> {
  const client = new Client({ name: "ok-cli", version: "0.1.0" }, { capabilities: { tools: {} } })

  let transport: StdioClientTransport | SSEClientTransport

  if (isStdioConfig(config)) {
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      // Merge caller-supplied env into the current process environment
      env: config.env ? { ...(process.env as Record<string, string>), ...config.env } : undefined,
      cwd: config.cwd,
    })
  } else {
    transport = new SSEClientTransport(new URL(config.url))
  }

  await client.connect(transport)

  const { tools } = await client.listTools()

  return {
    name,
    client,
    tools,
    close: () => client.close(),
  }
}
