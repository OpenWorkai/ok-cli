#!/usr/bin/env bun
/**
 * Build script — bundles the CLI into a single distributable file.
 *
 * Output: apps/cli/dist/index.js  (standalone, requires Bun at runtime)
 *
 * Usage:
 *   bun run scripts/build.ts
 *   bun run build          (via root package.json)
 */

import { join } from "node:path"
import { writeFile, rm, mkdir } from "node:fs/promises"

const ROOT = join(import.meta.dir, "..")
const ENTRY = join(ROOT, "apps/cli/src/index.ts")
const OUT_DIR = join(ROOT, "apps/cli/dist")
const OUT_FILE = join(OUT_DIR, "index.js")

console.log("🔨 Building ok-cli …")
await rm(OUT_DIR, { recursive: true, force: true })
await mkdir(OUT_DIR, { recursive: true })

const result = await Bun.build({
  entrypoints: [ENTRY],
  outdir: OUT_DIR,
  target: "bun",
  format: "esm",
  minify: false, // keep readable for debugging
  sourcemap: "none",
  naming: "index.js",
  external: [],   // bundle everything — no runtime deps needed
})

if (!result.success) {
  console.error("Build failed:")
  for (const log of result.logs) console.error(" ", log)
  process.exit(1)
}

// Ensure shebang is present (Bun.build usually preserves it, but guard either way)
const content = await Bun.file(OUT_FILE).text()
if (!content.startsWith("#!")) {
  await writeFile(OUT_FILE, `#!/usr/bin/env bun\n${content}`, "utf8")
}

// Make executable
await Bun.spawn(["chmod", "+x", OUT_FILE]).exited

const stat = await Bun.file(OUT_FILE).size
console.log(`✓ ${OUT_FILE}  (${(stat / 1024).toFixed(1)} KB)`)
console.log("  Install locally: npm install -g ./apps/cli")
