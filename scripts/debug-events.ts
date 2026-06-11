#!/usr/bin/env bun
/**
 * Debug script — dumps all raw AgentEvents to stdout so we can
 * see the exact event shape emitted by pi-agent-core.
 */

import { createSession } from "@openwork/core"
import { DEFAULT_TOOLS } from "@openwork/tools"
import type { AgentEvent } from "@earendil-works/pi-agent-core"

const apiKey = process.env.ANTHROPIC_API_KEY
const provider = "anthropic"
// NVIDIA API via Anthropic-compatible endpoint uses its own model names
const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001"

if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_BASE_URL + ANTHROPIC_MODEL)")
  process.exit(1)
}
console.log(`Using provider=${provider} model=${model} baseUrl=${process.env.ANTHROPIC_BASE_URL ?? "default"}`)

const { agent } = createSession(
  {
    model: { provider: provider as any, model, apiKey },
    cwd: process.cwd(),
  },
  DEFAULT_TOOLS
)

agent.subscribe(async (event: AgentEvent) => {
  // Print each event's type and truncated JSON
  const clone = JSON.parse(JSON.stringify(event))
  // Truncate long strings for readability
  const str = JSON.stringify(clone, null, 2).slice(0, 2000)
  console.log(`\n=== EVENT: ${event.type} ===\n${str}`)
})

console.log("Sending test prompt...")
await agent.prompt("say exactly: hello from ok-cli")
console.log("\nDone.")
