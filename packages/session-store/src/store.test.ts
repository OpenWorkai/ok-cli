import { expect, test } from "bun:test"
import { generateId } from "./store.ts"

test("generates a dated human-readable session id", () => {
  const originalRandom = Math.random
  Math.random = () => 0

  try {
    expect(generateId()).toMatch(/^\d{6}-swift-river$/)
  } finally {
    Math.random = originalRandom
  }
})
