/**
 * Search tool — grep & find in workspace.
 * Thin wrapper; real power comes from ripgrep if available.
 */

import { runBash } from "./bash.ts"

export interface SearchInput {
  pattern: string
  dir?: string
  fileGlob?: string
  caseSensitive?: boolean
  maxResults?: number
}

export async function grepSearch(input: SearchInput): Promise<string> {
  const dir = input.dir ?? "."
  const glob = input.fileGlob ? `--glob '${input.fileGlob}'` : ""
  const caseFlag = input.caseSensitive ? "" : "-i"
  const max = input.maxResults ? `| head -${input.maxResults}` : ""

  // prefer rg, fall back to grep
  const rgCmd = `rg ${caseFlag} --line-number ${glob} '${input.pattern}' ${dir} ${max} 2>/dev/null`
  const grepCmd = `grep -rn ${caseFlag} '${input.pattern}' ${dir} ${max} 2>/dev/null`

  const rg = await runBash({ command: `command -v rg && ${rgCmd} || ${grepCmd}`, cwd: dir })
  return rg.stdout || "(no results)"
}
