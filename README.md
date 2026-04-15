# Harness Engineering Guide

<p align="center">
  <em>The practical guide to building AI agent harnesses — with real code examples you can copy and run.</em>
</p>

<p align="center">
  <a href="https://github.com/nexu-io/harness-engineering-guide/stargazers"><img src="https://img.shields.io/github/stars/nexu-io/harness-engineering-guide?style=social" alt="Stars"></a>
  <a href="https://github.com/nexu-io/harness-engineering-guide/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

<p align="center">
  🌐 <b><a href="https://harness-guide.com">harness-guide.com</a></b> | <a href="https://harness-guide.com/zh/">中文站</a>
</p>

<p align="center">
  <b>English</b> | <a href="README.zh-CN.md">中文</a>
</p>

---

A **harness** is the runtime layer that wraps an AI model and turns it into a useful agent. It handles everything the model can't do on its own: reading files, calling tools, remembering context, and deciding when to stop. As AI agents move from demos to production, the harness — not the model — is becoming the differentiator.

This guide covers every aspect of harness engineering, from writing your first tool loop to scaling multi-agent systems in production.

---

## Getting Started

| Topic | Description |
|-------|-------------|
| [What is a Harness?](guide/what-is-harness.md) | The concept in 3 minutes. Minimal code example. Harness vs. framework vs. runtime. |
| [Your First Harness](guide/your-first-harness.md) | Build a working harness in 15 minutes. Complete Python code you can copy and run. |
| [Harness vs. Framework](guide/harness-vs-framework.md) | When to use a raw harness vs. LangChain/CrewAI. Decision tree + code comparison. |

## Core Patterns

| Topic | Description |
|-------|-------------|
| [The AGENTS.md Pattern](guide/agents-md.md) | Define agent behavior in a plain-text file. Version-controlled, portable, transparent. |
| [The MEMORY.md Pattern](guide/memory-md.md) | Persistent memory with daily logs + curated long-term memory. |
| [The Tool Loop](guide/tool-loop.md) | The ReAct loop in engineering terms. Adding tools without changing the loop. |
| [Skill Loading](guide/skill-loading.md) | Loading tools on demand instead of all at once. Token cost comparison. |
| [Thin Harness Architecture](guide/thin-harness.md) | Why the harness should be minimal. Thin harness + thick skills. |
| [Context Window Management](guide/context-window.md) | Priority systems, token budgets, sliding window implementation. |

## Techniques

| Topic | Description |
|-------|-------------|
| [Context Compression](guide/context-compression.md) | Three lines of defense: auto-decay, threshold, active compression. |
| [Multi-Agent Patterns](guide/multi-agent.md) | Leader-Worker, file-based inbox, handshake, auto-claim, git worktree isolation. |
| [Git Worktree Isolation](guide/git-worktree-isolation.md) | Parallel agent tasks without conflicts. Step-by-step commands. |
| [Sandbox & Security](guide/sandbox-security.md) | Docker, Firecracker, WASM. Permission models and trust boundaries. |
| [Structured Output](guide/structured-output.md) | Getting agents to return parseable data. JSON mode, schema validation. |
| [Error Recovery](guide/error-recovery.md) | Retry strategies, graceful degradation, human-in-the-loop escalation. |
| [Evaluation & Testing](guide/eval-and-testing.md) | Behavioral testing, trace replay, minimal eval framework. |

## Advanced

| Topic | Description |
|-------|-------------|
| [Harness as a Service](guide/harness-as-a-service.md) | Running harnesses in the cloud. Multi-tenant architecture. |
| [Meta-Harness](guide/meta-harness.md) | Agents that optimize their own harness. The AutoAgent pattern. |
| [Memory Portability](guide/memory-portability.md) | Moving memory between harness implementations. Migration scripts. |
| [Scaling Dimensions](guide/scaling-dimensions.md) | Time × Space × Interaction framework for analyzing any harness. |

## Reference

| Topic | Description |
|-------|-------------|
| [Implementation Comparison](guide/comparison.md) | Side-by-side comparison of OpenClaw, Claude Code, Codex, Cline, Aider, Cursor, Nexu. |
| [Glossary](guide/glossary.md) | 23 key terms defined. |

---

## How to Contribute

1. Go to [**Issues → New Issue**](https://github.com/nexu-io/harness-engineering-guide/issues/new/choose)
2. Choose **"📬 Submit a Resource"**
3. Fill in the title, URL, and why it's relevant

Or submit a PR directly — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Community

- 💬 **GitHub Discussions** — [Join the conversation](https://github.com/nexu-io/harness-engineering-guide/discussions)
- 🐦 **Twitter** — [@nexudotio](https://x.com/nexudotio)
- 💬 **飞书群** — [加入 Harness Engineering 话题群](https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=717g465a-0bc8-4242-9281-12b23953491a)

---

## About

Maintained by [Nexu](https://github.com/nexu-io) — the open-source Claude Co-worker & Managed Agent platform.

## License

[MIT License](LICENSE)

---

If you find this guide useful, please consider giving it a ⭐

```
@misc{nexu_harness-engineering-guide_2026,
  author = {Nexu Team},
  title = {Harness Engineering Guide},
  year = {2026},
  publisher = {GitHub},
  howpublished = {\url{https://github.com/nexu-io/harness-engineering-guide}}
}
```
