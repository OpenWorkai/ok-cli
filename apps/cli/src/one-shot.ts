/**
 * One-shot mode — run a task and stream output to stdout.
 */

import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core"
import { createSession } from "@openwork/core"
import { DEFAULT_TOOLS } from "@openwork/tools"
import chalk from "chalk"
import { collectTrustedReadOnlyToolNames, createToolPermissionHook } from "./tool-permissions.ts"

interface OneShotOptions {
  task: string
  model: string
  provider: string
  apiKey?: string
  baseUrl?: string
  /** All tools (built-in + MCP). Defaults to DEFAULT_TOOLS if omitted. */
  tools?: AgentTool[]
  /** Suppress banners — used when spawned as a sub-agent by /delegate. */
  quiet?: boolean
  /** Permit all tools. Defaults to safe, read-only tool access. */
  allowAll?: boolean
}

export class OneShotApiError extends Error {
  override name = "OneShotApiError"
}

export function createOneShotPermissionHook(tools: readonly AgentTool[], allowAll = false) {
  return createToolPermissionHook({
    getMode: () => (allowAll ? "allow-all" : "safe"),
    trustedReadOnlyToolNames: collectTrustedReadOnlyToolNames(tools),
    requestApproval: async () => false,
  })
}

export async function runOneShot(opts: OneShotOptions): Promise<void> {
  if (!opts.quiet) console.log(chalk.yellow("▶"), opts.task, "\n")

  const tools = opts.tools ?? DEFAULT_TOOLS

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
    tools,
    { beforeToolCall: createOneShotPermissionHook(tools, opts.allowAll) }
  )

  let apiError: OneShotApiError | undefined

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
        if (msg.stopReason === "error") {
          const errorMessage = msg.errorMessage?.trim() || "The model request failed."
          apiError = new OneShotApiError(errorMessage)
          process.stderr.write(chalk.red(`\n[API Error] ${errorMessage}\n`))
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
  if (apiError) throw apiError
  if (!opts.quiet) console.log(chalk.green("\n✓ Done"))
}
