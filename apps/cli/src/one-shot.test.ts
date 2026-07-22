import { expect, test } from "bun:test"
import { DEFAULT_TOOLS } from "@openwork/tools"
import { createOneShotPermissionHook } from "./one-shot.ts"

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
