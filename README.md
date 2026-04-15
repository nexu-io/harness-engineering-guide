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

A **harness** is the runtime wrapper that turns a bare language model into an **agent** — an autonomous system that can perceive its environment, make decisions, and take actions over multiple steps. The harness handles everything the model can't do on its own: executing tools, managing memory, assembling context, and enforcing safety boundaries.

This guide covers harness engineering from first principles to production patterns, with real code in every article.

---

## Getting Started

| Topic | Description |
|-------|-------------|
| [What is a Harness?](guide/what-is-harness.md) | The concept in 3 minutes. How it turns a model into an agent. Harness vs. framework vs. runtime. |
| [Your First Harness](guide/your-first-harness.md) | Build a working harness in 50 lines of Python. Complete code you can copy and run. |
| [Harness vs. Framework](guide/harness-vs-framework.md) | When to use a raw harness vs. LangChain/CrewAI. Decision tree + side-by-side code comparison. |

## Core Concepts

| Topic | Description |
|-------|-------------|
| [Agentic Loop](guide/agentic-loop.md) | The think → act → observe cycle. Turn budgets, parallel tool calls, loop detection, streaming. |
| [Tool System](guide/tool-system.md) | Tool registry, static vs. dynamic loading, MCP protocol, description quality patterns. |
| [Memory & Context](guide/memory-and-context.md) | Context assembly, session management, two-tier memory (daily logs + long-term). AGENTS.md and MEMORY.md patterns. |
| [Guardrails](guide/guardrails.md) | Permission models, trust boundaries, sandboxing, prompt injection defense. |

## Practice

| Topic | Description |
|-------|-------------|
| [Context Engineering](guide/context-engineering.md) | Priority-based assembly, three lines of defense for compression, token budgeting. |
| [Sandbox](guide/sandbox.md) | Docker and Firecracker setups, network isolation, filesystem restrictions. |
| [Skill System](guide/skill-system.md) | Skill packaging, on-demand loading, SKILL.md format, thin harness + thick skills. |
| [Sub-Agent](guide/sub-agent.md) | Leader-Worker pattern, file-based communication, session isolation, parallel execution. |
| [Error Handling](guide/error-handling.md) | Error classification, retry strategies, graceful degradation, checkpoint/resume. |

## Reference

| Topic | Description |
|-------|-------------|
| [Implementation Comparison](guide/comparison.md) | Side-by-side comparison of OpenClaw, Claude Code, Codex, Cline, Aider, Cursor. |
| [Glossary](guide/glossary.md) | Key terms defined. |

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
