import { expect, test } from "bun:test"
import { parseSkillFile } from "./parser.ts"

test("parses supported frontmatter fields", () => {
  const skill = parseSkillFile(
    `---
name: "review"
description: 'Review a change'
model: claude
system: concise
user_invocable: false
---
Review the current diff.
`,
    "/workspace/.ok-cli/skills/review/SKILL.md",
    "local"
  )

  expect(skill).toEqual({
    name: "review",
    description: "Review a change",
    model: "claude",
    system: "concise",
    filePath: "/workspace/.ok-cli/skills/review/SKILL.md",
    scope: "local",
    userInvocable: false,
    body: "Review the current diff.",
  })
})

test("uses the parent directory for a Windows-style SKILL.md path", () => {
  const filePath = String.raw`C:\Users\dev\.codex\skills\review\SKILL.md`
  const skill = parseSkillFile("Review the current diff.", filePath, "codex")

  expect(skill.name).toBe("review")
})
