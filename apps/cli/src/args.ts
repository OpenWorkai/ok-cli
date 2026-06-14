/**
 * CLI argument parser for ok-cli.
 */

export type SubCommand = "login" | "logout" | "whoami" | "mcp" | "skill" | null

export interface CliArgs {
  subCommand: SubCommand
  task?: string
  model: string
  provider: string
  apiKey?: string
  baseUrl?: string
  /** Token for `ok-cli login --token <tok>` */
  loginToken?: string
  /** Server URL for `ok-cli login --server <url>` */
  loginServer?: string
  /** Remaining args after `ok-cli mcp` (e.g. ["list"] or ["add", "name", "cmd", ...]) */
  mcpArgs?: string[]
  /** Remaining args after `ok-cli skill` (e.g. ["list"] or ["show", "name"]) */
  skillArgs?: string[]
  version: boolean
  help: boolean
  verbose: boolean
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    subCommand: null,
    model: process.env["OPENWORK_MODEL"] ?? "claude-sonnet-4-6",
    provider: "anthropic",
    version: false,
    help: false,
    verbose: false,
  }

  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      // ── subcommands ────────────────────────────────────────────────────────
      case "login":
      case "logout":
      case "whoami":
        args.subCommand = arg
        break

      case "mcp":
        // Everything after "mcp" is consumed as mcpArgs
        args.subCommand = "mcp"
        args.mcpArgs = argv.slice(i + 1)
        i = argv.length // stop parsing
        break

      case "skill":
        // Everything after "skill" is consumed as skillArgs
        args.subCommand = "skill"
        args.skillArgs = argv.slice(i + 1)
        i = argv.length // stop parsing
        break

      // ── flags ──────────────────────────────────────────────────────────────
      case "--version":
      case "-v":
        args.version = true
        break
      case "--help":
      case "-h":
        args.help = true
        break
      case "--verbose":
        args.verbose = true
        break
      case "--model":
      case "-m":
        args.model = argv[++i] ?? args.model
        break
      case "--provider":
      case "-p":
        args.provider = argv[++i] ?? args.provider
        break
      case "--api-key":
        args.apiKey = argv[++i]
        break
      case "--base-url":
        args.baseUrl = argv[++i]
        break
      // login-specific
      case "--token":
        args.loginToken = argv[++i]
        break
      case "--server":
        args.loginServer = argv[++i]
        break

      default:
        if (!arg?.startsWith("--")) {
          positional.push(arg ?? "")
        }
    }
  }

  if (positional.length > 0 && args.subCommand === null) {
    args.task = positional.join(" ")
  }

  return args
}
