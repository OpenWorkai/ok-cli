import { expect, test } from "bun:test"
import type { AgentOptions } from "@earendil-works/pi-agent-core"
import { createSession } from "./session.ts"

test("forwards the beforeToolCall hook to the agent", () => {
  const beforeToolCall: NonNullable<AgentOptions["beforeToolCall"]> = async () => ({ block: true })
  const { agent } = createSession(
    {
      model: { provider: "anthropic", model: "claude-sonnet-4-6" },
      cwd: process.cwd(),
    },
    [],
    { beforeToolCall }
  )

  expect(agent.beforeToolCall).toBe(beforeToolCall)
})

test("applies an explicit base URL to a standard OpenAI model", () => {
  const { agent } = createSession(
    {
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        baseUrl: "https://proxy.example/v1",
      },
      cwd: process.cwd(),
    },
    []
  )

  expect(agent.state.model.baseUrl).toBe("https://proxy.example/v1")
})
