/**
 * ok-cli mcp subcommands:
 *   mcp list              — show configured servers
 *   mcp add <n> <cmd> … — add stdio server
 *   mcp remove <n>       — remove a server
 *   mcp test <n>         — connect and list tools live
 */

import { MCP_CONFIG_PATH, emptyConfig, readMcpConfig, writeMcpConfig } from "@openwork/mcp"
import { connectMcpServer } from "@openwork/mcp"
import chalk from "chalk"

export async function cmdMcp(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv

  switch (sub) {
    case undefined:
    case "list":
      return cmdMcpList()
    case "add":
      return cmdMcpAdd(rest)
    case "remove":
    case "rm":
      return cmdMcpRemove(rest)
    case "test":
      return cmdMcpTest(rest)
    default:
      console.error(chalk.red(`Unknown mcp command: ${sub}`))
      printMcpHelp()
      process.exit(1)
  }
}

// ── list ──────────────────────────────────────────────────────────────────────

async function cmdMcpList(): Promise<void> {
  const config = await readMcpConfig()
  const servers = Object.entries(config?.mcpServers ?? {})

  console.log(chalk.bold("\n🔌 MCP Servers"))
  console.log(chalk.gray(`   config: ${MCP_CONFIG_PATH}\n`))

  if (servers.length === 0) {
    console.log(chalk.gray("  No servers configured."))
    console.log(chalk.gray("  Add one: ok-cli mcp add <name> <command> [args…]\n"))
    console.log(chalk.gray("  Examples:"))
    console.log(
      chalk.gray("    ok-cli mcp add filesystem npx -y @modelcontextprotocol/server-filesystem ~/")
    )
    console.log(chalk.gray("    ok-cli mcp add github npx -y @modelcontextprotocol/server-github"))
    return
  }

  for (const [name, cfg] of servers) {
    if ("command" in cfg) {
      const cmd = [cfg.command, ...(cfg.args ?? [])].join(" ")
      console.log(`  ${chalk.cyan(name)}  ${chalk.gray("stdio:")} ${cmd}`)
    } else {
      console.log(`  ${chalk.cyan(name)}  ${chalk.gray("sse:")} ${cfg.url}`)
    }
  }
  console.log()
}

// ── add ───────────────────────────────────────────────────────────────────────

async function cmdMcpAdd(argv: string[]): Promise<void> {
  // ok-cli mcp add <name> <command> [args...]
  const [name, command, ...args] = argv

  if (!name || !command) {
    console.error(chalk.red("Usage: ok-cli mcp add <name> <command> [args…]"))
    console.error(
      chalk.gray(
        "  Example: ok-cli mcp add filesystem npx -y @modelcontextprotocol/server-filesystem ~/"
      )
    )
    process.exit(1)
  }

  const config = (await readMcpConfig()) ?? emptyConfig()

  if (config.mcpServers[name]) {
    console.error(
      chalk.yellow(`⚠ Server "${name}" already exists. Remove it first: ok-cli mcp remove ${name}`)
    )
    process.exit(1)
  }

  config.mcpServers[name] = { command, args }
  await writeMcpConfig(config)

  console.log(chalk.green(`✓ Added MCP server: ${name}`))
  console.log(chalk.gray(`  command: ${[command, ...args].join(" ")}`))
  console.log(chalk.gray(`\n  Test it: ok-cli mcp test ${name}`))
}

// ── remove ────────────────────────────────────────────────────────────────────

async function cmdMcpRemove(argv: string[]): Promise<void> {
  const [name] = argv
  if (!name) {
    console.error(chalk.red("Usage: ok-cli mcp remove <name>"))
    process.exit(1)
  }

  const config = await readMcpConfig()
  if (!config?.mcpServers[name]) {
    console.error(chalk.red(`Server "${name}" not found.`))
    process.exit(1)
  }

  delete config.mcpServers[name]
  await writeMcpConfig(config)
  console.log(chalk.green(`✓ Removed MCP server: ${name}`))
}

// ── test ──────────────────────────────────────────────────────────────────────

async function cmdMcpTest(argv: string[]): Promise<void> {
  const [name] = argv
  if (!name) {
    console.error(chalk.red("Usage: ok-cli mcp test <name>"))
    process.exit(1)
  }

  const config = await readMcpConfig()
  const serverConfig = config?.mcpServers[name]
  if (!serverConfig) {
    console.error(chalk.red(`Server "${name}" not found. Run: ok-cli mcp list`))
    process.exit(1)
  }

  console.log(chalk.bold(`\n🔌 Testing MCP server: ${name}\n`))

  try {
    process.stdout.write(chalk.gray("  Connecting…"))
    const conn = await connectMcpServer(name, serverConfig)
    process.stdout.write(chalk.green(" ✓\n"))

    console.log(
      chalk.gray(`  ${conn.tools.length} tool${conn.tools.length !== 1 ? "s" : ""} available:\n`)
    )

    for (const tool of conn.tools) {
      console.log(`  ${chalk.cyan(tool.name)}`)
      if (tool.description) {
        console.log(chalk.gray(`    ${tool.description.split("\n")[0]}`))
      }
    }

    await conn.close()
    console.log(chalk.green("\n✓ Connection OK\n"))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(chalk.red(` ✗\n\nFailed: ${msg}\n`))
    process.exit(1)
  }
}

// ── help ──────────────────────────────────────────────────────────────────────

function printMcpHelp() {
  console.log(`
${chalk.bold("ok-cli mcp")} — Manage MCP servers

  ok-cli mcp list                        List configured servers
  ok-cli mcp add <name> <cmd> [args…]   Add a stdio server
  ok-cli mcp remove <name>              Remove a server
  ok-cli mcp test <name>                Test connection and list tools
`)
}
