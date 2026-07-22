import { expect, test } from "bun:test"

test("the MCP package uses the split client without the server-only dependency graph", async () => {
  const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json()
  const lockfile = await Bun.file(new URL("../../../bun.lock", import.meta.url)).text()

  expect(manifest.dependencies["@modelcontextprotocol/client"]).toBe("2.0.0-beta.5")
  expect(manifest.dependencies["@modelcontextprotocol/sdk"]).toBeUndefined()
  expect(lockfile).not.toMatch(/\n {4}"@modelcontextprotocol\/sdk": \[/)
  expect(lockfile).not.toMatch(/\n {4}"@hono\/node-server": \[/)
})
