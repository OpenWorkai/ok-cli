/**
 * Guardrails for RLM tree execution.
 */

import type { RlmNode, RlmTree } from "./types.ts"

/**
 * Check if decomposition is allowed based on guardrails.
 */
export function canDecompose(tree: RlmTree, node: RlmNode): { allowed: boolean; reason?: string } {
  // Depth check
  if (node.depth >= tree.config.maxDepth) {
    return { allowed: false, reason: "Maximum depth reached" }
  }

  // Budget check
  if (tree.totalTokens >= tree.config.maxBudget) {
    return { allowed: false, reason: "Token budget exhausted" }
  }

  // Branch check
  if (node.children.length >= tree.config.maxBranches) {
    return { allowed: false, reason: "Maximum branches per node reached" }
  }

  return { allowed: true }
}

/**
 * Check if the tree has cycles (should never happen, but safety check).
 */
export function hasCycle(tree: RlmTree): boolean {
  const visited = new Set<string>()
  const recStack = new Set<string>()

  function visit(nodeId: string): boolean {
    if (recStack.has(nodeId)) return true // Cycle detected
    if (visited.has(nodeId)) return false

    visited.add(nodeId)
    recStack.add(nodeId)

    const node = tree.nodes.get(nodeId)
    if (node) {
      for (const childId of node.children) {
        if (visit(childId)) return true
      }
    }

    recStack.delete(nodeId)
    return false
  }

  return visit(tree.rootId)
}

/**
 * Check if the tree execution should be terminated.
 */
export function shouldTerminate(tree: RlmTree): { terminate: boolean; reason?: string } {
  // Budget exceeded
  if (tree.totalTokens > tree.config.maxBudget) {
    return { terminate: true, reason: "Token budget exceeded" }
  }

  // Cycle detected
  if (hasCycle(tree)) {
    return { terminate: true, reason: "Cycle detected in task graph" }
  }

  // All nodes failed
  const allNodes = Array.from(tree.nodes.values())
  if (allNodes.every((n) => n.status === "failed")) {
    return { terminate: true, reason: "All nodes failed" }
  }

  return { terminate: false }
}

/**
 * Validate a proposed decomposition.
 */
export function validateDecomposition(
  tree: RlmTree,
  nodeId: string,
  subtaskCount: number
): { valid: boolean; reason?: string } {
  const node = tree.nodes.get(nodeId)
  if (!node) {
    return { valid: false, reason: "Node not found" }
  }

  // Check decompose permission
  const canDecomp = canDecompose(tree, node)
  if (!canDecomp.allowed) {
    return { valid: false, reason: canDecomp.reason }
  }

  // Check subtask count
  if (subtaskCount === 0) {
    return { valid: false, reason: "Must have at least one subtask" }
  }

  if (subtaskCount > tree.config.maxBranches) {
    return { valid: false, reason: `Too many subtasks (max: ${tree.config.maxBranches})` }
  }

  return { valid: true }
}
