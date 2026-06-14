/**
 * Interactive REPL — streaming output from pi-agent-core Agent.
 *
 * Slash commands:
 *   /exit /quit      — quit
 *   /clear           — reset agent context
 *   /tools           — list available tools
 *   /skills          — list loaded skills
 *   /<name> [extra]  — invoke a skill (body + optional extra text)
 *   /help            — show commands
 */

import { createInterface } from "node:readline"
import chalk from "chalk"
import { createSession } from "@openwork/core"
import { DEFAULT_TOOLS } from "@openwork/tools"
import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core"
import type { Skill } from "@openwork/skills"

interface InteractiveOptions {
  model: string
  provider: string
  apiKey?: string
  baseUrl?: string
  /** All tools (built-in + MCP). Defaults to DEFAULT_TOOLS if omitted. */
  tools?: AgentTool[]
  /** All discovered skills. */
  skills?: Skill[]
}

export async function runInteractive(opts: InteractiveOptions): Promise<void> {
  const skills = opts.skills ?? []
  // Build lookup map: name → skill (case-insensitive)
  const skillMap = new Map<string, Skill>()
  for (const skill of skills) {
    skillMap.set(skill.name.toLowerCase(), skill)
  }

  const { agent } = createSession(
    {
      model: {
        provider: opts.provider as import("@openwork/core").Provider,
        model: opts.model,
        apiKey: opts.apiKey,
        baseUrl: opts.baseUrl,
      },
      cwd: process.cwd(),
    },
    opts.tools ?? DEFAULT_TOOLS
  )

  // Subscribe to streaming events
  agent.subscribe(async (event: AgentEvent) => {
    switch (event.type) {
      case "agent_start":
        process.stdout.write(chalk.cyan("\n⚡ "))
        break

      case "message_update": {
        const ev = event.assistantMessageEvent
        if (ev.type === "text_delta") {
          process.stdout.write(ev.delta)
        }
        break
      }

      case "message_end": {
        const msg = event.message as { stopReason?: string; errorMessage?: string }
        if (msg.stopReason === "error" && msg.errorMessage) {
          process.stdout.write(chalk.red(`\n[API Error] ${msg.errorMessage}\n`))
        }
        break
      }

      case "tool_execution_start":
        process.stdout.write(
          `\n${chalk.yellow("⚙")} ${chalk.bold(event.toolName)}(${formatArgs(event.args)})\n`
        )
        break

      case "tool_execution_end":
        if (event.isError) {
          process.stdout.write(chalk.red("  ✗ error\n"))
        } else {
          process.stdout.write(chalk.green("  ✓ done\n"))
        }
        break

      case "agent_end":
        process.stdout.write("\n")
        break
    }
  })

  // ─── REPL ─────────────────────────────────────────────────────────────────

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })

  const skillHint = skills.length > 0
    ? chalk.gray(` • ${skills.length} skill${skills.length !== 1 ? "s" : ""} available (/skills to list)`)
    : ""
  console.log(chalk.gray("Type your request. /exit to quit, /help for commands.") + skillHint + "\n")

  const askLine = (): Promise<string> =>
    new Promise((resolve) => rl.question(chalk.cyan("\nyou › "), resolve))

  while (true) {
    let input: string
    try {
      input = (await askLine()).trim()
    } catch {
      break
    }

    if (!input) continue

    // ── built-in slash commands ────────────────────────────────────────────
    if (input === "/exit" || input === "/quit") break

    if (input === "/help") {
      printCommands(skills.length > 0)
      continue
    }

    if (input === "/clear") {
      agent.reset()
      console.log(chalk.gray("  context cleared\n"))
      continue
    }

    if (input === "/tools") {
      const toolNames = (opts.tools ?? DEFAULT_TOOLS).map((t) => t.name).join(", ")
      console.log(chalk.gray(`  ${toolNames}\n`))
      continue
    }

    if (input === "/skills") {
      if (skillMap.size === 0) {
        console.log(chalk.gray("  No skills loaded. Run: ok-cli skill list\n"))
      } else {
        const scopeOrder = ["local", "global", "claude", "codex"] as const
        const scopeColors: Record<string, (s: string) => string> = {
          local:  chalk.green,
          global: chalk.cyan,
          claude: chalk.magenta,
          codex:  chalk.yellow,
        }
        // Group by scope
        const groups = new Map<string, Skill[]>()
        for (const skill of skills) {
          if (!skill.userInvocable) continue
          if (!groups.has(skill.scope)) groups.set(skill.scope, [])
          groups.get(skill.scope)!.push(skill)
        }
        for (const scope of scopeOrder) {
          const group = groups.get(scope)
          if (!group?.length) continue
          const label = scopeColors[scope]?.(scope) ?? scope
          console.log(`\n  ${label}`)
          for (const s of group) {
            const desc = s.description
              ? chalk.gray(`  ${s.description.slice(0, 50)}${s.description.length > 50 ? "…" : ""}`)
              : ""
            console.log(`    /${chalk.bold(s.name)}${desc}`)
          }
        }
        console.log()
      }
      continue
    }

    // ── skill invocation: /<name> [extra text] ─────────────────────────────
    if (input.startsWith("/")) {
      const [slashName, ...extraParts] = input.slice(1).split(/\s+/)
      const skillName = slashName?.toLowerCase() ?? ""
      const skill = skillMap.get(skillName)

      if (skill) {
        const extra = extraParts.join(" ").trim()
        let prompt = skill.body
        if (extra) prompt = `${prompt}\n\n${extra}`

        console.log(
          chalk.gray(`\n  ▶ skill: `) +
          chalk.bold(`/${skill.name}`) +
          (skill.scope !== "global" ? chalk.gray(` [${skill.scope}]`) : "") +
          (extra ? chalk.gray(` + "${extra.slice(0, 40)}${extra.length > 40 ? "…" : ""}"`) : "")
        )

        // If skill overrides model, warn (we can't switch mid-session easily)
        if (skill.model && skill.model !== opts.model) {
          console.log(chalk.yellow(`  ⚠ skill requests model: ${skill.model} (current: ${opts.model})`))
        }

        try {
          await agent.prompt(prompt)
        } catch (e) {
          console.error(chalk.red("\nAgent error:"), e)
        }
        continue
      }

      // Unknown slash command
      console.log(chalk.red(`  Unknown command or skill: /${skillName}`))
      console.log(chalk.gray(`  Type /skills to see available skills, /help for commands.\n`))
      continue
    }

    // ── regular prompt ─────────────────────────────────────────────────────
    try {
      await agent.prompt(input)
    } catch (e) {
      console.error(chalk.red("\nAgent error:"), e)
    }
  }

  rl.close()
  console.log(chalk.gray("\nBye!"))
}

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 40)}`)
    .join(", ")
}

function printCommands(hasSkills: boolean) {
  console.log(`
  ${chalk.bold("Commands:")}
  /exit         Quit
  /clear        Reset agent context
  /tools        List available tools
  /skills       List loaded skills${hasSkills ? " (claude + codex + ok-cli)" : ""}
  /<name>       Invoke a skill by name
  /<name> ...   Invoke a skill with extra context appended
  /help         Show this
`)
}
