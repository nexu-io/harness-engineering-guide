# Harness Engineering Guide

<p align="center">
  <em>The open guide to Harness Engineering — concepts, tutorials, papers, tools, and resources for building and managing AI agent runtimes.</em>
</p>

<p align="center">
  <a href="https://github.com/nexu-io/harness-engineering-guide/stargazers"><img src="https://img.shields.io/github/stars/nexu-io/harness-engineering-guide?style=social" alt="Stars"></a>
  <a href="https://github.com/nexu-io/harness-engineering-guide/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://discord.gg/nexu"><img src="https://img.shields.io/badge/Discord-Join-7289da" alt="Discord"></a>
</p>

---

Harness Engineering is an emerging discipline focused on building, configuring, and managing the runtime layer that wraps AI models — the code that sits between a raw LLM and a useful agent. It covers everything from context management and memory persistence to skill orchestration and multi-agent coordination.

As AI agents move from demos to production, the harness layer — not the model — is becoming the differentiator. This guide aims to be the most comprehensive open resource on Harness Engineering.

🌐 **[harness-engineering-guide.dev](https://harness-engineering-guide.dev)** (documentation site — coming soon)

---

## Why Harness Engineering?

> *"You don't own the model. You own the harness. And the harness owns the memory."*
> — Harrison Chase, LangChain

- **Models are commoditizing** — GPT, Claude, Gemini, open-source LLMs all converge in capability.
- **The harness is the moat** — How you manage context, memory, tools, and agent lifecycle determines product quality.
- **512K lines and counting** — Claude Code's harness alone is 512K lines. This is real engineering, not a wrapper.

---

## Table of Contents

### 📖 Guide

- [Introduction to Harness Engineering](guide/introduction.md)
  - [What is a Harness?](guide/introduction.md#what-is-a-harness)
  - [Harness vs Runtime vs Framework](guide/introduction.md#harness-vs-runtime-vs-framework)
  - [Why Harness Engineering Matters](guide/introduction.md#why-harness-engineering-matters)
- [Core Concepts](guide/concepts.md)
  - [Context Management](guide/concepts.md#context-management)
  - [Memory & Persistence](guide/concepts.md#memory--persistence)
  - [Skill / Tool Orchestration](guide/concepts.md#skill--tool-orchestration)
  - [Agent Lifecycle](guide/concepts.md#agent-lifecycle)
  - [Multi-Agent Coordination](guide/concepts.md#multi-agent-coordination)
- [Architecture Patterns](guide/patterns.md)
  - [Thin Harness + Thick Skills](guide/patterns.md#thin-harness--thick-skills)
  - [Monolithic Harness](guide/patterns.md#monolithic-harness)
  - [Harness-as-a-Service](guide/patterns.md#harness-as-a-service)
  - [Comparison: Claude Code vs Codex vs OpenClaw](guide/patterns.md#comparison-claude-code-vs-codex-vs-openclaw)
- [Memory Systems](guide/memory.md)
  - [AGENTS.md / MEMORY.md Pattern](guide/memory.md#agentsmd--memorymd-pattern)
  - [Session vs Long-term Memory](guide/memory.md#session-vs-long-term-memory)
  - [Memory Ownership & Portability](guide/memory.md#memory-ownership--portability)
- [Security & Sandboxing](guide/security.md)
  - [Permission Models](guide/security.md#permission-models)
  - [Sandbox Architectures](guide/security.md#sandbox-architectures)
  - [Trust Boundaries](guide/security.md#trust-boundaries)

### 🛠️ Tutorials

- [Build Your First Agent Harness](tutorials/first-harness.md) *(coming soon)*
- [Adding Persistent Memory to Any Agent](tutorials/persistent-memory.md) *(coming soon)*
- [Multi-Agent Task Scheduling](tutorials/multi-agent-scheduling.md) *(coming soon)*
- [Writing a Custom Skill](tutorials/custom-skill.md) *(coming soon)*
- [Migrating from LangChain to a Thin Harness](tutorials/langchain-migration.md) *(coming soon)*

### 🔍 Landscape

- [Harness Implementations Compared](landscape/comparison.md)
  - Claude Code | Codex | OpenClaw | Cline | Aider | Hermes Agent
- [Open-Source Harness Projects](landscape/open-source.md)
- [Commercial Platforms](landscape/commercial.md)

### 📰 Weekly Digest

> Inspired by [ruanyf/weekly](https://github.com/ruanyf/weekly) — a curated weekly roundup of Harness Engineering news, papers, and tools.

- [2026-W16 (Apr 14–20)](weekly/2026-W16.md) *(upcoming)*

### 📄 Papers

- [Foundational Papers](papers/foundational.md)
- [Memory & Context](papers/memory-context.md)
- [Multi-Agent Systems](papers/multi-agent.md)
- [Benchmarks & Evaluation](papers/benchmarks.md)

### 🧰 Tools & Resources

- [Harness Frameworks](tools/frameworks.md)
- [Memory Solutions](tools/memory.md)
- [Sandbox & Security Tools](tools/sandbox.md)
- [Monitoring & Observability](tools/monitoring.md)
- [Datasets](tools/datasets.md)

---

## How to Contribute

We welcome contributions from the community! Here's how you can help:

1. **Add content** — Write a guide section, tutorial, or tool review
2. **Submit papers** — Found a relevant paper? Add it to the papers section
3. **Weekly digest** — Help curate Harness Engineering news
4. **Translations** — Help translate the guide (Chinese, Japanese, etc.)
5. **Fix errors** — Spot something wrong? Open an issue or PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## Community

- 💬 **Discord** — [Join the Nexu Discord](https://discord.gg/nexu) (#harness-engineering channel)
- 🐦 **Twitter** — Follow [@nexu](https://x.com/nexu) for updates
- 📫 **Newsletter** — Subscribe to the weekly Harness Engineering digest *(coming soon)*
- 💬 **飞书群** — [加入飞书讨论群](https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=8b7k7b5b-ac27-4748-9165-78606dc16913)

---

## About

Harness Engineering Guide is maintained by [Nexu](https://github.com/nexu-io) — the open-source Claude Co-worker & Managed Agent platform. We believe the harness layer is the next frontier of AI engineering, and this knowledge should be open.

---

## License

[MIT License](LICENSE)

---

If you find this guide useful, please consider giving it a ⭐ — it helps others discover it.

```
@misc{nexu_harness-engineering-guide_2026,
  author = {Nexu Team},
  title = {Harness Engineering Guide: The Open Guide to Harness Engineering},
  year = {2026},
  publisher = {GitHub},
  journal = {GitHub repository},
  howpublished = {\url{https://github.com/nexu-io/harness-engineering-guide}}
}
```
