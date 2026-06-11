/**
 * pi-agent-core AgentTool registrations for ok-cli.
 * Each tool wraps the raw functions with TypeBox schemas.
 */

import { Type } from "@sinclair/typebox"
import type { AgentTool } from "@earendil-works/pi-agent-core"
import { runBash } from "./bash.ts"
import { readFileTool, writeFileTool, listDir } from "./file.ts"
import { grepSearch } from "./search.ts"

// ─── bash ────────────────────────────────────────────────────────────────────

const BashParams = Type.Object({
  command: Type.String({ description: "Shell command to execute" }),
  timeout: Type.Optional(Type.Number({ description: "Timeout in ms (default 30000)" })),
  cwd: Type.Optional(Type.String({ description: "Working directory (default: process cwd)" })),
})

export const bashTool: AgentTool<typeof BashParams> = {
  name: "bash",
  label: "Bash",
  description:
    "Execute a shell command. Returns stdout, stderr, exit code. " +
    "Use for running scripts, git, npm, file operations that need a shell.",
  parameters: BashParams,
  execute: async (_id, params) => {
    const result = await runBash(params)
    if (result.timedOut) {
      throw new Error(`[Command timed out after ${params.timeout ?? 30000}ms]`)
    }
    const text = [
      result.stdout && `STDOUT:\n${result.stdout}`,
      result.stderr && `STDERR:\n${result.stderr}`,
      `Exit code: ${result.exitCode}`,
    ]
      .filter(Boolean)
      .join("\n")
    // Return content normally; model reads exit code to decide success/failure
    return { content: [{ type: "text" as const, text }], details: { exitCode: result.exitCode } }
  },
}

// ─── read_file ───────────────────────────────────────────────────────────────

const ReadFileParams = Type.Object({
  path: Type.String({ description: "Absolute or relative path to read" }),
})

export const readFileTool_: AgentTool<typeof ReadFileParams> = {
  name: "read_file",
  label: "Read File",
  description: "Read the contents of a file as text. Use for source code, configs, docs.",
  parameters: ReadFileParams,
  execute: async (_id, params) => {
    const text = await readFileTool(params.path) // throws on error → isError: true
    return { content: [{ type: "text" as const, text }], details: {} }
  },
}

// ─── write_file ──────────────────────────────────────────────────────────────

const WriteFileParams = Type.Object({
  path: Type.String({ description: "Path to write" }),
  content: Type.String({ description: "File content to write" }),
})

export const writeFileTool_: AgentTool<typeof WriteFileParams> = {
  name: "write_file",
  label: "Write File",
  description: "Write or overwrite a file with the given content.",
  parameters: WriteFileParams,
  execute: async (_id, params) => {
    await writeFileTool(params.path, params.content) // throws on error → isError: true
    return { content: [{ type: "text" as const, text: `Written: ${params.path}` }], details: {} }
  },
}

// ─── list_dir ────────────────────────────────────────────────────────────────

const ListDirParams = Type.Object({
  dir: Type.String({ description: "Directory path to list" }),
})

export const listDirTool: AgentTool<typeof ListDirParams> = {
  name: "list_dir",
  label: "List Directory",
  description: "List files and subdirectories in a directory.",
  parameters: ListDirParams,
  execute: async (_id, params) => {
    const entries = await listDir(params.dir) // throws on error → isError: true
    return { content: [{ type: "text" as const, text: entries.join("\n") }], details: {} }
  },
}

// ─── search ──────────────────────────────────────────────────────────────────

const SearchParams = Type.Object({
  pattern: Type.String({ description: "Search pattern (regex supported)" }),
  dir: Type.Optional(Type.String({ description: "Directory to search in (default: .)" })),
  fileGlob: Type.Optional(Type.String({ description: "File glob filter e.g. '*.ts'" })),
  caseSensitive: Type.Optional(Type.Boolean()),
  maxResults: Type.Optional(Type.Number()),
})

export const searchTool: AgentTool<typeof SearchParams> = {
  name: "search",
  label: "Search",
  description: "Search for a pattern in files using ripgrep or grep. Returns file:line:match.",
  parameters: SearchParams,
  execute: async (_id, params) => {
    const result = await grepSearch(params)
    return { content: [{ type: "text" as const, text: result }], details: {} }
  },
}

// ─── default tool set ────────────────────────────────────────────────────────

export const DEFAULT_TOOLS: AgentTool<any>[] = [
  bashTool,
  readFileTool_,
  writeFileTool_,
  listDirTool,
  searchTool,
]
