import { expect, test } from "bun:test"
import chalk from "chalk"
import { renderStatusLine } from "./statusline.ts"

test("renders a readable fallback without true-color support", () => {
  const originalLevel = chalk.level
  chalk.level = 0

  try {
    const result = renderStatusLine({
      version: "0.1.0",
      model: "test-model",
      provider: "anthropic",
      skillCount: 0,
      mcpCount: 0,
      sessionId: "260720-swift-river",
      mode: "safe",
    })

    expect(result).toContain("ok-cli")
    expect(result).toContain("test-model")
    expect(result).toContain("anthropic")
    expect(result).toContain("safe")
    expect(result).toContain("swift-river")
    expect(result).not.toContain("skills")
    expect(result).not.toContain("MCP")
  } finally {
    chalk.level = originalLevel
  }
})
