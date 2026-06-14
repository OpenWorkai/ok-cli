/**
 * MCP server configuration — reads ~/.config/ok-cli/mcp.json.
 *
 * Format is intentionally compatible with Claude Code's mcpServers schema
 * so users can copy-paste existing configs.
 */

import { homedir } from "os"
import { join } from "path"
import { readFile, writeFile, mkdir } from "fs/promises"

export const MCP_CONFIG_PATH = join(homedir(), ".config", "ok-cli", "mcp.json")

// ── Config shapes ─────────────────────────────────────────────────────────────

export interface StdioServerConfig {
  command: string
  args?: string[]
  /** Extra env vars merged into the child process environment */
  env?: Record<string, string>
  /** Working directory for the child process */
  cwd?: string
}

export interface SseServerConfig {
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = StdioServerConfig | SseServerConfig

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>
}

export function isStdioConfig(c: McpServerConfig): c is StdioServerConfig {
  return "command" in c
}

// ── Read / write helpers ──────────────────────────────────────────────────────

export async function readMcpConfig(): Promise<McpConfig | null> {
  try {
    const raw = await readFile(MCP_CONFIG_PATH, "utf8")
    return JSON.parse(raw) as McpConfig
  } catch {
    return null
  }
}

export async function writeMcpConfig(config: McpConfig): Promise<void> {
  await mkdir(join(homedir(), ".config", "ok-cli"), { recursive: true })
  await writeFile(MCP_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8")
}

export function emptyConfig(): McpConfig {
  return { mcpServers: {} }
}
