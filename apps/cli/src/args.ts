/**
 * CLI argument parser for ok-cli.
 */

export interface CliArgs {
  task?: string
  model: string
  provider: string
  apiKey?: string
  baseUrl?: string
  version: boolean
  help: boolean
  verbose: boolean
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
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
      default:
        if (!arg?.startsWith("--")) {
          positional.push(arg ?? "")
        }
    }
  }

  if (positional.length > 0) {
    args.task = positional.join(" ")
  }

  return args
}
