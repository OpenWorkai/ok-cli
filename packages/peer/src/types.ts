/**
 * Types for ok-cli peer-to-peer session communication.
 */

export type PeerStatus = "idle" | "working" | "unresponsive"

export interface PeerInfo {
  /** Unique session identifier */
  sessionId: string
  /** Working directory */
  cwd: string
  /** Current status */
  status: PeerStatus
  /** Human-readable alias (optional) */
  alias?: string
  /** Last heartbeat timestamp */
  lastSeen: Date
  /** Process ID */
  pid: number
}

export type MessageStatus = "queued" | "delivered" | "read"

export interface PeerMessage {
  /** Unique message ID */
  id: string
  /** Sender session ID */
  from: string
  /** Receiver session ID */
  to: string
  /** Message content (plain text) */
  content: string
  /** When the message was sent */
  sentAt: Date
  /** When the message was delivered (read from inbox) */
  deliveredAt?: Date
  /** Current status */
  status: MessageStatus
}

export interface PeerRegistry {
  /** Map of sessionId → PeerInfo */
  peers: Record<string, PeerInfo>
  /** Last update timestamp */
  updatedAt: Date
}
