import { expect, test } from "bun:test"
import type { AgentTool } from "@earendil-works/pi-agent-core"
import { DEFAULT_TOOLS } from "@openwork/tools"
import {
  DEFAULT_PERMISSION_MODE,
  collectTrustedReadOnlyToolNames,
  createToolApprovalQueue,
  createToolPermissionHook,
  decideToolPermission,
  formatApprovalArgs,
  parseApprovalAnswer,
} from "./tool-permissions.ts"

const fakeTool = (name: string) => ({ name }) as AgentTool

test("interactive sessions default to approval mode", () => {
  expect(DEFAULT_PERMISSION_MODE).toBe("ask")
})

test("safe mode only allows trusted built-in read-only tools", () => {
  const trusted = collectTrustedReadOnlyToolNames(DEFAULT_TOOLS)

  expect(decideToolPermission("safe", "read_file", trusted)).toBe("allow")
  expect(decideToolPermission("safe", "search", trusted)).toBe("allow")
  expect(decideToolPermission("safe", "bash", trusted)).toBe("block")
  expect(decideToolPermission("safe", "write_file", trusted)).toBe("block")
  expect(decideToolPermission("safe", "github_create_issue", trusted)).toBe("block")
})

test("ask mode only prompts for mutating or unknown tools", () => {
  const trusted = collectTrustedReadOnlyToolNames(DEFAULT_TOOLS)

  expect(decideToolPermission("ask", "list_dir", trusted)).toBe("allow")
  expect(decideToolPermission("ask", "web_search", trusted)).toBe("allow")
  expect(decideToolPermission("ask", "bash", trusted)).toBe("ask")
  expect(decideToolPermission("ask", "write_file", trusted)).toBe("ask")
  expect(decideToolPermission("ask", "mcp_tool", trusted)).toBe("ask")
})

test("allow-all mode preserves unrestricted tool execution", () => {
  expect(decideToolPermission("allow-all", "anything", new Set())).toBe("allow")
})

test("an MCP tool cannot impersonate a trusted read-only tool by name", () => {
  const tools = [...DEFAULT_TOOLS, fakeTool("read_file")]
  const trusted = collectTrustedReadOnlyToolNames(tools)

  expect(trusted.has("read_file")).toBe(false)
  expect(trusted.has("list_dir")).toBe(true)
})

test("permission hook reads the current mode for every tool call", async () => {
  let mode = "safe" as const | "ask" | "allow-all"
  const approvals: string[] = []
  const hook = createToolPermissionHook({
    getMode: () => mode,
    trustedReadOnlyToolNames: collectTrustedReadOnlyToolNames(DEFAULT_TOOLS),
    requestApproval: async ({ toolName }) => {
      approvals.push(toolName)
      return true
    },
  })
  const context = (name: string) =>
    ({ toolCall: { name }, args: { command: "pwd" } }) as Parameters<typeof hook>[0]

  expect(await hook(context("bash"))).toEqual({
    block: true,
    reason: "Blocked by safe mode: bash requires explicit permission.",
  })

  mode = "ask"
  expect(await hook(context("bash"))).toBeUndefined()
  expect(approvals).toEqual(["bash"])

  mode = "allow-all"
  expect(await hook(context("write_file"))).toBeUndefined()
  expect(approvals).toEqual(["bash"])
})

test("permission hook blocks a rejected approval", async () => {
  const hook = createToolPermissionHook({
    getMode: () => "ask",
    trustedReadOnlyToolNames: collectTrustedReadOnlyToolNames(DEFAULT_TOOLS),
    requestApproval: async () => false,
  })

  const result = await hook({
    toolCall: { name: "write_file" },
    args: { path: "x", content: "y" },
  } as Parameters<typeof hook>[0])

  expect(result).toEqual({
    block: true,
    reason: "Permission denied by user: write_file was not executed.",
  })
})

test("approval queue serializes parallel tool calls", async () => {
  const shown: string[] = []
  const queue = createToolApprovalQueue((request) => shown.push(request.toolName))

  const bash = queue.request({ toolName: "bash", args: { command: "pwd" } })
  const write = queue.request({ toolName: "write_file", args: { path: "x" } })

  expect(shown).toEqual(["bash"])
  expect(queue.active?.toolName).toBe("bash")
  expect(queue.respond(true)).toBe(true)
  expect(await bash).toBe(true)
  expect(shown).toEqual(["bash", "write_file"])
  expect(queue.respond(false)).toBe(true)
  expect(await write).toBe(false)
  expect(queue.active).toBeNull()
})

test("approval queue denies active and queued calls when cancelled", async () => {
  const queue = createToolApprovalQueue(() => {})
  const first = queue.request({ toolName: "bash", args: {} })
  const second = queue.request({ toolName: "write_file", args: {} })

  queue.cancelAll()

  expect(await first).toBe(false)
  expect(await second).toBe(false)
  expect(queue.active).toBeNull()
})

test("approval queue honors an abort signal and advances", async () => {
  const shown: string[] = []
  const queue = createToolApprovalQueue((request) => shown.push(request.toolName))
  const controller = new AbortController()
  const first = queue.request({ toolName: "bash", args: {} }, controller.signal)
  const second = queue.request({ toolName: "write_file", args: {} })

  controller.abort()

  expect(await first).toBe(false)
  expect(shown).toEqual(["bash", "write_file"])
  queue.respond(true)
  expect(await second).toBe(true)
})

test("approval answers are explicit and default to deny", () => {
  expect(parseApprovalAnswer("y")).toBe(true)
  expect(parseApprovalAnswer("YES")).toBe(true)
  expect(parseApprovalAnswer("")).toBe(false)
  expect(parseApprovalAnswer("n")).toBe(false)
  expect(parseApprovalAnswer("maybe")).toBeNull()
})

test("approval arguments are bounded and safe for unusual values", () => {
  expect(formatApprovalArgs({ command: "pwd", timeout: 10 })).toBe('command="pwd", timeout=10')
  expect(formatApprovalArgs(undefined)).toBe("undefined")
  expect(formatApprovalArgs("x".repeat(200))).toHaveLength(120)
})
