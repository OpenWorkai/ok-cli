/**
 * Core types for OpenWork agent sessions.
 */

export type Provider = "anthropic" | "openai" | "google" | "mistral" | "bedrock"

export interface ModelConfig {
  provider: Provider
  model: string
  apiKey?: string
  baseUrl?: string
}

export interface SessionConfig {
  model: ModelConfig
  /** Working directory for the agent */
  cwd: string
  /** System prompt override */
  systemPrompt?: string
  /** Max tokens per turn */
  maxTokens?: number
}

export interface ToolResult {
  toolUseId: string
  content: string
  isError?: boolean
}

export interface AgentMessage {
  role: "user" | "assistant"
  content: string
  timestamp: Date
}
