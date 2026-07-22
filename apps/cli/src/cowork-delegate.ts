/**
 * /delegate — run a task in an ok-cli sub-agent (cowork layer).
 *
 * Spawns ok-cli one-shot with the current model/provider, streams output
 * back into the parent TUI. Enables parallel or sequential sub-tasks
 * without leaving the interactive session.
 *
 * Future: /delegate @agent <task> → Openwork inbox 路由 via Openwork MCP tools.
 *
 * Usage:
 *   /delegate <task>
 *   /delegate --model opus <task>
 */

import {
  type Container,
  Loader,
  Markdown,
  type MarkdownTheme,
  type TUI,
  Text,
} from "@earendil-works/pi-tui"
import chalk from "chalk"

export interface DelegateOptions {
  task: string
  model: string
  provider: string
  apiKey?: string
  baseUrl?: string
  tui: TUI
  history: Container
  mdTheme: MarkdownTheme
}

type DelegateSpawnOptions = Pick<
  DelegateOptions,
  "task" | "model" | "provider" | "apiKey" | "baseUrl"
>

export function buildDelegateSpawnArgs(scriptPath: string, opts: DelegateSpawnOptions): string[] {
  const args = [
    scriptPath,
    opts.task,
    "--model",
    opts.model,
    "--provider",
    opts.provider,
    "--quiet",
    "--allow-all",
  ]
  if (opts.apiKey) args.push("--api-key", opts.apiKey)
  if (opts.baseUrl) args.push("--base-url", opts.baseUrl)
  return args
}

const M = {
  mauve: "#cba6f7",
  subtext: "#a6adc8",
  green: "#a6e3a1",
  red: "#f38ba8",
}

export async function delegateTask(opts: DelegateOptions): Promise<void> {
  const { tui, history, mdTheme } = opts

  let loaderAlive = true
  const loader = new Loader(tui, chalk.hex(M.mauve), chalk.hex(M.subtext), "delegating…")
  history.addChild(loader)
  loader.start()
  tui.requestRender()

  const removeLoader = () => {
    if (!loaderAlive) return
    loaderAlive = false
    loader.stop()
    history.removeChild(loader)
  }

  // Spawn: <bun-binary> <this-script> <task> --model <m> --provider <p> --quiet
  const scriptPath = process.argv[1]
  if (!scriptPath) {
    removeLoader()
    history.addChild(
      new Text(chalk.hex(M.red)("  ✗ delegate error: CLI script path unavailable"), 1, 0)
    )
    tui.requestRender()
    return
  }
  const spawnArgs = buildDelegateSpawnArgs(scriptPath, opts)

  let markdown: Markdown | null = null
  let accumulated = ""

  try {
    const proc = Bun.spawn([process.execPath, ...spawnArgs], {
      stdout: "pipe",
      stderr: "ignore",
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })

    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      accumulated += decoder.decode(value, { stream: true })
      removeLoader()
      if (!markdown) {
        markdown = new Markdown("", 1, 0, mdTheme)
        history.addChild(markdown)
      }
      markdown.setText(stripAnsi(accumulated))
      tui.requestRender()
    }

    await proc.exited
    history.addChild(new Text(chalk.hex(M.green)("  ✓ delegate complete"), 1, 0))
    tui.requestRender()
  } catch (e) {
    removeLoader()
    history.addChild(new Text(chalk.hex(M.red)(`  ✗ delegate error: ${e}`), 1, 0))
    tui.requestRender()
  } finally {
    removeLoader()
  }
}

// Strip ANSI escape sequences so Markdown renderer gets clean text
function stripAnsi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: These escapes intentionally match ANSI control sequences.
  return s.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\][^\x07]*\x07/g, "")
}
