/**
 * @openwork/mcp — MCP client integration for ok-cli.
 *
 * Main entry point: `loadMcpTools()` reads mcp.json, connects to all
 * configured servers, and returns bridged AgentTools + a cleanup handle.
 *
 * Example:
 *   const mcp = await loadMcpTools()
 *   const allTools = [...DEFAULT_TOOLS, ...mcp.tools]
 *   // ... run agent ...
 *   await mcp.close()
 */

import type { AgentTool } from "@earendil-works/pi-agent-core"
import { bridgeMcpTool } from "./bridge.ts"
import { connectMcpServer } from "./client.ts"
import { readMcpConfig } from "./config.ts"

export * from "./config.ts"
export * from "./client.ts"
export * from "./bridge.ts"

export interface LoadedMcp {
  /** Bridged AgentTools from all connected MCP servers */
  tools: AgentTool[]
  /** Disconnect all MCP servers */
  close: () => Promise<void>
  /** How many servers successfully connected */
  serverCount: number
}

export interface LoadMcpOptions {
  /** Print connection status to stderr */
  verbose?: boolean
  /** Override config file path (default: ~/.config/ok-cli/mcp.json) */
  configPath?: string
}

/**
 * Load all MCP servers from the config file, connect, enumerate tools.
 *
 * Failed servers are reported as warnings but do not abort the startup.
 * Returns an empty LoadedMcp if no config file exists.
 */
export async function loadMcpTools(opts: LoadMcpOptions = {}): Promise<LoadedMcp> {
  const config = await readMcpConfig()

  if (!config || Object.keys(config.mcpServers).length === 0) {
    return { tools: [], close: async () => {}, serverCount: 0 }
  }

  const closeHandles: Array<() => Promise<void>> = []
  const tools: AgentTool[] = []
  let serverCount = 0

  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    try {
      if (opts.verbose) {
        process.stderr.write(`  MCP connecting: ${name}…\n`)
      }

      const conn = await connectMcpServer(name, serverConfig)
      closeHandles.push(conn.close)
      serverCount++

      for (const mcpTool of conn.tools) {
        tools.push(bridgeMcpTool(mcpTool, conn.client, name))
      }

      if (opts.verbose) {
        process.stderr.write(
          `  MCP ✓ ${name}: ${conn.tools.length} tool${conn.tools.length !== 1 ? "s" : ""}\n`
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`  MCP ⚠ "${name}" failed to connect: ${msg}\n`)
    }
  }

  return {
    tools,
    serverCount,
    close: async () => {
      await Promise.allSettled(closeHandles.map((fn) => fn()))
    },
  }
}
