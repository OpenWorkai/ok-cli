/**
 * Bash tool — execute shell commands with timeout.
 * Mirrors pi-coding-agent's bash tool contract.
 */

export interface BashInput {
  command: string
  /** Timeout in ms, default 30_000 */
  timeout?: number
  /** Working directory, default process.cwd() */
  cwd?: string
}

export interface BashOutput {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

export async function runBash(input: BashInput): Promise<BashOutput> {
  const timeout = input.timeout ?? 30_000
  const cwd = input.cwd ?? process.cwd()

  const proc = Bun.spawn(["bash", "-c", input.command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })

  const timer = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), timeout)
  )

  const result = await Promise.race([proc.exited, timer])

  if (result === "timeout") {
    proc.kill()
    return { stdout: "", stderr: "Command timed out", exitCode: -1, timedOut: true }
  }

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()

  return { stdout, stderr, exitCode: result, timedOut: false }
}
