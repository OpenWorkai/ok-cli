/**
 * Powerline-style rainbow status bar for ok-cli REPL.
 *
 * Layout — bar starts/ends with rounded caps; segments connect via solid arrows:
 *
 *    ⚡ ok-cli ›  claude-sonnet-4-6 ›  anthropic ›  ✦ 86 skills ›  02:01 ❯
 *    ╰── ROUND LEFT                                        ROUND RIGHT ──╯ ❯
 *
 * Glyphs (Nerd Font required):
 *     left  rounded cap (bar start)
 *     right rounded cap (bar end) + ❯ suffix
 *     solid right arrow (between segments)
 *     clock icon (time segment)
 */

import chalk from "chalk"

// ── Nerd Font glyphs (Unicode escapes — avoids encoding drift in source) ───
const PL_ROUND_LEFT = "" // ❬ left  rounded cap — bar start
const PL_ROUND_RIGHT = "" // ❭ right rounded cap — bar end
const PL_ARROW = "" // ▶ solid right arrow — between segments
const ICON_CLOCK = "" // 🕐 clock (fa-clock-o)
const ICON_BRAIN = "" // rss-ish / use for model (see providerIcon for real ones)

// ── Catppuccin Mocha palette ───────────────────────────────────────────────
const CAT = {
  base: "#1e1e2e", // dark text on colored segments
  surface: "#45475a", // time segment background
  text: "#cdd6f4", // light text on dark surface segment
  blue: "#89b4fa", // ok-cli brand
  sky: "#89dceb", // model
  green: "#a6e3a1", // provider
  mauve: "#cba6f7", // skills
  peach: "#fab387", // MCP
  overlay: "#585b70", // session ID
  yellow: "#f9e2af", // ask mode
  red: "#f38ba8", // safe mode
} as const

// ── Types ──────────────────────────────────────────────────────────────────

interface Segment {
  text: string
  bg: string // hex background color
  fg: string // hex foreground (text) color
}

export interface StatusInfo {
  version: string
  model: string
  provider: string
  skillCount: number
  mcpCount: number
  sessionId?: string
  mode?: "safe" | "ask" | "allow-all"
}

// ── Segment builder ────────────────────────────────────────────────────────

function buildSegments(info: StatusInfo): Segment[] {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  const segs: Segment[] = [
    { text: " ⚡ ok-cli ", bg: CAT.blue, fg: CAT.base },
    { text: `  ${info.model} `, bg: CAT.sky, fg: CAT.base },
    { text: ` ${providerIcon(info.provider)} ${info.provider} `, bg: CAT.green, fg: CAT.base },
  ]

  if (info.skillCount > 0) {
    segs.push({ text: ` ✦ ${info.skillCount} skills `, bg: CAT.mauve, fg: CAT.base })
  }
  if (info.mcpCount > 0) {
    segs.push({ text: ` ⚙ ${info.mcpCount} MCP `, bg: CAT.peach, fg: CAT.base })
  }
  if (info.mode && info.mode !== "allow-all") {
    const modeBg = info.mode === "safe" ? CAT.green : CAT.yellow
    segs.push({ text: ` ${info.mode} `, bg: modeBg, fg: CAT.base })
  }
  if (info.sessionId) {
    // Show last two words of ID (e.g. "swift-river") — date prefix is noise
    const shortId = info.sessionId.slice(7) // strip "YYMMDD-"
    segs.push({ text: ` # ${shortId} `, bg: CAT.overlay, fg: CAT.text })
  }

  // Time segment — clock icon + HH:MM
  segs.push({ text: ` ${ICON_CLOCK} ${time} `, bg: CAT.surface, fg: CAT.text })

  return segs
}

// ── Renderer ───────────────────────────────────────────────────────────────

/**
 * Render the full powerline bar:
 *   [ROUND_LEFT][seg0][ARROW][seg1][ARROW]...[segN][ROUND_RIGHT] ❯
 *
 * Transition arrows are colored: fg = left segment bg, bg = right segment bg.
 */
export function renderStatusLine(info: StatusInfo): string {
  const segs = buildSegments(info)

  if (chalk.level < 3) {
    // No true-color: plain pipe-separated fallback
    return segs.map((s) => chalk.hex(s.fg)(s.text.trim())).join(chalk.gray(" | "))
  }

  let out = ""
  const first = segs[0]
  if (!first) return out

  // Opening rounded cap (foreground = first segment bg, no terminal bg)
  out += chalk.hex(first.bg)(PL_ROUND_LEFT)

  for (const [i, seg] of segs.entries()) {
    const next = segs[i + 1]

    // Segment body
    out += chalk.bgHex(seg.bg).hex(seg.fg)(seg.text)

    if (next) {
      // Transition arrow: appears to "point into" the next segment
      // fg = current segment's bg (arrow color), bg = next segment's bg
      out += chalk.bgHex(next.bg).hex(seg.bg)(PL_ARROW)
    }
  }

  // Closing rounded cap + prompt arrow
  const last = segs.at(-1)
  if (!last) return out
  out += chalk.hex(last.bg)(PL_ROUND_RIGHT)
  out += ` ${chalk.bold.hex(CAT.blue)("❯")}` // ❯

  return out
}

/** Print the statusline to stdout (+ newline) and update Ghostty tab title. */
export function printStatusLine(info: StatusInfo): void {
  process.stdout.write(`${renderStatusLine(info)}\n`)
  setTerminalTitle(info)
}

// ── Ghostty / terminal OSC sequences ──────────────────────────────────────

/**
 * OSC 2: set window/tab title.
 * Ghostty shows this in the tab bar — visible even when REPL is scrolled.
 */
export function setTerminalTitle(info: StatusInfo): void {
  if (!process.stdout.isTTY) return
  const parts = ["⚡ ok-cli", info.model, info.provider]
  if (info.mcpCount > 0) parts.push(`${info.mcpCount} MCP`)
  process.stdout.write(`\x1b]2;${parts.join("  │  ")}\x07`)
}

/**
 * OSC 2: clear title on exit so the shell can repaint its own.
 */
export function clearTerminalTitle(): void {
  if (!process.stdout.isTTY) return
  process.stdout.write("\x1b]2;\x07")
}

/**
 * OSC 7: notify Ghostty of the current working directory.
 * Enables "New Tab in Same Directory" and cwd display in tab bar.
 */
export function notifyCwd(cwd = process.cwd()): void {
  if (!process.stdout.isTTY) return
  const hostname = process.env.HOSTNAME ?? "localhost"
  const encoded = encodeURIComponent(cwd).replace(/%2F/g, "/")
  process.stdout.write(`\x1b]7;file://${hostname}${encoded}\x07`)
}

// ── Provider icons (Nerd Font) ─────────────────────────────────────────────

function providerIcon(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "" //  Claude / robot
    case "openai":
      return "" //  OpenAI
    case "google":
      return "" //  Google G
    case "openrouter":
      return "" //  router/cloud
    case "openwork":
      return "" //  cloud
    default:
      return "" //  generic
  }
}
