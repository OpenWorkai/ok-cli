/**
 * One-shot mode — run a task and stream output to stdout.
 */

import chalk from "chalk"
import { createSession } from "@openwork/core"
import { DEFAULT_TOOLS } from "@openwork/tools"
import type { AgentEvent } from "@earendil-works/pi-agent-core"

interface OneShotOptions {
  task: string
  model: string
  provider: string
  apiKey?: string
  baseUrl?: string
}

export async function runOneShot(opts: OneShotOptions): Promise<void> {
  console.log(chalk.yellow("▶"), opts.task, "\n")

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
    DEFAULT_TOOLS
  )

  agent.subscribe(async (event: AgentEvent) => {
    switch (event.type) {
      case "message_update": {
        const ev = event.assistantMessageEvent
        if (ev.type === "text_delta") {
          process.stdout.write(ev.delta)
        }
        break
      }
      case "message_end": {
        // Surface API errors (auth failures, rate limits, etc.)
        const msg = event.message as { stopReason?: string; errorMessage?: string }
        if (msg.stopReason === "error" && msg.errorMessage) {
          process.stderr.write(chalk.red(`\n[API Error] ${msg.errorMessage}\n`))
        }
        break
      }
      case "tool_execution_start":
        process.stdout.write(
          `\n${chalk.yellow("⚙")} ${chalk.bold(event.toolName)}(${Object.keys(event.args).join(", ")})\n`
        )
        break
      case "tool_execution_end":
        process.stdout.write(event.isError ? chalk.red("  ✗\n") : chalk.green("  ✓\n"))
        break
      case "agent_end":
        process.stdout.write("\n")
        break
    }
  })

  await agent.prompt(opts.task)
  console.log(chalk.green("\n✓ Done"))
}
