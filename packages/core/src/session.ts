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
import type { AgentOptions, AgentTool } from "@earendil-works/pi-agent-core"
import { getEnvApiKey, getModel, streamSimple } from "@earendil-works/pi-ai"
import type { Api, Model } from "@earendil-works/pi-ai"
import type { SessionConfig } from "./types.ts"

const SYSTEM_PROMPT = `You are ok-cli, an OpenWork agent that helps developers understand, modify, and improve codebases.

Critical: Do NOT greet the user or introduce yourself. Wait silently for the user's first task.

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

export type SessionHooks = Pick<AgentOptions, "beforeToolCall">

/**
 * Resolve a pi-ai Model for the given provider + model string.
 *
 * - openrouter: pi-ai only ships a handful of named models; we override the id
 *               so any OpenRouter model slug (e.g. "anthropic/claude-sonnet-4-6") works.
 * - openwork:   uses an OpenAI-compatible API; we clone an openai model and
 *               override baseUrl so pi-ai sends requests to the OpenWork backend.
 * - others:     passed straight through to getModel().
 */
function resolveModel(provider: string, modelId: string, baseUrl?: string): Model<Api> {
  if (provider === "openrouter") {
    // Use the openrouter/auto model as a template for API typing, then override
    // the id so the request targets the user-supplied model slug.
    const base = getModel("openrouter", "openrouter/auto")
    return { ...base, id: modelId } as Model<Api>
  }

  if (provider === "openwork") {
    // OpenWork backend is OpenAI-compatible. Build directly with openai-completions
    // so pi-ai routes through the right HTTP client (not azure-openai-responses).
    return {
      id: modelId,
      name: modelId,
      api: "openai-completions",
      provider: "openai",
      baseUrl: baseUrl ?? "https://api.openwork.ai/v1",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 131072,
      maxTokens: 8192,
    } as unknown as Model<Api>
  }

  if (provider === "nvidia") {
    // NVIDIA NIM is OpenAI-compatible (integrate.api.nvidia.com/v1).
    // Must use api: "openai-completions" — gpt-4o base has api: "azure-openai-responses"
    // which routes to the wrong endpoint and returns 404.
    return {
      id: modelId,
      name: modelId,
      api: "openai-completions",
      provider: "nvidia",
      baseUrl: baseUrl ?? "https://integrate.api.nvidia.com/v1",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 131072,
      maxTokens: 4096,
    } as unknown as Model<Api>
  }

  if (provider === "openai" && baseUrl) {
    // Generic OpenAI-compatible endpoint (e.g. DeepSeek, local vLLM, etc.).
    // Build a spec directly so arbitrary endpoints work without being present
    // in the model registry — otherwise getModel() returns undefined and the
    // model ends up with api: undefined, which throws "No API provider registered".
    return {
      id: modelId,
      name: modelId,
      api: "openai-completions",
      provider: "openai",
      baseUrl,
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 8192,
    } as unknown as Model<Api>
  }

  if (provider === "deepseek") {
    // DeepSeek is OpenAI-compatible (api.deepseek.com). Route through
    // openai-completions and resolve the key via DEEPSEEK_API_KEY
    // (getEnvApiKey("deepseek")) — no --base-url needed anymore.
    return {
      id: modelId,
      name: modelId,
      api: "openai-completions",
      provider: "deepseek",
      baseUrl: baseUrl ?? "https://api.deepseek.com",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 131072,
      maxTokens: 8192,
    } as unknown as Model<Api>
  }

  // Standard pi-ai provider
  const model = getModel(
    provider as Parameters<typeof getModel>[0],
    modelId as Parameters<typeof getModel>[1]
  )
  return baseUrl ? ({ ...model, baseUrl } as Model<Api>) : model
}

export function createSession(
  config: SessionConfig,
  tools: AgentTool[] = [],
  hooks: SessionHooks = {}
): OpenWorkSession {
  const { model: modelConfig } = config

  const model = resolveModel(modelConfig.provider, modelConfig.model, modelConfig.baseUrl)

  const agent = new Agent({
    getApiKey: (provider: string) => {
      // Explicit key (e.g. JWT from `ok-cli login`) takes priority
      if (modelConfig.apiKey) return modelConfig.apiKey
      // openwork must supply an explicit key (no env var for this provider)
      if (modelConfig.provider === "openwork") return undefined
      // nvidia: read NVIDIA_API_KEY from env (routed as openai internally)
      if (modelConfig.provider === "nvidia") {
        return process.env.NVIDIA_API_KEY ?? undefined
      }
      return getEnvApiKey(provider as Parameters<typeof getEnvApiKey>[0])
    },
    streamFn: (m, ctx, opts) => streamSimple(m, ctx, opts),
    ...hooks,
    initialState: {
      systemPrompt: config.systemPrompt ?? SYSTEM_PROMPT,
      tools,
      model,
    },
  })

  return { agent, config }
}
