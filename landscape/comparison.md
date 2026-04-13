# Harness Implementations Compared

A living comparison of major AI agent harness implementations. Last updated: April 2026.

## Overview

| Project | Stars | License | Model Support | Memory Model | Architecture |
|---------|-------|---------|--------------|-------------|-------------|
| **[OpenClaw](https://github.com/openclaw/openclaw)** | 355K | Apache-2.0 | Any model | User-owned files | Thin harness + skills |
| **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** | — | Proprietary | Claude only | Platform-managed | Monolithic |
| **[Codex](https://openai.com/codex)** | — | Proprietary | GPT only | Encrypted summaries | Cloud HaaS |
| **[Cline](https://github.com/cline/cline)** | ~60K | Apache-2.0 | Multi-model | Session-based | VS Code extension |
| **[Aider](https://github.com/paul-gauthier/aider)** | ~43K | Apache-2.0 | Multi-model | Git-based | CLI tool |
| **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** | 70K | MIT | Multi-model | Configurable | Multi-agent framework |
| **[Nexu](https://github.com/nexu-io/nexu)** | 2.3K | MIT | Any model | User-owned files | Desktop client + harness |

## Detailed Breakdown

### Context Management

| Project | Max Context | Overflow Strategy | Context Prioritization |
|---------|------------|-------------------|----------------------|
| OpenClaw | Model limit | Summarization + sliding | Configurable |
| Claude Code | 200K | Built-in compaction | Automatic |
| Codex | Model limit | Cloud-managed | Automatic |
| Cline | Model limit | Truncation | Manual |
| Aider | Model limit | Repository map | Automatic |

### Memory Persistence

| Project | Memory Type | Cross-session | Exportable | Editable |
|---------|-----------|--------------|-----------|----------|
| OpenClaw | MEMORY.md + daily files | ✅ | ✅ | ✅ |
| Claude Code | CLAUDE.md + platform | ✅ | ❌ | Partial |
| Codex | Encrypted summaries | ✅ | ❌ | ❌ |
| Cline | .cline/ directory | ✅ | ✅ | ✅ |
| Aider | Git history | ✅ | ✅ | ✅ |
| Nexu | MEMORY.md + wiki/ | ✅ | ✅ | ✅ |

### Skill / Tool System

| Project | Skill Model | Community Skills | Install Method |
|---------|-----------|-----------------|---------------|
| OpenClaw | SKILL.md based | 5,400+ | `openclaw skill install` |
| Claude Code | Built-in + MCP | Limited | MCP config |
| Codex | Built-in | No | — |
| Cline | MCP integration | Via MCP | MCP config |
| Aider | Built-in | Limited | — |
| Nexu | OpenClaw skills | 5,400+ | GUI or CLI |

### Multi-Agent Support

| Project | Multi-agent | Coordination | Observability |
|---------|-----------|-------------|--------------|
| OpenClaw | Sub-agents + sessions | Hub-and-spoke | Session logs |
| Claude Code | Limited (tool use) | Sequential | — |
| Codex | Codex tasks | Parallel tasks | Dashboard |
| Hermes Agent | Native multi-agent | Configurable | Built-in |
| Nexu | Sub-agents + ACP | Hub-and-spoke | Dashboard |

---

*This comparison is community-maintained. If you spot inaccuracies, please [open an issue](https://github.com/nexu-io/harness-engineering-guide/issues).*
