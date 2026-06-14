#!/usr/bin/env bun
/**
 * ok-cli — OpenWork CLI agent
 *
 * Usage:
 *   ok-cli                      # interactive mode
 *   ok-cli "fix the bug in X"   # one-shot task
 *   ok-cli --model claude-3-5   # override model
 *   ok-cli --provider openrouter --model anthropic/claude-sonnet-4-6 "..."
 *   ok-cli login                # sign in to OpenWork Cloud
 *   ok-cli --provider openwork  # use cloud backend (after login)
 *   ok-cli mcp list             # list configured MCP servers
 *   ok-cli mcp add <name> <cmd> [args...] # add an MCP server
 *   ok-cli --version            # show version
 */

import "dotenv/config" // load .env from cwd (or parent dirs) before anything else
import chalk from "chalk"
import { parseArgs } from "./args.ts"
import { runInteractive } from "./interactive.ts"
import { runOneShot } from "./one-shot.ts"
import { cmdLogin, cmdLogout, cmdWhoami } from "./auth-commands.ts"
import { cmdMcp } from "./mcp-commands.ts"
import { cmdSkill } from "./skill-commands.ts"
import { readAuth } from "@openwork/cloud"
import { loadMcpTools } from "@openwork/mcp"
import { discoverSkills } from "@openwork/skills"
import { DEFAULT_TOOLS } from "@openwork/tools"

const VERSION = "0.1.0"

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // ── auth subcommands ────────────────────────────────────────────────────────
  if (args.subCommand === "login") {
    await cmdLogin({ token: args.loginToken, server: args.loginServer })
    return
  }
  if (args.subCommand === "logout") {
    await cmdLogout()
    return
  }
  if (args.subCommand === "whoami") {
    await cmdWhoami()
    return
  }

  // ── mcp subcommands ─────────────────────────────────────────────────────────
  if (args.subCommand === "mcp") {
    await cmdMcp(args.mcpArgs ?? [])
    return
  }

  // ── skill subcommands ────────────────────────────────────────────────────────
  if (args.subCommand === "skill") {
    await cmdSkill(args.skillArgs ?? [])
    return
  }

  // ── meta flags ──────────────────────────────────────────────────────────────
  if (args.version) {
    console.log(`ok-cli v${VERSION}`)
    process.exit(0)
  }
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  // ── resolve provider ────────────────────────────────────────────────────────
  let { provider, apiKey, baseUrl, model } = args

  if (provider === "openwork" && !apiKey) {
    const auth = await readAuth()
    if (!auth) {
      console.error(chalk.red("✗ Not logged in to OpenWork Cloud."))
      console.error(chalk.gray("  Run: ok-cli login"))
      process.exit(1)
    }
    apiKey = auth.token
    baseUrl = baseUrl ?? `${auth.server}/v1`
  }

  // ── banner ──────────────────────────────────────────────────────────────────
  const providerLabel =
    provider === "openwork" ? chalk.magenta("openwork") : chalk.gray(provider)
  const banner = chalk.bold.cyan("⚡ OpenWork CLI") + chalk.gray(` v${VERSION}`)
  console.log(banner)
  console.log(
    chalk.gray(`  model: ${model}  provider: `) +
      providerLabel +
      chalk.gray(`  cwd: ${process.cwd()}\n`)
  )

  // ── load MCP tools ──────────────────────────────────────────────────────────
  const mcp = await loadMcpTools({ verbose: args.verbose })
  const allTools = [...DEFAULT_TOOLS, ...mcp.tools]

  if (mcp.serverCount > 0) {
    const extra = mcp.tools.length > 0
      ? chalk.gray(`  +${mcp.tools.length} MCP tool${mcp.tools.length !== 1 ? "s" : ""} from ${mcp.serverCount} server${mcp.serverCount !== 1 ? "s" : ""}`)
      : chalk.yellow(`  MCP: ${mcp.serverCount} server${mcp.serverCount !== 1 ? "s" : ""} connected, 0 tools`)
    console.log(extra + "\n")
  }

  // ── load skills ──────────────────────────────────────────────────────────────
  const skills = discoverSkills()
  if (skills.length > 0 && args.verbose) {
    console.log(chalk.gray(`  ${skills.length} skill${skills.length !== 1 ? "s" : ""} loaded (claude, codex, ok-cli)\n`))
  }

  // ── run ─────────────────────────────────────────────────────────────────────
  const sessionOpts = { model, provider, apiKey, baseUrl }

  if (args.task) {
    await runOneShot({ task: args.task, ...sessionOpts, tools: allTools })
  } else {
    await runInteractive({ ...sessionOpts, tools: allTools, skills })
  }

  // Disconnect MCP servers on exit
  await mcp.close()
}

function printHelp() {
  console.log(`
${chalk.bold("ok-cli")} — OpenWork CLI Agent v${VERSION}

${chalk.bold("Usage:")}
  ok-cli                              Interactive REPL
  ok-cli "<task>"                     Run one-shot task
  ok-cli --model <id>                 Override model (default: claude-sonnet-4-6)
  ok-cli --provider <name>            Provider (see below)
  ok-cli login [--token <t>]          Sign in to OpenWork Cloud
  ok-cli logout                       Clear saved credentials
  ok-cli whoami                       Show current login status
  ok-cli mcp list                     List configured MCP servers
  ok-cli mcp add <name> <cmd> [args]  Add an MCP server (stdio)
  ok-cli mcp remove <name>            Remove an MCP server
  ok-cli mcp test <name>              Test a server connection
  ok-cli skill list                   List all skills (claude/codex/ok-cli)
  ok-cli skill show <name>            Show a skill's content
  ok-cli skill new <name>             Create a new skill file
  ok-cli --version                    Show version
  ok-cli --help                       Show this help

${chalk.bold("Providers:")}
  ${chalk.cyan("anthropic")}    ANTHROPIC_API_KEY                  (default)
  ${chalk.cyan("openai")}       OPENAI_API_KEY
  ${chalk.cyan("google")}       GOOGLE_API_KEY
  ${chalk.cyan("openrouter")}   OPENROUTER_API_KEY  —  one key for every model
  ${chalk.cyan("openwork")}     No key needed — run \`ok-cli login\` first

${chalk.bold("MCP:")}
  ok-cli mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /path
  ok-cli mcp add github npx -y @modelcontextprotocol/server-github
  ok-cli mcp list

${chalk.bold("OpenRouter examples:")}
  ok-cli --provider openrouter --model anthropic/claude-sonnet-4-6 "..."
  ok-cli --provider openrouter --model openai/gpt-4o "..."
  ok-cli --provider openrouter --model google/gemini-2.0-flash "..."

${chalk.bold("Environment:")}
  ANTHROPIC_API_KEY     Anthropic key
  OPENAI_API_KEY        OpenAI key
  GOOGLE_API_KEY        Google key
  OPENROUTER_API_KEY    OpenRouter key (one key, all models)
  OPENWORK_MODEL        Default model override
`)
}

main().catch((err: unknown) => {
  console.error(chalk.red("Error:"), err)
  process.exit(1)
})
