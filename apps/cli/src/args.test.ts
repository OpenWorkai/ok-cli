import { expect, test } from "bun:test"
import { parseArgs } from "./args.ts"

test("one-shot tool access is restricted by default", () => {
  expect(parseArgs(["inspect the project"]).allowAll).toBe(false)
})

test("--allow-all explicitly enables unrestricted one-shot tools", () => {
  const args = parseArgs(["--allow-all", "update the project"])

  expect(args.allowAll).toBe(true)
  expect(args.task).toBe("update the project")
})

test("--mode rpc selects the desktop JSONL transport without becoming a task", () => {
  const args = parseArgs(["--mode", "rpc", "--provider", "openai", "--model", "gpt-4.1"])

  expect(args.mode).toBe("rpc")
  expect(args.task).toBeUndefined()
  expect(args.provider).toBe("openai")
  expect(args.model).toBe("gpt-4.1")
})
