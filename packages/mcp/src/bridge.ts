/**
 * MCP → AgentTool bridge.
 *
 * Converts each MCP Tool definition into an AgentTool that pi-agent-core
 * can schedule, execute, and surface to the model.
 *
 * Design notes:
 * - MCP inputSchema is arbitrary JSON Schema → wrapped with Type.Unsafe() so
 *   TypeBox doesn't try to validate it — the MCP server validates on its side.
 * - MCP text content  → TextContent  (passed as-is)
 * - MCP image content → ImageContent (base64, mapped to Anthropic source format)
 * - EmbeddedResource / AudioContent → serialised to JSON text
 * - isError → throw, so pi-agent-core marks the call as failed
 */

import type { AgentTool } from "@earendil-works/pi-agent-core"
import type { Client, Tool as McpTool } from "@modelcontextprotocol/client"
import { Type } from "@sinclair/typebox"

// pi-ai content types (Anthropic-shaped)
type TextContent = { type: "text"; text: string }
type ImageContent = {
  type: "image"
  source: { type: "base64"; media_type: string; data: string }
}
type AgentContent = TextContent | ImageContent

export function bridgeMcpTool(mcpTool: McpTool, client: Client, serverName: string): AgentTool {
  // Wrap the raw JSON Schema with TypeBox's escape hatch.
  // pi-agent-core will pass it through to the model as-is for tool declarations.
  const parameters = Type.Unsafe<Record<string, unknown>>(
    mcpTool.inputSchema ?? { type: "object", properties: {}, required: [] }
  )

  return {
    name: mcpTool.name,
    // Label shown in the CLI tool-use display
    label: `[${serverName}] ${mcpTool.name}`,
    description: mcpTool.description ?? `${mcpTool.name} (from ${serverName})`,
    parameters,

    execute: async (_toolCallId, params) => {
      const result = await client.callTool({
        name: mcpTool.name,
        arguments: params as Record<string, unknown>,
      })

      // Convert MCP content blocks to AgentContent
      const content: AgentContent[] = []
      for (const block of result.content ?? []) {
        if (block.type === "text") {
          content.push({ type: "text", text: block.text as string })
        } else if (block.type === "image") {
          content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: block.mimeType ?? "image/png",
              data: block.data,
            },
          })
        } else {
          // audio, embeddedResource, resourceLink, etc. → stringify
          content.push({
            type: "text",
            text: JSON.stringify(block, null, 2),
          })
        }
      }

      if (content.length === 0) {
        content.push({ type: "text", text: "(empty response)" })
      }

      // MCP signals tool errors via isError rather than throwing
      if (result.isError) {
        const errorText = content
          .filter((c): c is TextContent => c.type === "text")
          .map((c) => c.text)
          .join("\n")
        throw new Error(errorText || "MCP tool returned an error")
      }

      return {
        content,
        details: { server: serverName, tool: mcpTool.name },
      }
    },
  }
}
