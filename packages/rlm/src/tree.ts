/**
 * RLM tree structure management.
 */

import { nanoid } from "nanoid"
import type { RlmConfig, RlmNode, RlmTree } from "./types.ts"

/**
 * Create a new RLM tree with a root task.
 */
export function createTree(rootTask: string, config: Partial<RlmConfig> = {}): RlmTree {
  const rootId = nanoid()
  const root: RlmNode = {
    id: rootId,
    parentId: null,
    depth: 0,
    task: rootTask,
    status: "pending",
    children: [],
    tokens: 0,
    createdAt: new Date(),
  }

  const fullConfig: RlmConfig = {
    maxDepth: config.maxDepth ?? 3,
    maxBudget: config.maxBudget ?? 10000,
    maxBranches: config.maxBranches ?? 3,
    toolsProfile: config.toolsProfile ?? "full",
  }

  return {
    rootId,
    nodes: new Map([[rootId, root]]),
    config: fullConfig,
    totalTokens: 0,
    status: "running",
  }
}

/**
 * Add a child node to a parent.
 */
export function addNode(tree: RlmTree, parentId: string, task: string): string {
  const parent = tree.nodes.get(parentId)
  if (!parent) {
    throw new Error(`Parent node not found: ${parentId}`)
  }

  const nodeId = nanoid()
  const node: RlmNode = {
    id: nodeId,
    parentId,
    depth: parent.depth + 1,
    task,
    status: "pending",
    children: [],
    tokens: 0,
    createdAt: new Date(),
  }

  parent.children.push(nodeId)
  tree.nodes.set(nodeId, node)

  return nodeId
}

/**
 * Update node status.
 */
export function updateNodeStatus(tree: RlmTree, nodeId: string, status: RlmNode["status"]) {
  const node = tree.nodes.get(nodeId)
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`)
  }
  node.status = status

  if (status === "solving" || status === "decomposing") {
    node.startedAt = new Date()
  }
  if (status === "done" || status === "failed") {
    node.completedAt = new Date()
  }
}

/**
 * Set node result.
 */
export function setNodeResult(tree: RlmTree, nodeId: string, result: string, tokens: number) {
  const node = tree.nodes.get(nodeId)
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`)
  }
  node.result = result
  node.tokens = tokens
  tree.totalTokens += tokens
  updateNodeStatus(tree, nodeId, "done")
}

/**
 * Set node error.
 */
export function setNodeError(tree: RlmTree, nodeId: string, error: string) {
  const node = tree.nodes.get(nodeId)
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`)
  }
  node.error = error
  updateNodeStatus(tree, nodeId, "failed")
}

/**
 * Get all leaf nodes (nodes with no children).
 */
export function getLeafNodes(tree: RlmTree): RlmNode[] {
  return Array.from(tree.nodes.values()).filter((n) => n.children.length === 0)
}

/**
 * Get all nodes at a specific depth.
 */
export function getNodesAtDepth(tree: RlmTree, depth: number): RlmNode[] {
  return Array.from(tree.nodes.values()).filter((n) => n.depth === depth)
}

/**
 * Check if all nodes at a given depth are done.
 */
export function isDepthComplete(tree: RlmTree, depth: number): boolean {
  const nodes = getNodesAtDepth(tree, depth)
  return nodes.length > 0 && nodes.every((n) => n.status === "done" || n.status === "failed")
}

/**
 * Get tree visualization as ASCII art.
 */
export function visualizeTree(tree: RlmTree): string {
  const lines: string[] = []
  const root = tree.nodes.get(tree.rootId)
  if (!root) return ""

  function visit(nodeId: string, prefix: string, isLast: boolean) {
    const node = tree.nodes.get(nodeId)
    if (!node) return

    const connector = isLast ? "└─" : "├─"
    const statusIcon =
      node.status === "done"
        ? "✓"
        : node.status === "failed"
          ? "✗"
          : node.status === "solving"
            ? "⚙"
            : "○"

    lines.push(`${prefix}${connector} [${statusIcon}] ${node.task.slice(0, 50)}...`)

    const childPrefix = prefix + (isLast ? "   " : "│  ")
    node.children.forEach((childId, i) => {
      visit(childId, childPrefix, i === node.children.length - 1)
    })
  }

  visit(tree.rootId, "", true)
  return lines.join("\n")
}
