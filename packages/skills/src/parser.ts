/**
 * Skill file parser — zero-dependency frontmatter extraction.
 *
 * Supports a flat subset of YAML: `key: value` lines only.
 * Nested objects, arrays, and multi-line values are not supported
 * (use the body for anything complex).
 *
 * Compatible with:
 *   - ok-cli native skill files
 *   - Claude Code SKILL.md format
 *   - Codex SKILL.md format
 */

import { basename } from "path"
import type { Skill } from "./types.ts"

type Scope = Skill["scope"]

/**
 * Parse a skill markdown file.
 *
 * @param content   Raw file content
 * @param filePath  Absolute path (used for name fallback and metadata)
 * @param scope     "global" | "local" | "claude" | "codex"
 */
export function parseSkillFile(
  content: string,
  filePath: string,
  scope: Scope
): Skill {
  const frontmatterMatch = content.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/m)

  let meta: Record<string, string> = {}
  let body: string

  if (frontmatterMatch) {
    meta = parseFlatYaml(frontmatterMatch[1]!)
    body = frontmatterMatch[2]!.trim()
  } else {
    body = content.trim()
  }

  // Name: frontmatter > filename without extension > directory name
  // For SKILL.md files the filename is always "SKILL.md", so we use the parent directory name
  const fileName = basename(filePath)
  let defaultName: string
  if (fileName.toUpperCase() === "SKILL.MD") {
    // Parent directory name is the skill name
    const parts = filePath.replace(/\\/g, "/").split("/")
    defaultName = parts[parts.length - 2] ?? "unknown"
  } else {
    defaultName = fileName.replace(/\.(md|txt|skill)$/i, "")
  }

  const name = meta["name"] ?? defaultName

  // user_invocable: default true; false hides from /skills listing
  const userInvocableRaw = meta["user_invocable"]
  const userInvocable = userInvocableRaw === undefined
    ? true
    : userInvocableRaw.toLowerCase() !== "false"

  return {
    name,
    description: meta["description"] || undefined,
    model: meta["model"] || undefined,
    system: meta["system"] || undefined,
    filePath,
    scope,
    userInvocable,
    body,
  }
}

/** Parse `key: value` pairs from a flat YAML block. */
function parseFlatYaml(block: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of block.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    // Strip surrounding quotes
    if (key) result[key] = value.replace(/^["']|["']$/g, "")
  }
  return result
}
