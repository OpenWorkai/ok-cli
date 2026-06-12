/**
 * OpenWork agent session — wraps pi-agent-core Agent.
 *
 * Usage:
 *   const session = createSession({ model: { provider: "anthropic", model: "claude-sonnet-4-6" }, cwd: "." })
 *   session.agent.subscribe((event) => { ... })
 *   await session.agent.prompt("explain this codebase")
 *
 * Supported providers:
 *   anthropic   — ANTHROPIC_API_KEY
 *   openai      — OPENAI_API_KEY
 *   google      — GOOGLE_API_KEY
 *   openrouter  — OPENROUTER_API_KEY, model = "anthropic/claude-sonnet-4-6" etc.
 *   openwork    — ok-cli login, key lives on the server. Pass token as apiKey + baseUrl.
 */

import { Agent } from "@earendil-works/pi-agent-core"
import { getModel, streamSimple, getEnvApiKey } from "@earendil-works/pi-ai"
import type { Model, Api } from "@earendil-works/pi-ai"
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

/**
 * Resolve a pi-ai Model for the given provider + model string.
 *
 * - openrouter: pi-ai only ships a handful of named models; we override the id
 *               so any OpenRouter model slug (e.g. "anthropic/claude-sonnet-4-6") works.
 * - openwork:   uses an OpenAI-compatible API; we clone an openai model and
 *               override baseUrl so pi-ai sends requests to the OpenWork backend.
 * - others:     passed straight through to getModel().
 */
function resolveModel(
  provider: string,
  modelId: string,
  baseUrl?: string
): Model<Api> {
  if (provider === "openrouter") {
    // Use the openrouter/auto model as a template for API typing, then override
    // the id so the request targets the user-supplied model slug.
    const base = getModel("openrouter", "openrouter/auto")
    return { ...base, id: modelId } as Model<Api>
  }

  if (provider === "openwork") {
    // OpenWork backend is OpenAI-compatible.
    // Clone a known openai model for correct API typing, then override
    // id and baseUrl so requests reach the OpenWork server.
    const base = getModel("openai", "gpt-4o")
    return {
      ...base,
      id: modelId,
      provider: "openai",
      baseUrl: baseUrl ?? "https://api.openwork.ai/v1",
    } as Model<Api>
  }

  // Standard pi-ai provider
  return getModel(
    provider as Parameters<typeof getModel>[0],
    modelId as Parameters<typeof getModel>[1]
  )
}

export function createSession(
  config: SessionConfig,
  tools: AgentTool<any>[] = []
): OpenWorkSession {
  const { model: modelConfig } = config

  const model = resolveModel(
    modelConfig.provider,
    modelConfig.model,
    modelConfig.baseUrl
  )

  const agent = new Agent({
    getApiKey: (provider: string) => {
      // Explicit key (e.g. JWT from `ok-cli login`) takes priority
      if (modelConfig.apiKey) return modelConfig.apiKey
      // openwork must supply an explicit key (no env var for this provider)
      if (modelConfig.provider === "openwork") return undefined
      return getEnvApiKey(provider as Parameters<typeof getEnvApiKey>[0])
    },
    streamFn: (m, ctx, opts) => streamSimple(m, ctx, opts),
    initialState: {
      systemPrompt: config.systemPrompt ?? SYSTEM_PROMPT,
      tools,
      model,
    },
  })

  return { agent, config }
}
