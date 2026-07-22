/**
 * Interactive REPL — streaming output with pi-tui differential rendering.
 *
 * code layer  — session persistence (craft-inspired JSONL), permission modes
 * cowork layer — /delegate runs a sub-agent inline; future: named agents, CCCC routing
 *
 * Slash commands:
 *   /exit /quit      — quit
 *   /clear           — reset agent context
 *   /tools           — list available tools
 *   /skills          — list loaded skills
 *   /status          — re-show the powerline status bar
 *   /sessions        — list recent sessions
 *   /new             — start a new session (clears context)
 *   /resume <id>     — load a previous session visually
 *   /mode [safe|ask|allow-all]  — cycle or set permission mode
 *   /delegate <task> — run a sub-task in a child ok-cli agent (cowork)
 *   /<name> [extra]  — invoke a skill (body + optional extra text)
 *   /pi-claude-bridge — delegate to Claude Code CLI
 *   /help            — show commands
 */

import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core"
import {
  CombinedAutocompleteProvider,
  Container,
  Editor,
  type EditorTheme,
  Loader,
  Markdown,
  type MarkdownTheme,
  ProcessTerminal,
  type SlashCommand,
  Spacer,
  TUI,
  Text,
} from "@earendil-works/pi-tui"
import { type PermissionMode, createSession } from "@openwork/core"
import {
  type SessionMeta,
  appendTurn,
  createSessionRecord,
  listSessions,
  loadSessionTurns,
} from "@openwork/session-store"
import type { Skill } from "@openwork/skills"
import { DEFAULT_TOOLS } from "@openwork/tools"
import chalk from "chalk"
import { delegateTask } from "./cowork-delegate.ts"
import { parseBridgeArgs, runClaudeBridge } from "./pi-claude-bridge.ts"
import {
  type StatusInfo,
  clearTerminalTitle,
  notifyCwd,
  printStatusLine,
  renderStatusLine,
} from "./statusline.ts"
import {
  DEFAULT_PERMISSION_MODE,
  collectTrustedReadOnlyToolNames,
  createToolApprovalQueue,
  createToolPermissionHook,
  formatApprovalArgs,
  parseApprovalAnswer,
} from "./tool-permissions.ts"

interface InteractiveOptions {
  model: string
  provider: string
  apiKey?: string
  baseUrl?: string
  version?: string
  /** All tools (built-in + MCP). Defaults to DEFAULT_TOOLS if omitted. */
  tools?: AgentTool[]
  /** All discovered skills. */
  skills?: Skill[]
  /** Number of connected MCP servers (for statusline). */
  mcpServerCount?: number
}

const MODE_CYCLE: PermissionMode[] = ["safe", "ask", "allow-all"]

// ── Catppuccin Mocha palette ───────────────────────────────────────────────
const M = {
  text: "#cdd6f4",
  subtext: "#a6adc8",
  cyan: "#89dceb",
  blue: "#89b4fa",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  red: "#f38ba8",
  mauve: "#cba6f7",
  overlay: "#585b70",
  surface: "#313244",
}

const mdTheme: MarkdownTheme = {
  heading: (s) => chalk.bold.hex(M.blue)(s),
  link: (s) => chalk.hex(M.cyan)(s),
  linkUrl: (s) => chalk.hex(M.subtext)(s),
  code: (s) => chalk.hex(M.green).bgHex(M.surface)(s),
  codeBlock: (s) => chalk.hex(M.text)(s),
  codeBlockBorder: (s) => chalk.hex(M.surface)(s),
  quote: (s) => chalk.hex(M.subtext)(s),
  quoteBorder: (s) => chalk.hex(M.overlay)(s),
  hr: (s) => chalk.hex(M.overlay)(s),
  listBullet: (s) => chalk.hex(M.blue)(s),
  bold: (s) => chalk.bold(s),
  italic: (s) => chalk.italic(s),
  strikethrough: (s) => chalk.strikethrough(s),
  underline: (s) => chalk.underline(s),
}

const editorTheme: EditorTheme = {
  borderColor: (s) => chalk.hex(M.blue)(s),
  selectList: {
    selectedPrefix: (s) => chalk.hex(M.blue)(s),
    selectedText: (s) => chalk.bold.hex(M.text)(s),
    description: (s) => chalk.hex(M.subtext)(s),
    scrollInfo: (s) => chalk.hex(M.overlay)(s),
    noMatch: (s) => chalk.hex(M.red)(s),
  },
}

