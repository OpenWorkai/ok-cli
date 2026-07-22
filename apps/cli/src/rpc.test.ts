import { expect, mock, test } from "bun:test"
import { createRpcController } from "./rpc.ts"

type Listener = (event: Record<string, unknown>) => void

function makeAgent() {
  let listener: Listener | undefined
  return {
    agent: {
      subscribe: mock((next: Listener) => {
        listener = next
        return () => {}
      }),
      prompt: mock(async (_message: string) => {}),
      abort: mock(() => {}),
    },
    emit(event: Record<string, unknown>) {
      listener?.(event)
    },
  }
}

test("RPC controller answers get_state and forwards agent events as JSONL", async () => {
  const runtime = makeAgent()
  const output: string[] = []
  const controller = createRpcController(runtime.agent, (line) => output.push(line))

  await controller.handleLine(JSON.stringify({ type: "get_state", id: "init-1" }))
  runtime.emit({ type: "turn_start" })

  expect(JSON.parse(output.at(0) ?? "{}")).toEqual({
    type: "response",
    id: "init-1",
    command: "get_state",
    success: true,
    data: { runtime: "ok-cli" },
  })
  expect(JSON.parse(output.at(1) ?? "{}")).toEqual({ type: "turn_start" })
})

test("RPC controller dispatches prompts and abort commands", async () => {
  const runtime = makeAgent()
  const controller = createRpcController(runtime.agent, () => {})

  await controller.handleLine(JSON.stringify({ type: "prompt", message: "inspect this repo" }))
  await controller.handleLine(JSON.stringify({ type: "abort" }))

  expect(runtime.agent.prompt).toHaveBeenCalledWith("inspect this repo")
  expect(runtime.agent.abort).toHaveBeenCalledTimes(1)
})
