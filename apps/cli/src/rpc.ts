/**
 * Headless JSONL transport used by the OpenWork desktop app.
 *
 * Agent lifecycle events are already compatible with the Pi RPC event shape
 * consumed by OpenWork, so this adapter only owns command dispatch and the
 * initial readiness handshake.
 */

import { createInterface } from "node:readline"
import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core"
import { collectTrustedReadOnlyToolNames, createToolPermissionHook } from "./tool-permissions.ts"

type RpcCommand =
  | { type: "get_state"; id?: string }
  | { type: "prompt"; message?: string }
  | { type: "abort" }

export interface RpcAgent {
  subscribe(listener: (event: AgentEvent) => void): () => void
  prompt(message: string): Promise<void>
  abort(): void
  waitForIdle?(): Promise<void>
}

export interface RpcOptions {
  model: string
  provider: string
  apiKey?: string
  baseUrl?: string
  tools: AgentTool[]
  allowAll?: boolean
}

type WriteLine = (line: string) => void

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createRpcController(agent: RpcAgent, writeLine: WriteLine) {
  const emit = (event: unknown) => writeLine(`${JSON.stringify(event)}\n`)

  agent.subscribe((event) => emit(event))

  return {
    async handleLine(line: string): Promise<void> {
      let command: RpcCommand
      try {
        command = JSON.parse(line) as RpcCommand
      } catch {
        emit({
          type: "response",
          command: "parse",
          success: false,
          error: "Invalid JSON command",
        })
        return
      }

      switch (command.type) {
        case "get_state":
          emit({
            type: "response",
            id: command.id,
            command: "get_state",
            success: true,
            data: { runtime: "ok-cli" },
          })
          break

        case "prompt":
          if (!command.message) {
            emit({
              type: "response",
              command: "prompt",
              success: false,
              error: "Prompt message is required",
            })
            break
          }
          void agent.prompt(command.message).catch((error: unknown) => {
            emit({
              type: "message_update",
              message: { role: "assistant", content: [] },
              assistantMessageEvent: {
                type: "error",
                reason: "error",
                errorMessage: errorMessage(error),
              },
            })
          })
          break

        case "abort":
          agent.abort()
          break

        default:
          emit({
            type: "response",
            command: (command as { type?: string }).type ?? "unknown",
            success: false,
            error: "Unsupported RPC command",
          })
      }
    },
  }
}

export async function runRpc(options: RpcOptions): Promise<void> {
  // Keep the runtime dependency lazy so controller-only consumers and tests do
  // not initialize the model stack before they need it.
  const { createSession } = await import("@openwork/core")
  const { agent } = createSession(
    {
      model: {
        provider: options.provider as import("@openwork/core").Provider,
        model: options.model,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
      },
      cwd: process.cwd(),
    },
    options.tools,
    {
      beforeToolCall: createToolPermissionHook({
        getMode: () => (options.allowAll ? "allow-all" : "safe"),
        trustedReadOnlyToolNames: collectTrustedReadOnlyToolNames(options.tools),
        requestApproval: async () => false,
      }),
    }
  )

  const controller = createRpcController(agent, (line) => process.stdout.write(line))
  const input = createInterface({ input: process.stdin, terminal: false })
  for await (const line of input) {
    if (line.trim()) await controller.handleLine(line)
  }
  await agent.waitForIdle()
}