// ── Main ───────────────────────────────────────────────────────────────────

export async function runInteractive(opts: InteractiveOptions): Promise<void> {
  const skills = opts.skills ?? []
  const tools = opts.tools ?? DEFAULT_TOOLS
  const skillMap = new Map<string, Skill>()
  for (const skill of skills) skillMap.set(skill.name.toLowerCase(), skill)

  // Create session record before printing status line (id shown in bar)
  let currentSession: SessionMeta = await createSessionRecord({
    model: opts.model,
    provider: opts.provider,
    cwd: process.cwd(),
  })

  let permissionMode: PermissionMode = DEFAULT_PERMISSION_MODE

  const statusInfo: StatusInfo = {
    version: opts.version ?? "0.1.0",
    model: opts.model,
    provider: opts.provider,
    skillCount: skills.length,
    mcpCount: opts.mcpServerCount ?? 0,
    sessionId: currentSession.id,
    mode: permissionMode,
  }

  // ── Ghostty signals + pre-TUI banner ──────────────────────────────────────
  notifyCwd()
  printStatusLine(statusInfo)
  process.stdout.write("\n")

  // ── TUI setup ─────────────────────────────────────────────────────────────
  const terminal = new ProcessTerminal()
  const tui = new TUI(terminal)

  const history = new Container()
  tui.addChild(history)

  // Push editor toward the bottom on short sessions; scrolls away as history grows
  const initRows = process.stdout.rows ?? 24
  history.addChild(new Spacer(Math.max(0, initRows - 6)))

  const editor = new Editor(tui, editorTheme, { paddingX: 1 })

  const slashCmds: SlashCommand[] = [
    { name: "exit", description: "Quit ok-cli" },
    { name: "quit", description: "Quit ok-cli" },
    { name: "clear", description: "Reset agent context" },
    { name: "tools", description: "List available tools" },
    { name: "skills", description: "List loaded skills" },
    { name: "status", description: "Show status bar" },
    { name: "sessions", description: "List recent sessions" },
    { name: "new", description: "Start a new session" },
    { name: "resume", description: "Resume a session by ID", argumentHint: "<session-id>" },
    {
      name: "mode",
      description: "Cycle permission mode  safe → ask → allow-all",
      argumentHint: "[safe|ask|allow-all]",
    },
    {
      name: "delegate",
      description: "Run a sub-task in a child agent (cowork)",
      argumentHint: "<task>",
    },
    { name: "skill", description: "Search skills.sh registry", argumentHint: "find <query>" },
    { name: "help", description: "Show commands" },
    {
      name: "pi-claude-bridge",
      description: "Delegate to Claude Code CLI  [--full|--none] [--model <id>]",
      argumentHint: "[--full|--none] [--model opus|sonnet|haiku] <task>",
    },
    ...[...skillMap.values()].map(
      (s): SlashCommand => ({
        name: s.name,
        description: s.description ?? `skill [${s.scope}]`,
      })
    ),
  ]
  editor.setAutocompleteProvider(new CombinedAutocompleteProvider(slashCmds, process.cwd()))

  tui.addChild(editor)
  tui.setFocus(editor)

  // ── State ─────────────────────────────────────────────────────────────────
  let isRunning = false
  let streamText = ""
  let streamMarkdown: Markdown | null = null
  let currentLoader: Loader | null = null

  const stopLoader = () => {
    if (!currentLoader) return
    currentLoader.stop()
    history.removeChild(currentLoader)
    currentLoader = null
  }

  const approvalQueue = createToolApprovalQueue((request) => {
    stopLoader()
    history.addChild(
      new Text(
        `${chalk.hex(M.yellow)("⚠ permission required")}  ${chalk.bold(request.toolName)}(${formatApprovalArgs(request.args)})\n${chalk.hex(M.subtext)("  Approve this tool call? [y/N]")}`,
        1,
        0
      )
    )
    editor.disableSubmit = false
    tui.requestRender()
  })

  const beforeToolCall = createToolPermissionHook({
    getMode: () => permissionMode,
    trustedReadOnlyToolNames: collectTrustedReadOnlyToolNames(tools),
    requestApproval: (request, signal) => approvalQueue.request(request, signal),
  })

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
    { beforeToolCall }
  )

  // ── Agent event subscription ───────────────────────────────────────────────
  agent.subscribe(async (event: AgentEvent) => {
    switch (event.type) {
      case "agent_start": {
        streamText = ""
        streamMarkdown = null
        currentLoader = new Loader(tui, chalk.hex(M.cyan), chalk.hex(M.subtext), "thinking…")
        history.addChild(currentLoader)
        currentLoader.start()
        tui.requestRender()
        break
      }

      case "message_update": {
        const ev = event.assistantMessageEvent
        if (ev.type !== "text_delta") break

        if (!streamMarkdown) {
          stopLoader()
          streamMarkdown = new Markdown("", 1, 0, mdTheme)
          history.addChild(streamMarkdown)
        }
        streamText += ev.delta
        streamMarkdown.setText(streamText)
        tui.requestRender()
        break
      }

      case "message_end": {
        const msg = event.message as { stopReason?: string; errorMessage?: string }
        if (msg.stopReason === "error" && msg.errorMessage) {
          stopLoader()
          history.addChild(new Text(chalk.hex(M.red)(`[API Error] ${msg.errorMessage}`), 1, 0))
          tui.requestRender()
        }
        break
      }

      case "tool_execution_start": {
        stopLoader()
        streamMarkdown = null
        history.addChild(
          new Text(
            `${chalk.hex(M.yellow)("⚙")} ${chalk.bold(event.toolName)}${chalk.hex(M.subtext)(`(${formatArgs(event.args)})`)}`,
            1,
            0
          )
        )
        tui.requestRender()
        break
      }

      case "tool_execution_end": {
        history.addChild(
          new Text(
            event.isError ? chalk.hex(M.red)("  ✗ error") : chalk.hex(M.green)("  ✓ done"),
            1,
            0
          )
        )
        tui.requestRender()
        break
      }

      case "agent_end": {
        stopLoader()
        // Persist assistant turn
        if (streamText) {
          await appendTurn(currentSession.id, {
            role: "assistant",
            content: streamText,
            ts: new Date().toISOString(),
          })
        }
        streamText = ""
        isRunning = false
        editor.disableSubmit = false
        history.addChild(new Text("", 1, 0))
        tui.requestRender()
        break
      }
    }
  })

  // ── Quit ───────────────────────────────────────────────────────────────────
  let resolveQuit!: () => void
  const donePromise = new Promise<void>((res) => {
    resolveQuit = res
  })

  const quit = () => {
    approvalQueue.cancelAll()
    agent.abort()
    tui.stop()
    clearTerminalTitle()
    process.stdout.write(chalk.hex(M.subtext)("\nBye!\n"))
    resolveQuit()
  }

  tui.addInputListener((data) => {
    if (data === "\x03") {
      quit()
      return { consume: true }
    }
    return undefined
  })

  // ── Editor submit ──────────────────────────────────────────────────────────
  editor.onSubmit = async (rawInput) => {
    const input = rawInput.trim()

    const pendingApproval = approvalQueue.active
    if (pendingApproval) {
      const approved = parseApprovalAnswer(input)
      if (approved === null) {
        editor.setText("")
        history.addChild(
          new Text(chalk.hex(M.yellow)("  Enter y/yes to approve, or n/no to deny."), 1, 0)
        )
        tui.requestRender()
        return
      }

      editor.setText("")
      history.addChild(
        new Text(
          approved
            ? chalk.hex(M.green)(`  ✓ approved ${pendingApproval.toolName}`)
            : chalk.hex(M.red)(`  ✗ denied ${pendingApproval.toolName}`),
          1,
          0
        )
      )
      approvalQueue.respond(approved)
      editor.disableSubmit = approvalQueue.active === null
      tui.requestRender()
      return
    }

    if (!input) return

    // ── built-in slash commands ────────────────────────────────────────────
    if (input === "/exit" || input === "/quit") {
      quit()
      return
    }

    if (input === "/help") {
      history.addChild(new Text(buildHelpText(skillMap.size > 0), 2, 0))
      tui.requestRender()
      return
    }

    if (input === "/clear") {
      agent.reset()
      history.addChild(new Text(chalk.hex(M.subtext)("  context cleared"), 1, 0))
      tui.requestRender()
      return
    }

    if (input === "/status") {
      history.addChild(new Text(renderStatusLine(statusInfo), 1, 1))
      tui.requestRender()
      return
    }

    if (input === "/tools") {
      const names = tools.map((t: { name: string }) => t.name).join(", ")
      history.addChild(new Text(chalk.hex(M.subtext)(`  ${names}`), 1, 0))
      tui.requestRender()
      return
    }

    if (input === "/skills") {
      history.addChild(new Text(buildSkillsText(skills), 2, 0))
      tui.requestRender()
      return
    }

    if (input.startsWith("/skill find")) {
      const query = input.slice("/skill find".length).trim()
      if (!query) {
        history.addChild(new Text(chalk.hex(M.red)("  Usage: /skill find <query>"), 1, 0))
        tui.requestRender()
        return
      }
      const loader = new Loader(
        tui,
        chalk.hex(M.mauve),
        chalk.hex(M.subtext),
        `searching "${query}"…`
      )
      history.addChild(loader)
      loader.start()
      tui.requestRender()
      try {
        const proc = Bun.spawn(["npx", "skills", "find", query], {
          stdout: "pipe",
          stderr: "ignore",
          env: process.env as Record<string, string>,
        })
        const output = await new Response(proc.stdout).text()
        await proc.exited
        loader.stop()
        history.removeChild(loader)
        history.addChild(
          new Text(
            output.trim() ? output : chalk.hex(M.subtext)(`  No skills found for "${query}"`),
            1,
            0
          )
        )
        history.addChild(
          new Text(
            chalk.hex(M.subtext)(
              "  Install: npx skills add <owner/repo@skill> --agent universal -g"
            ),
            1,
            0
          )
        )
      } catch (e) {
        loader.stop()
        history.removeChild(loader)
        history.addChild(new Text(chalk.hex(M.red)(`  ✗ skill find error: ${e}`), 1, 0))
      }
      tui.requestRender()
      return
    }

    // ── session commands ───────────────────────────────────────────────────

    if (input === "/sessions") {
      const sessions = await listSessions(10)
      if (sessions.length === 0) {
        history.addChild(new Text(chalk.hex(M.subtext)("  no sessions yet"), 1, 0))
      } else {
        const lines = [
          "",
          ...sessions.map((s) => {
            const active = s.id === currentSession.id ? chalk.hex(M.green)(" ●") : "  "
            const date = s.updatedAt.slice(0, 10)
            const shortId = s.id.slice(7) // strip YYMMDD-
            const model = chalk.hex(M.overlay)(` ${s.model}`)
            return `${active} ${chalk.hex(M.blue)(shortId)}  ${chalk.hex(M.subtext)(date)} ${s.turns}t${model}`
          }),
          "",
        ]
        history.addChild(new Text(lines.join("\n"), 1, 0))
      }
      tui.requestRender()
      return
    }

    if (input === "/new") {
      agent.reset()
      currentSession = await createSessionRecord({
        model: opts.model,
        provider: opts.provider,
        cwd: process.cwd(),
      })
      statusInfo.sessionId = currentSession.id
      streamText = ""
      streamMarkdown = null
      history.addChild(
        new Text(chalk.hex(M.subtext)(`  new session: ${currentSession.id.slice(7)}`), 1, 0)
      )
      tui.requestRender()
      return
    }

    if (input.startsWith("/resume")) {
      const id = input.slice("/resume".length).trim()
      if (!id) {
        history.addChild(new Text(chalk.hex(M.subtext)("  usage: /resume <session-id>"), 1, 0))
        tui.requestRender()
        return
      }
      // Accept short IDs (without date prefix)
      const sessions = await listSessions(100)
      const found = sessions.find(
        (s) => s.id === id || s.id.endsWith(`-${id}`) || s.id.slice(7) === id
      )
      if (!found) {
        history.addChild(new Text(chalk.hex(M.red)(`  session not found: ${id}`), 1, 0))
        tui.requestRender()
        return
      }
      const turns = await loadSessionTurns(found.id)
      agent.reset()
      currentSession = await createSessionRecord({
        model: opts.model,
        provider: opts.provider,
        cwd: process.cwd(),
        name: `resumed:${found.id}`,
      })
      statusInfo.sessionId = currentSession.id
      history.addChild(
        new Text(
          chalk.hex(M.subtext)(`  ─── resumed ${found.id.slice(7)} (${turns.length} turns) ───`),
          1,
          0
        )
      )
      for (const turn of turns) {
        if (turn.role === "user") {
          history.addChild(new Text(`${chalk.hex(M.cyan)("you ›")} ${turn.content}`, 1, 0))
        } else if (turn.role === "assistant") {
          history.addChild(new Markdown(turn.content, 1, 0, mdTheme))
        }
      }
      history.addChild(new Text("", 1, 0))
      tui.requestRender()
      return
    }

    if (input.startsWith("/mode")) {
      const arg = input.slice("/mode".length).trim() as PermissionMode | ""
      if (arg === "safe" || arg === "ask" || arg === "allow-all") {
        permissionMode = arg
      } else {
        const nextMode = MODE_CYCLE[(MODE_CYCLE.indexOf(permissionMode) + 1) % MODE_CYCLE.length]
        if (nextMode) permissionMode = nextMode
      }
      if (permissionMode === "allow-all") {
        Reflect.deleteProperty(statusInfo, "mode")
      } else {
        statusInfo.mode = permissionMode
      }
      const modeColor =
        permissionMode === "safe" ? M.green : permissionMode === "ask" ? M.yellow : M.subtext
      history.addChild(new Text(`  mode: ${chalk.hex(modeColor)(permissionMode)}`, 1, 0))
      tui.requestRender()
      return
    }

    // ── cowork: /delegate ─────────────────────────────────────────────────
    if (input.startsWith("/delegate")) {
      const task = input.slice("/delegate".length).trim()
      if (!task) {
        history.addChild(new Text(chalk.hex(M.subtext)("  usage: /delegate <task>"), 1, 0))
        tui.requestRender()
        return
      }
      history.addChild(
        new Text(
          chalk.hex(M.mauve)("  ▶ delegate: ") + task.slice(0, 60) + (task.length > 60 ? "…" : ""),
          1,
          0
        )
      )
      editor.addToHistory(input)
      editor.setText("")
      editor.disableSubmit = true
      tui.requestRender()

      await delegateTask({
        task,
        model: opts.model,
        provider: opts.provider,
        tui,
        history,
        mdTheme,
        ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
        ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
      })

      editor.disableSubmit = false
      history.addChild(new Text("", 1, 0))
      tui.requestRender()
      return
    }

    // ── /pi-claude-bridge — delegate to Claude Code CLI ────────────────────
    if (input.startsWith("/pi-claude-bridge")) {
      const raw = input.slice("/pi-claude-bridge".length).trim()
      const parsed = parseBridgeArgs(raw)
      if (!parsed) {
        history.addChild(
          new Text(
            chalk.hex(M.subtext)(
              "  usage: /pi-claude-bridge [--full|--none] [--model <id>] <task>"
            ),
            1,
            0
          )
        )
        tui.requestRender()
        return
      }

      const modeLabel = parsed.mode !== "read" ? chalk.hex(M.yellow)(` [${parsed.mode}]`) : ""
      const modelLabel = parsed.model ? chalk.hex(M.subtext)(` --model ${parsed.model}`) : ""
      history.addChild(
        new Text(
          chalk.hex(M.subtext)("  ▶ claude: ") + parsed.task.slice(0, 60) + modeLabel + modelLabel,
          1,
          0
        )
      )

      editor.addToHistory(input)
      editor.setText("")
      editor.disableSubmit = true
      tui.requestRender()

      await runClaudeBridge({ ...parsed, tui, history, mdTheme })

      editor.disableSubmit = false
      history.addChild(new Text("", 1, 0))
      tui.requestRender()
      return
    }

    // ── skill invocation: /<name> [extra text] ─────────────────────────────
    if (input.startsWith("/")) {
      const [slashName = "", ...extraParts] = input.slice(1).split(/\s+/)
      const skill = skillMap.get(slashName.toLowerCase())

      if (skill) {
        const extra = extraParts.join(" ").trim()
        let prompt = skill.body
        if (extra) prompt = `${prompt}\n\n${extra}`

        history.addChild(
          new Text(
            chalk.hex(M.subtext)("  ▶ skill: ") +
              chalk.bold(`/${skill.name}`) +
              (skill.scope !== "global" ? chalk.hex(M.subtext)(` [${skill.scope}]`) : "") +
              (extra
                ? chalk.hex(M.subtext)(` + "${extra.slice(0, 40)}${extra.length > 40 ? "…" : ""}"`)
                : ""),
            1,
            0
          )
        )

        if (skill.model && skill.model !== opts.model) {
          history.addChild(
            new Text(
              chalk.hex(M.yellow)(
                `  ⚠ skill requests model: ${skill.model} (current: ${opts.model})`
              ),
              1,
              0
            )
          )
        }

        editor.addToHistory(input)
        editor.setText("")
        isRunning = true
        editor.disableSubmit = true
        tui.requestRender()

        await appendTurn(currentSession.id, {
          role: "user",
          content: prompt,
          ts: new Date().toISOString(),
        })

        try {
          await agent.prompt(prompt)
        } catch (e) {
          history.addChild(new Text(chalk.hex(M.red)(`  Agent error: ${e}`), 1, 0))
          isRunning = false
          editor.disableSubmit = false
          tui.requestRender()
        }
        return
      }

      history.addChild(
        new Text(
          chalk.hex(M.red)(`  Unknown: /${slashName}`) +
            chalk.hex(M.subtext)("  —  /skills to list, /help for commands"),
          1,
          0
        )
      )
      tui.requestRender()
      return
    }

    // ── regular prompt ─────────────────────────────────────────────────────
    if (isRunning) return

    history.addChild(new Text(`${chalk.hex(M.cyan)("you ›")} ${input}`, 1, 0))
    editor.addToHistory(input)
    editor.setText("")
    isRunning = true
    editor.disableSubmit = true
    tui.requestRender()

    await appendTurn(currentSession.id, {
      role: "user",
      content: input,
      ts: new Date().toISOString(),
    })

    try {
      await agent.prompt(input)
    } catch (e) {
      history.addChild(new Text(chalk.hex(M.red)(`  Agent error: ${e}`), 1, 0))
      isRunning = false
      editor.disableSubmit = false
      tui.requestRender()
    }
  }

  tui.start()
  await donePromise
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 40)}`)
    .join(", ")
}

function buildHelpText(hasSkills: boolean): string {
  const g = chalk.hex("#a6adc8")
  const b = chalk.bold
  return [
    "",
    `  ${b("Commands:")}`,
    `  /exit    /quit     ${g("Quit")}`,
    `  /clear             ${g("Reset agent context")}`,
    `  /tools             ${g("List available tools")}`,
    `  /skills            ${g("List loaded skills")}${hasSkills ? g(" (claude + codex + ok-cli)") : ""}`,
    `  /skill find <q>    ${g("Search skills.sh registry")}`,
    `  /status            ${g("Show status bar")}`,
    `  /sessions          ${g("List recent sessions")}`,
    `  /new               ${g("Start a new session")}`,
    `  /resume <id>       ${g("Reload a previous session visually")}`,
    `  /mode [m]          ${g("Cycle permission mode  safe → ask → allow-all")}`,
    `  /<name>            ${g("Invoke a skill by name")}`,
    `  /<name> ...        ${g("Skill with extra context appended")}`,
    `  /delegate <task>   ${g("Run sub-task in a child agent (cowork)")}`,
    `  /pi-claude-bridge  ${g("Delegate to Claude Code CLI")}`,
    `    ${g("  [--full|--none] [--model opus|sonnet|haiku] <task>")}`,
    `  /help              ${g("Show this")}`,
    "",
  ].join("\n")
}

function buildSkillsText(skills: Skill[]): string {
  if (skills.filter((s) => s.userInvocable).length === 0) {
    return chalk.hex("#a6adc8")("  No skills loaded. Run: ok-cli skill list")
  }

  const scopeOrder = ["local", "global", "claude", "codex"] as const
  const scopeColors: Record<string, (s: string) => string> = {
    local: chalk.hex("#a6e3a1"),
    global: chalk.hex("#89dceb"),
    claude: chalk.hex("#cba6f7"),
    codex: chalk.hex("#f9e2af"),
  }

  const groups = new Map<string, Skill[]>()
  for (const skill of skills) {
    if (!skill.userInvocable) continue
    const group = groups.get(skill.scope) ?? []
    group.push(skill)
    groups.set(skill.scope, group)
  }

  const lines: string[] = [""]
  for (const scope of scopeOrder) {
    const group = groups.get(scope)
    if (!group?.length) continue
    const label = scopeColors[scope]?.(scope) ?? scope
    lines.push(`  ${label}`)
    for (const s of group) {
      const desc = s.description
        ? chalk.hex("#a6adc8")(
            `  ${s.description.slice(0, 50)}${s.description.length > 50 ? "…" : ""}`
          )
        : ""
      lines.push(`    /${chalk.bold(s.name)}${desc}`)
    }
  }
  lines.push("")
  return lines.join("\n")
}
