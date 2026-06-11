/**
 * File tools — read, write, list.
 */

import { readFile, writeFile, readdir } from "node:fs/promises"
import { join } from "node:path"

export async function readFileTool(path: string): Promise<string> {
  return readFile(path, "utf-8")
}

export async function writeFileTool(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf-8")
}

export async function listDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
}

export async function readFilesTool(paths: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {}
  await Promise.all(
    paths.map(async (p) => {
      results[p] = await readFile(p, "utf-8").catch((e: unknown) => `[Error: ${String(e)}]`)
    })
  )
  return results
}
