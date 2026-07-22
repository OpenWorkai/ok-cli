import { expect, mock, spyOn, test } from "bun:test"
import type { AgentEvent } from "@earendil-works/pi-agent-core"
import { DEFAULT_TOOLS } from "@openwork/tools"

let emitAgentEvent: ((event: AgentEvent) => Promise<void>) | undefined
let apiErrorMessage: string | undefined = "quota exhausted"

mock.module("@openwork/core", () => ({
  createSession: () => ({
    agent: {
      subscribe: (listener: (event: AgentEvent) => Promise<void>) => {
        emitAgentEvent = listener
        return () => undefined
      },
      prompt: async () => {
        await emitAgentEvent?.({
          type: "message_end",
          message: { stopReason: "error", errorMessage: apiErrorMessage },
        } as AgentEvent)
      },
    },
  }),
}))

const { createOneShotPermissionHook, runOneShot } = await import("./one-shot.ts")

const context = (hook: ReturnType<typeof createOneShotPermissionHook>, name: string) =>
  ({ toolCall: { name }, args: {} }) as Parameters<typeof hook>[0]

test("one-shot blocks mutating tools but keeps trusted reads by default", async () => {
  const hook = createOneShotPermissionHook(DEFAULT_TOOLS)

  expect(await hook(context(hook, "read_file"))).toBeUndefined()
  expect(await hook(context(hook, "bash"))).toEqual({
    block: true,
    reason: "Blocked by safe mode: bash requires explicit permission.",
  })
})

test("one-shot allows all tools only after explicit opt-in", async () => {
  const hook = createOneShotPermissionHook(DEFAULT_TOOLS, true)

  expect(await hook(context(hook, "bash"))).toBeUndefined()
  expect(await hook(context(hook, "write_file"))).toBeUndefined()
})

test("one-shot rejects API errors without reporting success", async () => {
  apiErrorMessage = "quota exhausted"
  const log = spyOn(console, "log").mockImplementation(() => undefined)
  const stderr = spyOn(process.stderr, "write").mockImplementation(() => true)

  try {
    await expect(
      runOneShot({ task: "smoke test", model: "test-model", provider: "openai", tools: [] })
    ).rejects.toThrow("quota exhausted")
    expect(log.mock.calls.flat().join(" ")).not.toContain("Done")
    expect(stderr.mock.calls.flat().join(" ")).toContain("[API Error] quota exhausted")
  } finally {
    log.mockRestore()
    stderr.mockRestore()
  }
})

test("one-shot rejects an API error even when the provider omits its message", async () => {
  apiErrorMessage = undefined
  const log = spyOn(console, "log").mockImplementation(() => undefined)
  const stderr = spyOn(process.stderr, "write").mockImplementation(() => true)

  try {
    await expect(
      runOneShot({ task: "smoke test", model: "test-model", provider: "openai", tools: [] })
    ).rejects.toThrow("The model request failed")
    expect(log.mock.calls.flat().join(" ")).not.toContain("Done")
    expect(stderr.mock.calls.flat().join(" ")).toContain("[API Error] The model request failed")
  } finally {
    log.mockRestore()
    stderr.mockRestore()
  }
})
