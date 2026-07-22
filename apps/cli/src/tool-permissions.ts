import type { AgentOptions, AgentTool } from "@earendil-works/pi-agent-core"
import type { PermissionMode } from "@openwork/core"
import { DEFAULT_TOOLS } from "@openwork/tools"

export const DEFAULT_PERMISSION_MODE: PermissionMode = "ask"

export type ToolPermissionDecision = "allow" | "ask" | "block"

export interface ToolApprovalRequest {
  toolName: string
  args: unknown
}

interface ToolPermissionHookOptions {
  getMode: () => PermissionMode
  trustedReadOnlyToolNames: ReadonlySet<string>
  requestApproval: (request: ToolApprovalRequest, signal?: AbortSignal) => Promise<boolean>
}

const READ_ONLY_BUILTIN_TOOL_NAMES = new Set([
  "read_file",
  "list_dir",
  "search",
  "web_scrape",
  "web_search",
  "web_parse",
  "web_crawl",
])

export function collectTrustedReadOnlyToolNames(
  tools: readonly AgentTool[],
  builtInTools: readonly AgentTool[] = DEFAULT_TOOLS
): ReadonlySet<string> {
  const counts = new Map<string, number>()
  for (const tool of tools) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1)

  const builtIns = new Set(builtInTools)
  const trusted = new Set<string>()
  for (const tool of tools) {
    if (
      builtIns.has(tool) &&
      READ_ONLY_BUILTIN_TOOL_NAMES.has(tool.name) &&
      counts.get(tool.name) === 1
    ) {
      trusted.add(tool.name)
    }
  }
  return trusted
}

export function decideToolPermission(
  mode: PermissionMode,
  toolName: string,
  trustedReadOnlyToolNames: ReadonlySet<string>
): ToolPermissionDecision {
  if (mode === "allow-all" || trustedReadOnlyToolNames.has(toolName)) return "allow"
  return mode === "ask" ? "ask" : "block"
}

export function parseApprovalAnswer(answer: string): boolean | null {
  const normalized = answer.trim().toLowerCase()
  if (normalized === "y" || normalized === "yes") return true
  if (normalized === "" || normalized === "n" || normalized === "no") return false
  return null
}

export function formatApprovalArgs(args: unknown): string {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return Object.entries(args)
      .map(([key, value]) => {
        const serialized = JSON.stringify(value)
        return `${key}=${serialized ?? String(value)}`
      })
      .join(", ")
      .slice(0, 120)
  }

  const serialized = JSON.stringify(args)
  return (serialized ?? String(args)).slice(0, 120)
}

export function createToolPermissionHook(
  options: ToolPermissionHookOptions
): NonNullable<AgentOptions["beforeToolCall"]> {
  return async (context, signal) => {
    const toolName = context.toolCall.name
    const decision = decideToolPermission(
      options.getMode(),
      toolName,
      options.trustedReadOnlyToolNames
    )

    if (decision === "allow") return undefined
    if (decision === "block") {
      return {
        block: true,
        reason: `Blocked by safe mode: ${toolName} requires explicit permission.`,
      }
    }

    let approved = false
    try {
      approved = await options.requestApproval({ toolName, args: context.args }, signal)
    } catch {
      approved = false
    }

    if (approved) return undefined
    return {
      block: true,
      reason: `Permission denied by user: ${toolName} was not executed.`,
    }
  }
}

interface QueuedApproval extends ToolApprovalRequest {
  resolve: (approved: boolean) => void
  signal?: AbortSignal
  onAbort?: () => void
}

export interface ToolApprovalQueue {
  readonly active: ToolApprovalRequest | null
  request(request: ToolApprovalRequest, signal?: AbortSignal): Promise<boolean>
  respond(approved: boolean): boolean
  cancelAll(): void
}

export function createToolApprovalQueue(
  showRequest: (request: ToolApprovalRequest) => void
): ToolApprovalQueue {
  const pending: QueuedApproval[] = []

  const showActive = () => {
    const active = pending[0]
    if (active) showRequest(active)
  }

  const settle = (item: QueuedApproval, approved: boolean) => {
    const index = pending.indexOf(item)
    if (index === -1) return false

    pending.splice(index, 1)
    if (item.signal && item.onAbort) item.signal.removeEventListener("abort", item.onAbort)
    item.resolve(approved)
    if (index === 0) showActive()
    return true
  }

  return {
    get active() {
      return pending[0] ?? null
    },

    request(request, signal) {
      if (signal?.aborted) return Promise.resolve(false)

      return new Promise<boolean>((resolve) => {
        const item: QueuedApproval = { ...request, resolve }
        if (signal) {
          item.signal = signal
          item.onAbort = () => settle(item, false)
          signal.addEventListener("abort", item.onAbort, { once: true })
        }
        pending.push(item)
        if (pending.length === 1) showActive()
      })
    },

    respond(approved) {
      const active = pending[0]
      return active ? settle(active, approved) : false
    },

    cancelAll() {
      const items = pending.splice(0)
      for (const item of items) {
        if (item.signal && item.onAbort) item.signal.removeEventListener("abort", item.onAbort)
        item.resolve(false)
      }
    },
  }
}
