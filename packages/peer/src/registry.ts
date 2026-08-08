/**
 * Peer registry — tracks all ok-cli sessions on this machine.
 *
 * Storage: ~/.config/ok-cli/peer/registry.json
 * Heartbeat TTL: 60s
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { PeerInfo, PeerRegistry, PeerStatus } from "./types.ts"

const REGISTRY_DIR = join(homedir(), ".config", "ok-cli", "peer")
const REGISTRY_PATH = join(REGISTRY_DIR, "registry.json")
const HEARTBEAT_TTL_MS = 60_000 // 60 seconds

/**
 * Ensure the peer directory exists.
 */
function ensurePeerDir() {
  if (!existsSync(REGISTRY_DIR)) {
    mkdirSync(REGISTRY_DIR, { recursive: true })
  }
}

/**
 * Load the registry from disk. Returns empty registry if file doesn't exist.
 */
export function loadRegistry(): PeerRegistry {
  ensurePeerDir()
  if (!existsSync(REGISTRY_PATH)) {
    return { peers: {}, updatedAt: new Date() }
  }
  try {
    const raw = readFileSync(REGISTRY_PATH, "utf-8")
    const data = JSON.parse(raw)
    // Revive Date objects
    data.updatedAt = new Date(data.updatedAt)
    for (const peer of Object.values(data.peers) as PeerInfo[]) {
      peer.lastSeen = new Date(peer.lastSeen)
    }
    return data
  } catch {
    return { peers: {}, updatedAt: new Date() }
  }
}

/**
 * Save the registry to disk.
 */
export function saveRegistry(registry: PeerRegistry) {
  ensurePeerDir()
  registry.updatedAt = new Date()
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf-8")
}

/**
 * Register or update a session in the registry.
 */
export function registerPeer(info: PeerInfo) {
  const registry = loadRegistry()
  registry.peers[info.sessionId] = { ...info, lastSeen: new Date() }
  saveRegistry(registry)
}

/**
 * Update heartbeat for the given session.
 */
export function heartbeat(sessionId: string) {
  const registry = loadRegistry()
  const peer = registry.peers[sessionId]
  if (peer) {
    peer.lastSeen = new Date()
    saveRegistry(registry)
  }
}

/**
 * Unregister a session from the registry.
 */
export function unregisterPeer(sessionId: string) {
  const registry = loadRegistry()
  delete registry.peers[sessionId]
  saveRegistry(registry)
}

/**
 * List all registered peers, with status computed based on last heartbeat.
 */
export function listPeers(filter?: "all" | "active" | "idle"): PeerInfo[] {
  const registry = loadRegistry()
  const now = Date.now()
  const peers = Object.values(registry.peers).map((peer) => {
    const elapsed = now - peer.lastSeen.getTime()
    let status: PeerStatus
    if (elapsed > HEARTBEAT_TTL_MS) {
      status = "unresponsive"
    } else {
      status = peer.status
    }
    return { ...peer, status }
  })

  if (!filter || filter === "all") {
    return peers
  }
  if (filter === "active") {
    return peers.filter((p) => p.status === "working")
  }
  if (filter === "idle") {
    return peers.filter((p) => p.status === "idle")
  }
  return peers
}

/**
 * Find a peer by sessionId or alias.
 */
export function findPeer(sessionIdOrAlias: string): PeerInfo | null {
  const registry = loadRegistry()
  // Try by sessionId first
  if (registry.peers[sessionIdOrAlias]) {
    return registry.peers[sessionIdOrAlias]
  }
  // Try by alias
  for (const peer of Object.values(registry.peers)) {
    if (peer.alias === sessionIdOrAlias) {
      return peer
    }
  }
  return null
}
