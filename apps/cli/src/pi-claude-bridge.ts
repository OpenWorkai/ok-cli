/**
 * /pi-claude-bridge — delegates to Claude Code CLI and streams output to TUI.
 *
 * Usage in ok-cli REPL:
 *   /pi-claude-bridge <task>
 *   /pi-claude-bridge --full <task>      allow edits (acceptEdits mode)
 *   /pi-claude-bridge --none <task>      no tools, pure LLM answer
 *   /pi-claude-bridge --model opus <task>
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

export interface BridgeRunOptions {
  task: string
  mode?: "read" | "full" | "none"
  model?: string
  tui: TUI
  history: Container
  mdTheme: MarkdownTheme
}

const M = {
  subtext: "#a6adc8",
  cyan: "#89dceb",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  red: "#f38ba8",
  overlay: "#585b70",
}

// Short model aliases (same set pi-claude-bridge uses)
const MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4-8",
  opus4: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
}

export async function runClaudeBridge(opts: BridgeRunOptions): Promise<void> {
  const { task, tui, history, mdTheme } = opts
  const mode = opts.mode ?? "read"
  const modelId = opts.model ? (MODEL_ALIASES[opts.model] ?? opts.model) : undefined

  // Build flags
  const flags: string[] = [
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
  ]
  if (modelId) flags.push("--model", modelId)
  if (mode === "full") flags.push("--permission-mode", "acceptEdits")
  if (mode === "none") flags.push("--allowedTools", "")

  // Loader while waiting for first token
  let loaderAlive = true
  const loader = new Loader(tui, chalk.hex(M.cyan), chalk.hex(M.subtext), "claude…")
  history.addChild(loader)
  loader.start()
  tui.requestRender()

  const removeLoader = () => {
    if (!loaderAlive) return
    loaderAlive = false
    loader.stop()
    history.removeChild(loader)
  }

  let markdown: Markdown | null = null
  let lastText = ""
  const seenToolIds = new Set<string>() // de-duplicate tool_use events in partials

  try {
    const proc = Bun.spawn(["claude", "-p", task, ...flags], {
      stdout: "pipe",
      stderr: "ignore",
      cwd: process.cwd(),
    })

    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    let buf = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      while (true) {
        const nl = buf.indexOf("\n")
        if (nl === -1) break
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue

        let ev: Record<string, unknown>
        try {
          ev = JSON.parse(line)
        } catch {
          continue
        }

        if (ev.type === "assistant") {
          const msg = ev.message as {
            content?: Array<{
              type: string
              id?: string
              text?: string
              name?: string
              input?: unknown
            }>
          }
          let textOut = ""

          for (const block of msg.content ?? []) {
            // Accumulate text
            if (block.type === "text" && block.text) textOut += block.text

            // Tool calls — show once (partials repeat them)
            if (block.type === "tool_use" && block.id && !seenToolIds.has(block.id)) {
              seenToolIds.add(block.id)
              removeLoader()
              const argStr = JSON.stringify(block.input ?? {}).slice(0, 80)
              history.addChild(
                new Text(
                  `${chalk.hex(M.yellow)("⚙")} ${chalk.bold(String(block.name ?? "tool"))}${chalk.hex(M.subtext)(`(${argStr})`)}`,
                  1,
                  0
                )
              )
              tui.requestRender()
            }
          }

          // Update streaming markdown when text changes
          if (textOut && textOut !== lastText) {
            lastText = textOut
            removeLoader()
            if (!markdown) {
              markdown = new Markdown("", 1, 0, mdTheme)
              history.addChild(markdown)
            }
            markdown.setText(textOut)
            tui.requestRender()
          }
        }

        if (ev.type === "result") {
          removeLoader()
          const res = ev as { is_error?: boolean; total_cost_usd?: number }
          if (res.is_error) {
            history.addChild(new Text(chalk.hex(M.red)("  ✗ claude returned error"), 1, 0))
          } else {
            const cost =
              typeof res.total_cost_usd === "number"
                ? chalk.hex(M.overlay)(` $${res.total_cost_usd.toFixed(4)}`)
                : ""
            history.addChild(new Text(`${chalk.hex(M.green)("  ✓")}${cost}`, 1, 0))
          }
          tui.requestRender()
        }
      }
    }

    await proc.exited
  } catch (e) {
    history.addChild(new Text(chalk.hex(M.red)(`  ✗ spawn error: ${e}`), 1, 0))
    tui.requestRender()
  } finally {
    removeLoader()
  }
}

/**
 * Parse /pi-claude-bridge command args.
 *   /pi-claude-bridge [--full|--none] [--model <id>] <task...>
 * Returns null if no task text found.
 */
export function parseBridgeArgs(raw: string): {
  task: string
  mode: "read" | "full" | "none"
  model?: string
} | null {
  const parts = raw.trim().split(/\s+/)
  let mode: "read" | "full" | "none" = "read"
  let model: string | undefined
  const taskParts: string[] = []
  let i = 0

  while (i < parts.length) {
    const p = parts[i]
    if (p === undefined) break
    if (p === "--full") {
      mode = "full"
      i++
    } else if (p === "--none") {
      mode = "none"
      i++
    } else if (p === "--model") {
      const modelValue = parts[i + 1]
      if (!modelValue || modelValue.startsWith("--")) return null
      model = modelValue
      i += 2
    } else {
      taskParts.push(p)
      i++
    }
  }

  const task = taskParts.join(" ").trim()
  if (!task) return null
  return model !== undefined ? { task, mode, model } : { task, mode }
}
