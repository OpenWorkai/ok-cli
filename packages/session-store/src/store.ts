import { existsSync } from "node:fs"
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { SessionMeta, TurnRecord } from "./types.ts"

const SESSIONS_DIR = join(homedir(), ".config", "ok-cli", "sessions")
const INDEX_FILE = join(SESSIONS_DIR, "index.json")

const ADJECTIVES = [
  "swift",
  "quiet",
  "bright",
  "calm",
  "bold",
  "deep",
  "sharp",
  "gentle",
  "warm",
  "cool",
  "vast",
  "still",
  "keen",
  "pure",
  "wild",
  "soft",
  "clear",
  "dark",
  "fair",
  "free",
  "glad",
  "high",
  "lone",
  "open",
] as const

const NOUNS = [
  "river",
  "cloud",
  "stone",
  "wind",
  "flame",
  "forest",
  "peak",
  "tide",
  "dawn",
  "dusk",
  "rain",
  "star",
  "lake",
  "vale",
  "mist",
  "oak",
  "wave",
  "reef",
  "glow",
  "cove",
  "path",
  "gate",
  "grove",
  "brook",
] as const

export function generateId(): string {
  const d = new Date()
  const date = d.toISOString().slice(2, 10).replace(/-/g, "")
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] ?? ADJECTIVES[0]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)] ?? NOUNS[0]
  return `${date}-${adj}-${noun}`
}

async function ensureDir(): Promise<void> {
  await mkdir(SESSIONS_DIR, { recursive: true })
}

async function readIndex(): Promise<SessionMeta[]> {
  if (!existsSync(INDEX_FILE)) return []
  try {
    return JSON.parse(await readFile(INDEX_FILE, "utf-8")) as SessionMeta[]
  } catch {
    return []
  }
}

async function writeIndex(index: SessionMeta[]): Promise<void> {
  await writeFile(INDEX_FILE, JSON.stringify(index, null, 2))
}

export async function createSessionRecord(opts: {
  model: string
  provider: string
  cwd: string
  name?: string
}): Promise<SessionMeta> {
  await ensureDir()
  const id = generateId()
  const now = new Date().toISOString()
  const meta: SessionMeta = {
    id,
    ...(opts.name !== undefined ? { name: opts.name } : {}),
    model: opts.model,
    provider: opts.provider,
    cwd: opts.cwd,
    createdAt: now,
    updatedAt: now,
    turns: 0,
  }
  const index = await readIndex()
  index.unshift(meta)
  await writeIndex(index)
  return meta
}

export async function appendTurn(id: string, turn: TurnRecord): Promise<void> {
  await ensureDir()
  await appendFile(join(SESSIONS_DIR, `${id}.jsonl`), `${JSON.stringify(turn)}\n`)
  const index = await readIndex()
  const entry = index.find((s) => s.id === id)
  if (entry) {
    entry.updatedAt = turn.ts
    entry.turns++
    await writeIndex(index)
  }
}

export async function loadSessionTurns(id: string): Promise<TurnRecord[]> {
  const file = join(SESSIONS_DIR, `${id}.jsonl`)
  if (!existsSync(file)) return []
  const raw = await readFile(file, "utf-8")
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as TurnRecord)
}

export async function listSessions(limit = 20): Promise<SessionMeta[]> {
  return (await readIndex()).slice(0, limit)
}
