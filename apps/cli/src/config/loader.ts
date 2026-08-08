/**
 * ok-cli configuration file loader.
 *
 * Loads from ~/.config/ok-cli/config.yaml (or .json)
 */

import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export interface OkCliConfig {
  peer?: {
    enabled?: boolean
    alias?: string
  }
  rlm?: {
    enabled?: boolean
    maxDepth?: number
    maxBudget?: number
    maxBranches?: number
    toolsProfile?: "full" | "read-only" | "safe"
  }
}

const CONFIG_DIR = join(homedir(), ".config", "ok-cli")
const CONFIG_PATHS = [join(CONFIG_DIR, "config.yaml"), join(CONFIG_DIR, "config.json")]

/**
 * Load config from ~/.config/ok-cli/config.yaml or config.json
 */
export function loadConfig(): OkCliConfig {
  for (const path of CONFIG_PATHS) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8")
        if (path.endsWith(".json")) {
          return JSON.parse(raw)
        }
        // Basic YAML parser (no external dependency)
        return parseSimpleYaml(raw)
      } catch {
        // Invalid config, skip
        continue
      }
    }
  }
  return {}
}

/**
 * Parse a simple YAML subset (no arrays, no complex nesting).
 * This is sufficient for ok-cli config files.
 */
function parseSimpleYaml(yaml: string): OkCliConfig {
  const config: OkCliConfig = {}
  const lines = yaml.split("\n")
  let currentSection: "peer" | "rlm" | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    // Section header
    if (trimmed === "peer:") {
      currentSection = "peer"
      config.peer = {}
      continue
    }
    if (trimmed === "rlm:") {
      currentSection = "rlm"
      config.rlm = {}
      continue
    }

    // Key-value pair
    const match = trimmed.match(/^(\w+):\s*(.+)$/)
    if (match && currentSection) {
      const [, key, value] = match
      const parsed = parseValue(value)
      if (currentSection === "peer") {
        config.peer = { ...config.peer, [key]: parsed }
      } else if (currentSection === "rlm") {
        config.rlm = { ...config.rlm, [key]: parsed }
      }
    }
  }

  return config
}

function parseValue(value: string): string | number | boolean {
  if (value === "true") return true
  if (value === "false") return false
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10)
  return value.replace(/^["']|["']$/g, "") // strip quotes
}
