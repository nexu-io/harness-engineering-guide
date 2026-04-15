# The AGENTS.md Pattern

AGENTS.md is a plain-text file that defines how an AI agent should behave. Drop it in a directory, and any compatible harness will read it automatically — no config UI, no API calls, just a file.

## Why It Matters

Before AGENTS.md, agent behavior was configured through platform UIs, JSON configs, or scattered across code. The file-based approach solves three problems:

1. **Version control** — Agent behavior lives in Git, reviewable in PRs
2. **Portability** — Switch harness implementations without rewriting config
3. **Transparency** — Anyone can read what the agent does and doesn't do

## Basic Structure

```markdown
# AGENTS.md

## Role
You are a backend engineer. You write Python, use PostgreSQL,
and follow the project's existing patterns.

## Rules
- Never modify files outside the `src/` directory
- Always run tests before committing
- Ask before deleting any file

## Workflow
1. Read the issue description
2. Explore relevant code with `grep` and `cat`
3. Write the implementation
4. Run `pytest` to verify
5. Commit with a descriptive message
```

That's a working AGENTS.md. The agent reads it at session start and follows it throughout.

## Real-World Examples

### Claude Code (Anthropic)

Claude Code reads `CLAUDE.md` — same pattern, different filename:

```markdown
# CLAUDE.md

## Project
This is a Next.js 14 app with TypeScript, Tailwind, and Prisma.

## Testing
- Run `npm test` for unit tests
- Run `npm run e2e` for Playwright tests
- Always run tests after changes

## Style
- Use functional components with hooks
- Prefer `const` over `let`
- No `any` types — use proper TypeScript types
```

### OpenClaw / Nexu

OpenClaw uses `AGENTS.md` plus companion files:

```markdown
# AGENTS.md

## First Run
Read SOUL.md — this is who you are.
Read USER.md — this is who you're helping.

## Memory
- Daily notes: memory/YYYY-MM-DD.md
- Long-term: MEMORY.md
Capture what matters. Skip secrets.

## Safety
- Don't exfiltrate private data
- trash > rm
- When in doubt, ask
```

The companion files (`SOUL.md`, `USER.md`, `MEMORY.md`) are the agent's persistent context. The harness reads them at session start.

## Advanced Patterns

### Conditional Rules

```markdown
## Rules
- In `main` branch: never force-push
- In feature branches: squash commits before PR
- If CI fails: fix it before asking for review
```

### Tool Restrictions

```markdown
## Allowed Tools
- read, write, edit files
- run shell commands (with confirmation for destructive ones)
- web search

## Forbidden
- No direct database writes in production
- No `rm -rf` ever
```

### Multi-Agent Setup

```markdown
## Sub-Agents
- Code review: spawn with read-only access
- Test runner: spawn with `npm test` only
- Deploy: requires human approval
```

## Common Pitfalls

- **Too vague** — "Be helpful" is useless. "Run `pytest` after every code change" is useful.
- **Too long** — The file goes into the context window. Every line costs tokens. Be concise.
- **Contradictory rules** — "Always commit" + "Never commit without tests" + "Tests are optional" → agent confusion.

## The Ecosystem

| Harness | Config File | Auto-loaded? |
|---------|------------|-------------|
| Claude Code | CLAUDE.md | ✅ |
| OpenClaw | AGENTS.md | ✅ |
| Codex | codex.md | ✅ |
| Aider | .aider.conf.yml | ✅ |
| Cline | .clinerules | ✅ |
| Cursor | .cursorrules | ✅ |

The naming varies, but the pattern is universal: **a human-readable file in the repo root that defines agent behavior**.

## Further Reading

- [OpenAI: AGENTS.md as table of contents](https://openai.com/index/harness-engineering/) — How OpenAI uses AGENTS.md in Codex
- [MEMORY.md Pattern →](memory-md.md) — The companion file for persistent memory
