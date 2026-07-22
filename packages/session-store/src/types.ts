export type TurnRole = "user" | "assistant" | "tool"

export interface TurnRecord {
  role: TurnRole
  content: string
  ts: string
  toolName?: string
  isError?: boolean
}

export interface SessionMeta {
  id: string
  name?: string
  model: string
  provider: string
  cwd: string
  createdAt: string
  updatedAt: string
  turns: number
}
