/**
 * Skill discovery — scans all skill directories and returns a deduplicated
 * list of skills. Priority (highest → lowest):
 *
 *   1. local   — <cwd>/.ok-cli/skills/
 *   2. global  — ~/.config/ok-cli/skills/
 *   3. claude  — ~/.claude/skills/
 *   4. codex   — ~/.codex/skills/
 *
 * When the same skill name exists in multiple sources, the higher-priority
 * version wins. This lets project-local skills shadow global ones.
 *
 * Each source can contain:
 *   - Flat files: name.md, name.txt, name.skill
 *   - Directories with a SKILL.md inside (Claude/Codex-compatible)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { parseSkillFile } from "./parser.ts"
import type { Skill } from "./types.ts"

type Scope = Skill["scope"]

/** Returns the path to a scope's root directory. */
export function scopeDir(scope: Scope, cwd = process.cwd()): string {
  switch (scope) {
    case "local":  return join(cwd, ".ok-cli", "skills")
    case "global": return join(homedir(), ".config", "ok-cli", "skills")
    case "claude": return join(homedir(), ".claude", "skills")
    case "codex":  return join(homedir(), ".codex", "skills")
  }
}

/** Scopes in priority order (index 0 = highest priority). */
const SCOPES: Scope[] = ["local", "global", "claude", "codex"]

/**
 * Discover all skills from all sources.
 *
 * @param cwd   Working directory for resolving local skills (default: process.cwd())
 * @returns     Deduplicated list of Skill objects, sorted by name.
 */
export function discoverSkills(cwd?: string): Skill[] {
  // Map of name → Skill; first write wins (highest priority first)
  const byName = new Map<string, Skill>()

  for (const scope of SCOPES) {
    const dir = scopeDir(scope, cwd)
    if (!existsSync(dir)) continue

    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      let skill: Skill | null = null

      try {
        const stat = statSync(fullPath)

        if (stat.isDirectory()) {
          // Directory-based skill: look for SKILL.md inside
          const skillMd = join(fullPath, "SKILL.md")
          if (existsSync(skillMd)) {
            const content = readFileSync(skillMd, "utf-8")
            skill = parseSkillFile(content, skillMd, scope)
          }
        } else if (stat.isFile() && /\.(md|txt|skill)$/i.test(entry)) {
          // Flat file skill
          const content = readFileSync(fullPath, "utf-8")
          skill = parseSkillFile(content, fullPath, scope)
        }
      } catch {
        // Unreadable entry — skip silently
        continue
      }

      if (skill && !byName.has(skill.name)) {
        byName.set(skill.name, skill)
      }
    }
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Look up a single skill by name across all sources.
 * Priority order is respected — local overrides global.
 */
export function findSkill(name: string, cwd?: string): Skill | null {
  const skills = discoverSkills(cwd)
  return skills.find((s) => s.name === name) ?? null
}
