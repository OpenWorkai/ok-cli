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

export interface ProcessInput {
  command: string[]
  /** Timeout in ms, default 30_000 */
  timeout?: number
  /** Working directory, default process.cwd() */
  cwd?: string
}

export async function runBash(input: BashInput): Promise<BashOutput> {
  return runProcess({
    command: ["bash", "-c", input.command],
    ...(input.timeout !== undefined ? { timeout: input.timeout } : {}),
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
  })
}

export async function runProcess(input: ProcessInput): Promise<BashOutput> {
  const timeout = input.timeout ?? 30_000
  const cwd = input.cwd ?? process.cwd()

  const proc = Bun.spawn(input.command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })

  const stdoutPromise = new Response(proc.stdout).text()
  const stderrPromise = new Response(proc.stderr).text()
  let timerId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timerId = setTimeout(() => resolve("timeout"), timeout)
  })

  const result = await Promise.race([proc.exited, timeoutPromise])
  if (timerId !== undefined) clearTimeout(timerId)

  if (result === "timeout") {
    proc.kill()
    await proc.exited
    await Promise.allSettled([stdoutPromise, stderrPromise])
    return { stdout: "", stderr: "Command timed out", exitCode: -1, timedOut: true }
  }

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])

  return { stdout, stderr, exitCode: result, timedOut: false }
}
