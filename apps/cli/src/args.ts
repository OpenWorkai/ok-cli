/**
 * CLI argument parser for ok-cli.
 */

export type SubCommand = "login" | "logout" | "whoami" | "mcp" | "skill" | null
export type CliMode = "interactive" | "rpc"

export interface CliArgs {
  subCommand: SubCommand
  mode: CliMode
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
  quiet: boolean
  /** Explicitly permit mutating, shell, and MCP tools in one-shot mode. */
  allowAll: boolean
  /** Enable peer-to-peer session communication */
  peerEnable: boolean
  /** Enable RLM (recursive task decomposition) */
  rlmEnable: boolean
}

/**
 * Auto-detect a sensible default provider from the API keys present in the
 * environment, so a bare `ok-cli` works without flags when only e.g. OpenAI or
 * DeepSeek keys are configured. Anthropic wins when multiple are present.
 */
function detectDefaultProvider(): string {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic"
  if (process.env.OPENAI_API_KEY) return "openai"
  if (process.env.DEEPSEEK_API_KEY) return "deepseek"
  return "anthropic"
}

function defaultModelForProvider(provider: string): string {
  switch (provider) {
    case "openai":
      return "gpt-4o"
    case "deepseek":
      return "deepseek-chat"
    default:
      return "claude-sonnet-4-6"
  }
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    subCommand: null,
    mode: "interactive",
    // Sentinels — resolved below from env/flags so a bare `ok-cli` follows
    // whatever key the user actually has configured.
    model: "",
    provider: "",
    version: false,
    help: false,
    verbose: false,
    quiet: false,
    allowAll: false,
    peerEnable: false,
    rlmEnable: false,
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
      case "--quiet":
      case "-q":
        args.quiet = true
        break
      case "--allow-all":
        args.allowAll = true
        break
      case "--peer-enable":
        args.peerEnable = true
        break
      case "--rlm-enable":
        args.rlmEnable = true
        break
      case "--mode": {
        const mode = argv[++i]
        if (mode === "rpc") args.mode = mode
        break
      }
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

  // Fill gaps left by the sentinel defaults. Explicit -p/-m flags already
  // overwrote the sentinel values above, so this only applies to bare runs.
  if (!args.provider) args.provider = detectDefaultProvider()
  if (!args.model) {
    args.model = process.env.OPENWORK_MODEL ?? defaultModelForProvider(args.provider)
  }

  return args
}
