/**
 * A skill is a named, reusable agent prompt loaded from a markdown file.
 *
 * File formats supported:
 *
 *   1. ok-cli native (flat file):
 *      ~/.config/ok-cli/skills/code-review.md
 *
 *   2. ok-cli native (directory):
 *      ~/.config/ok-cli/skills/code-review/SKILL.md
 *
 *   3. Claude Code compatible:
 *      ~/.claude/skills/code-review/SKILL.md
 *
 *   4. Codex compatible:
 *      ~/.codex/skills/code-review/SKILL.md
 *
 * Frontmatter (all fields optional):
 *
 *   ---
 *   name: code-review
 *   description: Review code for bugs and style
 *   model: claude-opus-4-7           # optional model override
 *   system: You are an expert reviewer  # optional system prompt prefix
 *   user_invocable: true             # Claude Code compat — false = hide from /skills
 *   ---
 *
 *   Review the code in the current directory...
 */

export interface SkillMeta {
  /** Skill identifier — used as the slash command name */
  name: string
  /** Short description shown in /skills and ok-cli skill list */
  description?: string
  /** Optional model override for this skill */
  model?: string
  /** Optional system-prompt prefix injected before the default system prompt */
  system?: string
  /** Absolute path to the skill file */
  filePath: string
  /**
   * "local"  — .ok-cli/skills/ (project-level)
   * "global" — ~/.config/ok-cli/skills/
   * "claude" — ~/.claude/skills/ (Claude Code compat)
   * "codex"  — ~/.codex/skills/ (Codex compat)
   */
  scope: "local" | "global" | "claude" | "codex"
  /**
   * Whether the skill appears in the /skills listing.
   * Maps to `user_invocable` frontmatter field; defaults true.
   * Skills with user_invocable: false are still loadable by name, just hidden from the list.
   */
  userInvocable: boolean
}

export interface Skill extends SkillMeta {
  /** The prompt body (everything after frontmatter) */
  body: string
}
