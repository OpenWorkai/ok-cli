import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("passes firecrawl inputs as literal arguments", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ok-cli-firecrawl-"))
  const executable = join(dir, "firecrawl")
  const capture = join(dir, "argv.jsonl")
  const names = ["scrape", "search", "parse", "crawl"] as const
  const payloads = names.map((name) => `$(touch '${join(dir, `${name}-injected`)}')`)

  try {
    await writeFile(
      executable,
      `#!/bin/sh
printf '%s\\n' "$*" >> "$OK_CLI_FIRECRAWL_CAPTURE"
printf 'stub output\\n'
`
    )
    await chmod(executable, 0o755)

    const childCode = `
import { webCrawl, webParse, webScrape, webSearch } from "./web.ts"
await webScrape({ urls: [${JSON.stringify(payloads[0] ?? "")}] })
await webSearch({ query: ${JSON.stringify(payloads[1] ?? "")}, limit: 2 })
await webParse({ path: ${JSON.stringify(payloads[2] ?? "")} })
await webCrawl({ url: ${JSON.stringify(`https://example.test/${payloads[3] ?? ""}`)}, limit: 1 })
process.exit(0)
`
    const child = Bun.spawn([process.execPath, "-e", childCode], {
      cwd: import.meta.dir,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ""}`,
        OK_CLI_FIRECRAWL_CAPTURE: capture,
      },
      stdout: "ignore",
      stderr: "pipe",
    })
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)

    const captured = await readFile(capture, "utf8")
    for (const payload of payloads) {
      expect(captured).toContain(payload)
    }
    expect(names.some((name) => existsSync(join(dir, `${name}-injected`)))).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
