/**
 * Types for RLM (Recursive Language Model) task decomposition.
 */

export type RlmNodeStatus = "pending" | "decomposing" | "solving" | "synthesizing" | "done" | "failed"

export type ToolsProfile = "full" | "read-only" | "safe"

export interface RlmConfig {
  /** Maximum recursion depth (default: 3) */
  maxDepth: number
  /** Maximum token budget across all nodes (default: 10000) */
  maxBudget: number
  /** Maximum branches per node (default: 3) */
  maxBranches: number
  /** Tools profile for task execution */
  toolsProfile: ToolsProfile
}

export interface RlmNode {
  /** Unique node ID */
  id: string
  /** Parent node ID (null for root) */
  parentId: string | null
  /** Current depth in the tree */
  depth: number
  /** Task description */
  task: string
  /** Current status */
  status: RlmNodeStatus
  /** Child node IDs */
  children: string[]
  /** Final result (populated when done) */
  result?: string
  /** Error message (if failed) */
  error?: string
  /** Token count for this node's execution */
  tokens: number
  /** Timestamps */
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

export interface RlmTree {
  /** Root node ID */
  rootId: string
  /** Map of nodeId → RlmNode */
  nodes: Map<string, RlmNode>
  /** Configuration */
  config: RlmConfig
  /** Total tokens consumed */
  totalTokens: number
  /** Tree status */
  status: "running" | "done" | "failed"
}

export type RlmAction = "solve" | "decompose"

export interface RlmDecision {
  /** Chosen action */
  action: RlmAction
  /** Subtasks (only if action = decompose) */
  subtasks?: { name: string; description: string }[]
  /** Reasoning */
  reason: string
  /** Estimated token cost */
  estimatedCost: number
}
