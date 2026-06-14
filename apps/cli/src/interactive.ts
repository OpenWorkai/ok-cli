/**
 * Interactive REPL — streaming output from pi-agent-core Agent.
 */

import { createInterface } from "node:readline"
import chalk from "chalk"
import { createSession } from "@openwork/core"
import { DEFAULT_TOOLS } from "@openwork/tools"
import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core"

interface InteractiveOptions {
  model: string
  provider: string
  apiKey?: string
  baseUrl?: string
  /** All tools (built-in + MCP). Defaults to DEFAULT_TOOLS if omitted. */
  tools?: AgentTool[]
}

export async function runInteractive(opts: InteractiveOptions): Promise<void> {
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
  console.log(chalk.gray("Type your request. /exit to quit, /help for commands.\n"))

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
    if (input === "/exit" || input === "/quit") break

    if (input === "/help") {
      printCommands()
      continue
    }

    if (input === "/clear") {
      agent.reset()
      console.log(chalk.gray("  context cleared\n"))
      continue
    }

    if (input === "/tools") {
      console.log(chalk.gray("  available: bash, read_file, write_file, list_dir, search\n"))
      continue
    }

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

function printCommands() {
  console.log(`
  ${chalk.bold("Commands:")}
  /exit    Quit
  /clear   Reset agent context
  /tools   List available tools
  /help    Show this
`)
}
