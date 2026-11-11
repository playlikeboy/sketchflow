# ECC subset vendored for Sketchflow

Source: https://github.com/affaan-m/ecc (version 2.2.3, commit d2ef2680594f9a17526a6e1a2e18b3d242c5d17b), MIT licensed (see LICENSE).

This is a hand-picked, markdown-only subset for a Next.js + TypeScript + Postgres app:

- `.claude/skills/`: 14 skills (security review, TDD, verification, React/Next.js, Postgres, e2e, accessibility, SEO, API design)
- `.claude/agents/`: 15 subagents (code/security/TypeScript/React/database reviewers, planner, architect, build fixer, and more)
- `.claude/rules/ecc/`: common, TypeScript, React, and web rules

Deliberately left out: ECC hooks and scripts (they execute on every tool call), rules for other
languages, and the remaining ~300 skills that do not apply to this stack.

`AGENTS.md` at the repo root stays the source of truth; where these rules disagree with it, `AGENTS.md` wins.

To update, re-copy the same paths from a newer ECC checkout and bump the commit above.
