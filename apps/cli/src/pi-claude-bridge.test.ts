import { expect, spyOn, test } from "bun:test"
import type { Container, MarkdownTheme, TUI } from "@earendil-works/pi-tui"
import { parseBridgeArgs, runClaudeBridge } from "./pi-claude-bridge.ts"

test("parses bridge mode, model, and task", () => {
  expect(parseBridgeArgs("--full --model claude-opus-4-6 review this diff")).toEqual({
    task: "review this diff",
    mode: "full",
    model: "claude-opus-4-6",
  })
})

test("rejects a model option without a value", () => {
  expect(parseBridgeArgs("--model")).toBeNull()
})

test("passes the bridge task and model as literal process arguments", async () => {
  let command: string[] = []
  const spawn = spyOn(Bun, "spawn").mockImplementation((args) => {
    command = Array.from(args as string[])
    return {
      stdout: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close()
        },
      }),
      exited: Promise.resolve(0),
    } as unknown as ReturnType<typeof Bun.spawn>
  })
  const tui = { requestRender() {} } as unknown as TUI
  const history = {
    addChild() {},
    removeChild() {},
  } as unknown as Container

  try {
    await runClaudeBridge({
      task: "review 'this'",
      mode: "full",
      model: "model; touch injected",
      tui,
      history,
      mdTheme: {} as MarkdownTheme,
    })
  } finally {
    spawn.mockRestore()
  }

  expect(command).toEqual([
    "claude",
    "-p",
    "review 'this'",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--model",
    "model; touch injected",
    "--permission-mode",
    "acceptEdits",
  ])
})
