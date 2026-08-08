/**
 * RLM tools for ok-cli agents.
 *
 * Core workflow:
 *   1. rlm_decide: Model decides solve vs decompose
 *   2. rlm_execute: Execute a subtask (creates sub-agent)
 *   3. rlm_synthesize: Merge subtask results
 *   4. rlm_status: View tree state
 */

import type { AgentTool } from "@earendil-works/pi-agent-core"
import { Type } from "@sinclair/typebox"
import { canDecompose, shouldTerminate, validateDecomposition } from "./guardrails.ts"
import {
  addNode,
  createTree,
  setNodeError,
  setNodeResult,
  updateNodeStatus,
  visualizeTree,
} from "./tree.ts"
import type { RlmDecision, RlmTree } from "./types.ts"

// Global tree instance (TODO: make this session-scoped)
let currentTree: RlmTree | null = null

// ─── rlm_decide ──────────────────────────────────────────────────────────────

const RlmDecideParams = Type.Object({
  task: Type.String({ description: "Task to evaluate" }),
  context: Type.Optional(Type.String({ description: "What has been done so far" })),
})

export const rlmDecideTool: AgentTool<typeof RlmDecideParams> = {
  name: "rlm_decide",
  label: "RLM Decide",
  description:
    "Decide whether to solve a task directly or decompose it into subtasks. " +
    "Returns action (solve/decompose) and reasoning.",
  parameters: RlmDecideParams,
  execute: async (_id, params) => {
    // Create tree if not exists
    if (!currentTree) {
      currentTree = createTree(params.task)
    }

    const tree = currentTree
    const rootNode = tree.nodes.get(tree.rootId)!

    // Check guardrails
    const canDecomp = canDecompose(tree, rootNode)
    if (!canDecomp.allowed) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Must solve directly. Reason: ${canDecomp.reason}`,
          },
        ],
        details: { action: "solve", reason: canDecomp.reason },
      }
    }

    // Ask model to decide (simplified: always return a template decision)
    // In real impl, this would call the model with a specialized prompt
    const decision: RlmDecision = {
      action: "solve", // Default to solve for now
      reason: "Task is simple enough to solve directly",
      estimatedCost: 500,
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(decision, null, 2),
        },
      ],
      details: decision,
    }
  },
}

// ─── rlm_execute ─────────────────────────────────────────────────────────────

const RlmExecuteParams = Type.Object({
  nodeId: Type.String({ description: "Node ID to execute" }),
  subtasks: Type.Optional(
    Type.Array(
      Type.Object({
        name: Type.String(),
        description: Type.String(),
      }),
      { description: "Subtasks to decompose into (if action = decompose)" }
    )
  ),
})

export const rlmExecuteTool: AgentTool<typeof RlmExecuteParams> = {
  name: "rlm_execute",
  label: "RLM Execute",
  description: "Execute a task node. If subtasks provided, create child nodes and execute them.",
  parameters: RlmExecuteParams,
  execute: async (_id, params) => {
    if (!currentTree) {
      throw new Error("No active RLM tree. Call rlm_decide first.")
    }

    const tree = currentTree
    const node = tree.nodes.get(params.nodeId)
    if (!node) {
      throw new Error(`Node not found: ${params.nodeId}`)
    }

    // Check termination
    const term = shouldTerminate(tree)
    if (term.terminate) {
      tree.status = "failed"
      return {
        content: [{ type: "text" as const, text: `Execution terminated: ${term.reason}` }],
        details: { terminated: true, reason: term.reason },
      }
    }

    // If subtasks provided, decompose
    if (params.subtasks && params.subtasks.length > 0) {
      const validation = validateDecomposition(tree, params.nodeId, params.subtasks.length)
      if (!validation.valid) {
        throw new Error(`Decomposition invalid: ${validation.reason}`)
      }

      updateNodeStatus(tree, params.nodeId, "decomposing")

      // Create child nodes
      const childIds: string[] = []
      for (const subtask of params.subtasks) {
        const childId = addNode(tree, params.nodeId, subtask.description)
        childIds.push(childId)
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Decomposed into ${childIds.length} subtasks:\n${params.subtasks.map((s) => `- ${s.name}`).join("\n")}`,
          },
        ],
        details: { decomposed: true, childIds },
      }
    }

    // Otherwise, solve directly (stub: just mark as done)
    updateNodeStatus(tree, params.nodeId, "solving")
    setNodeResult(tree, params.nodeId, `Result for: ${node.task}`, 100)

    return {
      content: [{ type: "text" as const, text: `Task solved: ${node.task}` }],
      details: { solved: true },
    }
  },
}

// ─── rlm_synthesize ──────────────────────────────────────────────────────────

const RlmSynthesizeParams = Type.Object({
  nodeId: Type.String({ description: "Parent node ID to synthesize results for" }),
})

export const rlmSynthesizeTool: AgentTool<typeof RlmSynthesizeParams> = {
  name: "rlm_synthesize",
  label: "RLM Synthesize",
  description: "Merge results from child nodes into parent node's final result.",
  parameters: RlmSynthesizeParams,
  execute: async (_id, params) => {
    if (!currentTree) {
      throw new Error("No active RLM tree")
    }

    const tree = currentTree
    const node = tree.nodes.get(params.nodeId)
    if (!node) {
      throw new Error(`Node not found: ${params.nodeId}`)
    }

    updateNodeStatus(tree, params.nodeId, "synthesizing")

    // Collect child results
    const childResults: string[] = []
    for (const childId of node.children) {
      const child = tree.nodes.get(childId)
      if (child?.result) {
        childResults.push(`[${child.task}]: ${child.result}`)
      }
    }

    const synthesized = `Synthesized results:\n${childResults.join("\n")}`
    setNodeResult(tree, params.nodeId, synthesized, 50)

    return {
      content: [{ type: "text" as const, text: synthesized }],
      details: { synthesized: true, childCount: childResults.length },
    }
  },
}

// ─── rlm_status ──────────────────────────────────────────────────────────────

const RlmStatusParams = Type.Object({})

export const rlmStatusTool: AgentTool<typeof RlmStatusParams> = {
  name: "rlm_status",
  label: "RLM Status",
  description: "Show current RLM tree status and visualization.",
  parameters: RlmStatusParams,
  execute: async () => {
    if (!currentTree) {
      return {
        content: [{ type: "text" as const, text: "No active RLM tree." }],
        details: {},
      }
    }

    const tree = currentTree
    const viz = visualizeTree(tree)
    const stats = `Status: ${tree.status}
Nodes: ${tree.nodes.size}
Total tokens: ${tree.totalTokens} / ${tree.config.maxBudget}

Tree:
${viz}
`

    return {
      content: [{ type: "text" as const, text: stats }],
      details: {
        nodeCount: tree.nodes.size,
        totalTokens: tree.totalTokens,
        status: tree.status,
      },
    }
  },
}

export const RLM_TOOLS: AgentTool[] = [
  rlmDecideTool,
  rlmExecuteTool,
  rlmSynthesizeTool,
  rlmStatusTool,
]
