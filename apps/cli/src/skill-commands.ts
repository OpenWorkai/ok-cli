/**
 * ok-cli skill <sub> — skill management commands
 *
 *   ok-cli skill list              List all discovered skills
 *   ok-cli skill show <name>       Show a skill's body and metadata
 *   ok-cli skill new <name>        Create a new skill file (global)
 *   ok-cli skill find [query]      Search skills.sh registry via npx skills find
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { discoverSkills, findSkill, scopeDir } from "@openwork/skills"
import chalk from "chalk"

export async function cmdSkill(skillArgs: string[]): Promise<void> {
  const [sub, ...rest] = skillArgs

  switch (sub) {
    case "list":
    case undefined:
      return cmdSkillList()
    case "show":
      return cmdSkillShow(rest[0])
    case "new":
      return cmdSkillNew(rest[0])
    case "find":
      return cmdSkillFind(rest[0])
    default:
      console.error(chalk.red(`Unknown skill subcommand: ${sub}`))
      console.error(
        chalk.gray("  Usage: ok-cli skill list | show <name> | new <name> | find [query]")
      )
      process.exit(1)
  }
}

function cmdSkillList() {
  const skills = discoverSkills()

  if (skills.length === 0) {
    console.log(chalk.gray("No skills found."))
    console.log(chalk.gray(`  Add skills to: ${scopeDir("global")}/`))
    console.log(chalk.gray("  Or run: ok-cli skill new <name>"))
    return
  }

  const scopeColors: Record<string, (s: string) => string> = {
    local: chalk.green,
    global: chalk.cyan,
    claude: chalk.magenta,
    codex: chalk.yellow,
  }

  // Group by scope for display
  const groups = new Map<string, (typeof skills)[0][]>()
  for (const skill of skills) {
    const group = groups.get(skill.scope) ?? []
    group.push(skill)
    groups.set(skill.scope, group)
  }

  const order = ["local", "global", "claude", "codex"] as const
  for (const scope of order) {
    const group = groups.get(scope)
    if (!group?.length) continue

    const label = scopeColors[scope]?.(scope) ?? scope
    console.log(`\n${chalk.bold(label)} (${group.length})`)
    for (const skill of group) {
      const hidden = skill.userInvocable ? "" : chalk.gray(" [hidden]")
      const desc = skill.description
        ? chalk.gray(
            `  — ${skill.description.slice(0, 60)}${skill.description.length > 60 ? "…" : ""}`
          )
        : ""
      console.log(`  /${chalk.bold(skill.name)}${hidden}${desc}`)
    }
  }

  console.log()
}

function cmdSkillShow(name: string | undefined) {
  if (!name) {
    console.error(chalk.red("Usage: ok-cli skill show <name>"))
    process.exit(1)
  }

  const skill = findSkill(name)
  if (!skill) {
    console.error(chalk.red(`Skill not found: ${name}`))
    console.error(chalk.gray("  Run: ok-cli skill list"))
    process.exit(1)
  }

  console.log()
  console.log(chalk.bold(`/${skill.name}`))
  if (skill.description) console.log(chalk.gray(`  ${skill.description}`))
  console.log(chalk.gray(`  scope: ${skill.scope}  |  file: ${skill.filePath}`))
  if (skill.model) console.log(chalk.gray(`  model: ${skill.model}`))
  if (skill.system) console.log(chalk.gray(`  system: ${skill.system.slice(0, 80)}`))
  if (!skill.userInvocable)
    console.log(chalk.yellow("  user_invocable: false (hidden from /skills)"))
  console.log()
  console.log(chalk.dim("─".repeat(60)))
  console.log(skill.body)
  console.log()
}

function cmdSkillNew(name: string | undefined) {
  if (!name) {
    console.error(chalk.red("Usage: ok-cli skill new <name>"))
    process.exit(1)
  }

  // Normalise name: lowercase, hyphens only
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-")
  const dir = scopeDir("global")

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const filePath = join(dir, `${safeName}.md`)
  if (existsSync(filePath)) {
    console.error(chalk.red(`Skill already exists: ${filePath}`))
    process.exit(1)
  }

  const template = `---
name: ${safeName}
description: "Describe what this skill does"
---

# ${safeName}

Write your skill prompt here. This text is sent to the agent when you type /${safeName} in the REPL.

## Instructions

...
`

  writeFileSync(filePath, template, "utf-8")
  console.log(chalk.green(`✓ Created: ${filePath}`))
  console.log(chalk.gray(`  Edit the file, then use /${safeName} in the REPL.`))
}

async function cmdSkillFind(query: string | undefined) {
  const args = query ? ["skills", "find", query] : ["skills", "find"]
  console.log(chalk.gray(`Searching skills.sh${query ? ` for "${query}"` : ""}…\n`))

  const proc = Bun.spawn(["npx", ...args], {
    stdout: "inherit",
    stderr: "inherit",
    env: process.env as Record<string, string>,
  })

  const code = await proc.exited
  if (code !== 0) {
    console.error(chalk.red("\n✗ skills find failed"))
    process.exit(code)
  }

  console.log(chalk.gray("\nTo install: npx skills add <owner/repo@skill> --agent universal -g"))
}
