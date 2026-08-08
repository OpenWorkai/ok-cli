/**
 * @openwork/rlm — public API
 */

export type {
  RlmConfig,
  RlmNode,
  RlmTree,
  RlmDecision,
  RlmAction,
  RlmNodeStatus,
  ToolsProfile,
} from "./types.ts"
export {
  createTree,
  addNode,
  updateNodeStatus,
  setNodeResult,
  setNodeError,
  getLeafNodes,
  getNodesAtDepth,
  isDepthComplete,
  visualizeTree,
} from "./tree.ts"
export {
  canDecompose,
  hasCycle,
  shouldTerminate,
  validateDecomposition,
} from "./guardrails.ts"
export { RLM_TOOLS, rlmDecideTool, rlmExecuteTool, rlmSynthesizeTool, rlmStatusTool } from "./tools.ts"
