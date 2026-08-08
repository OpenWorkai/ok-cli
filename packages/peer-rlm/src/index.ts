/**
 * @openwork/peer-rlm — unified export for peer + rlm capabilities.
 */

import { PEER_TOOLS } from "@openwork/peer"
import { RLM_TOOLS } from "@openwork/rlm"

export { PEER_TOOLS, RLM_TOOLS }

export const ALL_TOOLS = [...PEER_TOOLS, ...RLM_TOOLS]

// Re-export types
export type { PeerInfo, PeerMessage, PeerRegistry } from "@openwork/peer"
export type { RlmTree, RlmNode, RlmConfig, RlmDecision } from "@openwork/rlm"

// Re-export core functions
export {
  registerPeer,
  heartbeat,
  unregisterPeer,
  listPeers,
  findPeer,
  sendMessage,
  readInbox,
  countUnread,
} from "@openwork/peer"

export {
  createTree,
  addNode,
  updateNodeStatus,
  setNodeResult,
  visualizeTree,
  canDecompose,
  shouldTerminate,
} from "@openwork/rlm"
