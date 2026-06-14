/**
 * Powerline-style rainbow status bar for ok-cli REPL.
 *
 * Renders colored segments with Nerd Font powerline arrows:
 *
 *   ⚡ ok-cli  claude-sonnet-4-6  anthropic  56 skills  2 MCP  13:18
 *
 * Each segment uses a distinct background color. The  separator is
 * colored to create the "arrow" cut-out effect.
 *
 * Falls back to plain boxed format if chalk level < 3 (no true-color).
 */

import chalk, { type ChalkInstance } from "chalk"

// ── Nerd Font powerline glyphs ─────────────────────────────────────────────
const PL_ARROW   = ""   // solid right arrow
const PL_THIN    = ""   // thin right arrow

// ── Segment definitions ────────────────────────────────────────────────────

interface Segment {
  text: string
  bg: string   // hex background
  fg: string   // hex foreground
}

export interface StatusInfo {
  version: string
  model: string
  provider: string
  skillCount: number
  mcpCount: number
}

/** Build the segment list from session info. */
function buildSegments(info: StatusInfo): Segment[] {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  const segs: Segment[] = [
    {
      text: ` ⚡ ok-cli `,
      bg: "#003f6b",
      fg: "#00d7ff",
    },
    {
      text: `  ${info.model} `,
      bg: "#0d3b66",
      fg: "#87ceeb",
    },
    {
      text: ` ${providerIcon(info.provider)} ${info.provider} `,
      bg: "#1b4332",
      fg: "#74c69d",
    },
  ]

  if (info.skillCount > 0) {
    segs.push({
      text: ` ✦ ${info.skillCount} skill${info.skillCount !== 1 ? "s" : ""} `,
      bg: "#3b0764",
      fg: "#c77dff",
    })
  }

  if (info.mcpCount > 0) {
    segs.push({
      text: ` ⚙ ${info.mcpCount} MCP `,
      bg: "#164e63",
      fg: "#67e8f9",
    })
  }

  segs.push({
    text: `  ${time} `,
    bg: "#1c1c1c",
    fg: "#6b7280",
  })

  return segs
}

/** Render the full powerline statusline string. */
export function renderStatusLine(info: StatusInfo): string {
  const segs = buildSegments(info)

  if (chalk.level < 3) {
    // Fallback: plain colored text, no background
    return segs
      .map((s) => chalk.hex(s.fg)(s.text.trim()))
      .join(chalk.gray(" │ "))
  }

  let out = ""

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!
    const nextSeg = segs[i + 1]

    // Segment body: fg text on colored bg
    out += chalk.bgHex(seg.bg).hex(seg.fg)(seg.text)

    // Powerline arrow: seg.bg as fg, nextSeg.bg as bg (or reset at end)
    if (nextSeg) {
      out += chalk.bgHex(nextSeg.bg).hex(seg.bg)(PL_ARROW)
    } else {
      // Last segment: arrow on transparent background
      out += chalk.hex(seg.bg)(PL_ARROW)
    }
  }

  return out
}

/** Print the statusline to stdout, followed by a newline. */
export function printStatusLine(info: StatusInfo): void {
  process.stdout.write(renderStatusLine(info) + "\n")
}

// ── Provider icons ─────────────────────────────────────────────────────────

function providerIcon(provider: string): string {
  switch (provider) {
    case "anthropic":  return ""    // claude icon (Nerd Font  or fallback ✦)
    case "openai":     return ""    // openai-ish
    case "google":     return "󰊭"    // google G
    case "openrouter": return "󰀑"    // router-ish
    case "openwork":   return "󱁐"    // cloud-ish
    default:           return "󰨊"
  }
}
