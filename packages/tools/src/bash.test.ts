import { expect, test } from "bun:test"
import { runBash } from "./bash.ts"

test("runs shell commands and captures their result", async () => {
  const result = await runBash({ command: "printf 'ok'" })

  expect(result).toEqual({
    stdout: "ok",
    stderr: "",
    exitCode: 0,
    timedOut: false,
  })
})
