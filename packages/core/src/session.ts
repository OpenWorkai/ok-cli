/**
 * OpenWork agent session — wraps pi-agent-core Agent.
 *
 * Usage:
 *   const session = createSession({ model: { provider: "anthropic", model: "claude-sonnet-4-6" }, cwd: "." })
 *   session.agent.subscribe((event) => { ... })
 *   await session.agent.prompt("explain this codebase")
 */

import { Agent } from "@earendil-works/pi-agent-core"
import { getModel, streamSimple, getEnvApiKey } from "@earendil-works/pi-ai"
import type { AgentTool } from "@earendil-works/pi-agent-core"
import type { SessionConfig } from "./types.ts"

const SYSTEM_PROMPT = `You are ok-cli, an OpenWork agent. You help developers understand, modify, and improve codebases.

You have access to tools: bash, read_file, write_file, list_dir, search.

Guidelines:
- Explore before acting: read files and search before making changes
- Explain your reasoning briefly before each tool call
- For multi-file tasks, create a plan first
- Prefer targeted edits over rewrites
- Always verify changes work (run tests, check output)
`

export interface OpenWorkSession {
  agent: Agent
  config: SessionConfig
}

export function createSession(
  config: SessionConfig,
  tools: AgentTool<any>[] = []
): OpenWorkSession {
  const { model: modelConfig } = config

  // Resolve the pi-ai model object
  const model = getModel(
    modelConfig.provider as Parameters<typeof getModel>[0],
    modelConfig.model as Parameters<typeof getModel>[1]
  )

  const agent = new Agent({
    // Resolve API key: explicit > env var
    getApiKey: (provider: string) => {
      if (modelConfig.apiKey) return modelConfig.apiKey
      return getEnvApiKey(provider as Parameters<typeof getEnvApiKey>[0])
    },
    // Use pi-ai streamSimple as the transport
    streamFn: (m, ctx, opts) => streamSimple(m, ctx, opts),
    // Initial state
    initialState: {
      systemPrompt: config.systemPrompt ?? SYSTEM_PROMPT,
      tools,
      model,
    },
  })

  return { agent, config }
}
