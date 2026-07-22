import { expect, test } from "bun:test"
import { buildDelegateSpawnArgs } from "./cowork-delegate.ts"

test("an explicitly delegated task preserves tool access in its child process", () => {
  const args = buildDelegateSpawnArgs("/tmp/ok-cli", {
    task: "update the tests",
    model: "test-model",
    provider: "test-provider",
  })

  expect(args).toContain("--allow-all")
  expect(args).toContain("--quiet")
})
