#!/usr/bin/env bun
/**
 * ok-cli — OpenWork CLI agent
 *
 * Usage:
 *   ok-cli                      # interactive mode
 *   ok-cli "fix the bug in X"   # one-shot task
 *   ok-cli --model claude-3-5   # override model
 *   ok-cli --version            # show version
 */

import "dotenv/config" // load .env from cwd (or parent dirs) before anything else
import chalk from "chalk"
import { parseArgs } from "./args.ts"
import { runInteractive } from "./interactive.ts"
import { runOneShot } from "./one-shot.ts"

const VERSION = "0.1.0"

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.version) {
    console.log(`ok-cli v${VERSION}`)
    process.exit(0)
  }

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const banner = chalk.bold.cyan("⚡ OpenWork CLI") + chalk.gray(` v${VERSION}`)
  console.log(banner)
  console.log(chalk.gray(`  model: ${args.model}  cwd: ${process.cwd()}\n`))

  if (args.task) {
    // One-shot: ok-cli "do something"
    await runOneShot({ task: args.task, model: args.model, provider: args.provider, apiKey: args.apiKey })
  } else {
    // Interactive REPL
    await runInteractive({ model: args.model, provider: args.provider, apiKey: args.apiKey })
  }
}

function printHelp() {
  console.log(`
${chalk.bold("ok-cli")} — OpenWork CLI Agent

${chalk.bold("Usage:")}
  ok-cli                     Interactive mode
  ok-cli "<task>"            Run one-shot task
  ok-cli --model <id>        Override model (default: claude-sonnet-4-6)
  ok-cli --provider <name>   Provider: anthropic|openai|google (default: anthropic)
  ok-cli --version           Show version
  ok-cli --help              Show this help

${chalk.bold("Environment:")}
  ANTHROPIC_API_KEY          Anthropic key
  OPENAI_API_KEY             OpenAI key
  GOOGLE_API_KEY             Google key
  OPENWORK_MODEL             Default model override

${chalk.bold("Examples:")}
  ok-cli "explain this codebase"
  ok-cli "fix the failing tests in src/"
  ok-cli --provider openai --model gpt-4o "refactor main.ts"
`)
}

main().catch((err: unknown) => {
  console.error(chalk.red("Error:"), err)
  process.exit(1)
})
