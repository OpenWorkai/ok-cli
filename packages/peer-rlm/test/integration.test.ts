/**
 * Integration tests for peer-rlm capabilities.
 *
 * Run with: bun test packages/peer-rlm/test/integration.test.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import {
  registerPeer,
  heartbeat,
  unregisterPeer,
  listPeers,
  findPeer,
  sendMessage,
  readInbox,
  countUnread,
  createTree,
  addNode,
  updateNodeStatus,
  setNodeResult,
  visualizeTree,
  canDecompose,
  shouldTerminate,
  type PeerInfo,
} from "../src/index.ts"

const TEST_PEER_DIR = join(homedir(), ".config", "ok-cli", "peer")

describe("peer: session registry", () => {
  const session1: PeerInfo = {
    sessionId: "test-001",
    cwd: "/tmp/project",
    status: "idle",
    alias: "test-session",
    lastSeen: new Date(),
    pid: 12345,
  }

  afterEach(() => {
    // Cleanup: unregister test sessions
    unregisterPeer("test-001")
    unregisterPeer("test-002")
  })

  test("register and list peers", () => {
    registerPeer(session1)
    const peers = listPeers()
    expect(peers.some((p) => p.sessionId === "test-001")).toBe(true)
  })

  test("find peer by sessionId", () => {
    registerPeer(session1)
    const found = findPeer("test-001")
    expect(found?.sessionId).toBe("test-001")
  })

  test("find peer by alias", () => {
    registerPeer(session1)
    const found = findPeer("test-session")
    expect(found?.sessionId).toBe("test-001")
  })

  test("heartbeat updates lastSeen", () => {
    registerPeer(session1)
    const before = findPeer("test-001")?.lastSeen.getTime() || 0
    setTimeout(() => {
      heartbeat("test-001")
      const after = findPeer("test-001")?.lastSeen.getTime() || 0
      expect(after).toBeGreaterThan(before)
    }, 10)
  })

  test("unregister removes peer", () => {
    registerPeer(session1)
    unregisterPeer("test-001")
    const found = findPeer("test-001")
    expect(found).toBeNull()
  })
})

describe("peer: mailbox messaging", () => {
  beforeEach(() => {
    // Cleanup mailboxes
    const mailDir = join(TEST_PEER_DIR, "mail")
    if (existsSync(mailDir)) {
      rmSync(mailDir, { recursive: true, force: true })
    }
  })

  test("send and receive message", () => {
    const msgId = sendMessage("sender-001", "receiver-001", "Hello from sender")
    expect(msgId).toBeTruthy()

    const inbox = readInbox("receiver-001")
    expect(inbox.length).toBe(1)
    expect(inbox[0].content).toContain("Hello from sender")
    expect(inbox[0].from).toBe("sender-001")
  })

  test("read inbox deletes messages", () => {
    sendMessage("sender-001", "receiver-001", "Message 1")
    sendMessage("sender-001", "receiver-001", "Message 2")

    const inbox1 = readInbox("receiver-001")
    expect(inbox1.length).toBe(2)

    const inbox2 = readInbox("receiver-001")
    expect(inbox2.length).toBe(0) // Messages deleted after read
  })

  test("count unread messages", () => {
    sendMessage("sender-001", "receiver-001", "Message 1")
    sendMessage("sender-001", "receiver-001", "Message 2")

    const unread = countUnread("receiver-001")
    expect(unread).toBe(2)

    readInbox("receiver-001")
    const unreadAfter = countUnread("receiver-001")
    expect(unreadAfter).toBe(0)
  })

  test("message wrapping includes boundary declaration", () => {
    sendMessage("sender-001", "receiver-001", "Hello")
    const inbox = readInbox("receiver-001")
    expect(inbox[0].content).toContain("[From: ok-cli session sender-001]")
    expect(inbox[0].content).toContain(
      "This message comes from another ok-cli session, not the user"
    )
  })
})

describe("rlm: tree structure", () => {
  test("create tree with root node", () => {
    const tree = createTree("Analyze codebase")
    expect(tree.nodes.size).toBe(1)
    expect(tree.status).toBe("running")

    const root = tree.nodes.get(tree.rootId)
    expect(root?.task).toBe("Analyze codebase")
    expect(root?.depth).toBe(0)
  })

  test("add child nodes", () => {
    const tree = createTree("Root task")
    const child1 = addNode(tree, tree.rootId, "Subtask 1")
    const child2 = addNode(tree, tree.rootId, "Subtask 2")

    expect(tree.nodes.size).toBe(3) // root + 2 children
    const root = tree.nodes.get(tree.rootId)
    expect(root?.children).toEqual([child1, child2])

    const c1 = tree.nodes.get(child1)
    expect(c1?.depth).toBe(1)
  })

  test("update node status", () => {
    const tree = createTree("Root task")
    updateNodeStatus(tree, tree.rootId, "solving")
    const root = tree.nodes.get(tree.rootId)
    expect(root?.status).toBe("solving")
    expect(root?.startedAt).toBeDefined()
  })

  test("set node result", () => {
    const tree = createTree("Root task")
    setNodeResult(tree, tree.rootId, "Task completed", 500)
    const root = tree.nodes.get(tree.rootId)
    expect(root?.result).toBe("Task completed")
    expect(root?.tokens).toBe(500)
    expect(tree.totalTokens).toBe(500)
    expect(root?.status).toBe("done")
  })

  test("visualize tree", () => {
    const tree = createTree("Root task")
    const child = addNode(tree, tree.rootId, "Child task")
    setNodeResult(tree, child, "Done", 100)

    const viz = visualizeTree(tree)
    expect(viz).toContain("Root task")
    expect(viz).toContain("Child task")
    expect(viz).toContain("✓") // done icon
  })
})

describe("rlm: guardrails", () => {
  test("canDecompose respects maxDepth", () => {
    const tree = createTree("Root", { maxDepth: 2 })
    const child = addNode(tree, tree.rootId, "Child")
    const grandchild = addNode(tree, child, "Grandchild")

    const node = tree.nodes.get(grandchild)!
    const check = canDecompose(tree, node)
    expect(check.allowed).toBe(false)
    expect(check.reason).toContain("Maximum depth")
  })

  test("canDecompose respects maxBudget", () => {
    const tree = createTree("Root", { maxBudget: 1000 })
    tree.totalTokens = 1000

    const root = tree.nodes.get(tree.rootId)!
    const check = canDecompose(tree, root)
    expect(check.allowed).toBe(false)
    expect(check.reason).toContain("budget")
  })

  test("shouldTerminate detects budget exceeded", () => {
    const tree = createTree("Root", { maxBudget: 1000 })
    tree.totalTokens = 1500

    const check = shouldTerminate(tree)
    expect(check.terminate).toBe(true)
    expect(check.reason).toContain("budget exceeded")
  })
})
