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
