import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { grepSearch } from "./search.ts"

test("searches within a relative directory", async () => {
  const result = await grepSearch({
    pattern: "export async function grepSearch",
    dir: "packages/tools/src",
    fileGlob: "search.ts",
    caseSensitive: true,
  })

  expect(result).toMatch(/search\.ts:\d+:export async function grepSearch/)
})

test("treats the search pattern as data instead of shell syntax", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ok-cli-search-"))
  const marker = join(dir, "injected")

  try {
    await writeFile(join(dir, "source.txt"), "safe content\n")

    await grepSearch({
      pattern: `missing'; touch '${marker}'; #`,
      dir,
      caseSensitive: true,
    })

    expect(existsSync(marker)).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("treats the file glob as data instead of shell syntax", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ok-cli-search-"))
  const marker = join(dir, "injected")

  try {
    await writeFile(join(dir, "source.txt"), "safe content\n")

    await grepSearch({
      pattern: "safe",
      dir,
      fileGlob: `*.txt'; touch '${marker}'; #`,
      caseSensitive: true,
    })

    expect(existsSync(marker)).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
