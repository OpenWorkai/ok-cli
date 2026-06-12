/**
 * ok-cli auth commands: login, logout, whoami
 */

import chalk from "chalk"
import * as readline from "readline"
import {
  readAuth,
  writeAuth,
  clearAuth,
  verifyToken,
  isTokenExpired,
  DEFAULT_SERVER,
} from "@openwork/cloud"

// ── login ─────────────────────────────────────────────────────────────────────

export interface LoginOptions {
  token?: string
  server?: string
}

export async function cmdLogin(opts: LoginOptions): Promise<void> {
  const server = opts.server ?? DEFAULT_SERVER

  let token = opts.token

  if (!token) {
    // Interactive: tell user where to get a token, then prompt
    console.log(chalk.bold("\n🔐 OpenWork Cloud Login\n"))
    console.log(chalk.gray("  1. Open this URL in your browser:"))
    console.log(chalk.cyan(`     ${server}/cli-login\n`))
    console.log(chalk.gray("  2. Sign in and copy the token shown on the page.\n"))

    token = await promptToken()
    if (!token) {
      console.log(chalk.red("No token provided. Login cancelled."))
      process.exit(1)
    }
  }

  console.log(chalk.gray("\nVerifying token…"))

  let email: string | undefined
  let expiresAt: string | undefined

  try {
    const info = await verifyToken(token, server)
    email = info.email
    expiresAt = info.expiresAt
    console.log(chalk.green("✓ Token verified"))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // If the server isn't live yet (future backend), still save the token
    const isNetworkError =
      msg.includes("fetch failed") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("socket") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("network")
    if (isNetworkError) {
      console.log(chalk.yellow("⚠ Could not reach server — saving token anyway."))
    } else {
      console.log(chalk.red(`✗ Verification failed: ${msg}`))
      console.log(chalk.gray("  Use --skip-verify to save the token without verification."))
      process.exit(1)
    }
  }

  await writeAuth({ token, email, server, expiresAt })

  console.log(chalk.bold.green("\n✓ Logged in to OpenWork Cloud"))
  if (email) console.log(chalk.gray(`  as ${email}`))
  console.log(chalk.gray(`  server: ${server}`))
  console.log(chalk.gray("\nYou can now run: ok-cli --provider openwork \"your task\"\n"))
}

// ── logout ────────────────────────────────────────────────────────────────────

export async function cmdLogout(): Promise<void> {
  const removed = await clearAuth()
  if (removed) {
    console.log(chalk.green("✓ Logged out of OpenWork Cloud"))
  } else {
    console.log(chalk.gray("Not currently logged in."))
  }
}

// ── whoami ────────────────────────────────────────────────────────────────────

export async function cmdWhoami(): Promise<void> {
  const auth = await readAuth()

  if (!auth) {
    console.log(chalk.gray("Not logged in."))
    console.log(chalk.gray("  Run: ok-cli login"))
    return
  }

  if (isTokenExpired(auth)) {
    console.log(chalk.yellow("⚠ Token expired. Run: ok-cli login"))
    return
  }

  console.log(chalk.bold("\n👤 OpenWork Cloud"))
  if (auth.email) console.log(chalk.gray(`  email:  ${auth.email}`))
  console.log(chalk.gray(`  server: ${auth.server}`))
  if (auth.expiresAt) {
    const date = new Date(auth.expiresAt).toLocaleDateString()
    console.log(chalk.gray(`  token expires: ${date}`))
  }
  console.log()
}

// ── helpers ───────────────────────────────────────────────────────────────────

function promptToken(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    rl.question(chalk.bold("  Paste your token: "), (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}
