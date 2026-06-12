/**
 * OpenWork cloud auth — token storage and retrieval.
 *
 * Token file: ~/.config/ok-cli/auth.json
 */

import { homedir } from "os"
import { join } from "path"
import { mkdir, readFile, writeFile, unlink } from "fs/promises"

const CONFIG_DIR = join(homedir(), ".config", "ok-cli")
const AUTH_FILE = join(CONFIG_DIR, "auth.json")

/** Default OpenWork backend URL */
export const DEFAULT_SERVER = "https://api.openwork.ai"

export interface AuthData {
  /** JWT / opaque auth token */
  token: string
  /** User email, if returned by the server */
  email?: string
  /** Backend base URL (no trailing slash) */
  server: string
  /** ISO-8601 expiry, or absent for non-expiring tokens */
  expiresAt?: string
}

/** Read saved auth data, or null if not logged in. */
export async function readAuth(): Promise<AuthData | null> {
  try {
    const raw = await readFile(AUTH_FILE, "utf8")
    return JSON.parse(raw) as AuthData
  } catch {
    return null
  }
}

/** Persist auth data to disk. */
export async function writeAuth(data: AuthData): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(AUTH_FILE, JSON.stringify(data, null, 2) + "\n", "utf8")
}

/** Delete saved auth data. Returns true if a file was removed. */
export async function clearAuth(): Promise<boolean> {
  try {
    await unlink(AUTH_FILE)
    return true
  } catch {
    return false
  }
}

/** True if the token has a recorded expiry that has already passed. */
export function isTokenExpired(auth: AuthData): boolean {
  if (!auth.expiresAt) return false
  return new Date(auth.expiresAt) < new Date()
}

/**
 * Verify a token against the server and return user info.
 * Throws if the server is unreachable or returns a non-2xx status.
 */
export async function verifyToken(
  token: string,
  server: string = DEFAULT_SERVER
): Promise<{ email?: string; expiresAt?: string }> {
  const url = `${server}/v1/auth/me`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Server returned ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as { email?: string; expiresAt?: string }
}
