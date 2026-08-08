/**
 * Peer communication tools for ok-cli agents.
 */

import type { AgentTool } from "@earendil-works/pi-agent-core"
import { Type } from "@sinclair/typebox"
import { findPeer, listPeers, sendMessage } from "@openwork/peer"

// ─── list_peers ──────────────────────────────────────────────────────────────

const ListPeersParams = Type.Object({
  filter: Type.Optional(
    Type.Union([Type.Literal("all"), Type.Literal("active"), Type.Literal("idle")], {
      description: "Filter peers by status (default: all)",
    })
  ),
})

export const listPeersTool: AgentTool<typeof ListPeersParams> = {
  name: "list_peers",
  label: "List Peers",
  description:
    "List other ok-cli sessions on this machine. Returns session IDs, aliases, working directories, and status.",
  parameters: ListPeersParams,
  execute: async (_id, params) => {
    const peers = listPeers(params.filter)
    if (peers.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No other ok-cli sessions found." }],
        details: {},
      }
    }

    const lines = peers.map((p) => {
      const alias = p.alias ? ` (${p.alias})` : ""
      return `[${p.sessionId}]${alias} ${p.status} @ ${p.cwd}`
    })

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      details: { peerCount: peers.length },
    }
  },
}

// ─── message_peer ────────────────────────────────────────────────────────────

const MessagePeerParams = Type.Object({
  to: Type.String({ description: "Target session ID or alias" }),
  content: Type.String({ description: "Message content (plain text)" }),
})

export const messagePeerTool: AgentTool<typeof MessagePeerParams> = {
  name: "message_peer",
  label: "Message Peer",
  description:
    "Send a text message to another ok-cli session. The message will be queued in the target session's inbox.",
  parameters: MessagePeerParams,
  execute: async (_id, params, context) => {
    // Find target peer
    const target = findPeer(params.to)
    if (!target) {
      throw new Error(`Peer not found: ${params.to}`)
    }

    // Get sender session ID from context (passed by CLI)
    const from = (context as { sessionId?: string }).sessionId ?? "unknown"

    // Send message
    const messageId = sendMessage(from, target.sessionId, params.content)

    return {
      content: [
        {
          type: "text" as const,
          text: `Message sent to [${target.sessionId}]${target.alias ? ` (${target.alias})` : ""}\nMessage ID: ${messageId}`,
        },
      ],
      details: { messageId, to: target.sessionId },
    }
  },
}

export const PEER_TOOLS: AgentTool[] = [listPeersTool, messagePeerTool]
