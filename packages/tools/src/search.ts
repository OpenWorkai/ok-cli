/**
 * Search tool — grep & find in workspace.
 * Thin wrapper; real power comes from ripgrep if available.
 */

import { runProcess } from "./bash.ts"

export interface SearchInput {
  pattern: string
  dir?: string
  fileGlob?: string
  caseSensitive?: boolean
  maxResults?: number
}

export async function grepSearch(input: SearchInput): Promise<string> {
  const dir = input.dir ?? "."
  const caseArgs = input.caseSensitive ? [] : ["-i"]
  const rgPath = Bun.which("rg")
  let result: Awaited<ReturnType<typeof runProcess>> | undefined

  if (rgPath) {
    const globArgs = input.fileGlob ? ["--glob", input.fileGlob] : []
    result = await runProcess({
      command: [rgPath, ...caseArgs, "--line-number", ...globArgs, "--", input.pattern, "."],
      cwd: dir,
    })
  }

  if (!result || result.exitCode > 1) {
    const grepPath = Bun.which("grep") ?? "grep"
    result = await runProcess({
      command: [grepPath, "-rn", ...caseArgs, "--", input.pattern, "."],
      cwd: dir,
    })
  }

  const output = limitResults(result.stdout, input.maxResults)
  return output || "(no results)"
}

function limitResults(output: string, maxResults?: number): string {
  if (!maxResults || maxResults < 1) return output
  return output.split("\n").slice(0, Math.floor(maxResults)).join("\n")
}
