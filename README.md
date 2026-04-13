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

<!-- 🌐 Documentation site coming soon -->

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

We welcome contributions from everyone — whether you're a harness engineer, a researcher, or just someone who found a useful resource. The easiest way to contribute is through **GitHub Issues**.

### 📬 Submit a Resource (Easiest Way!)

Found a paper, tool, blog post, or tutorial related to Harness Engineering? Submit it in 3 steps:

1. Go to [**Issues → New Issue**](https://github.com/nexu-io/harness-engineering-guide/issues/new/choose)
2. Choose **"📬 Submit a Resource"**
3. Fill in the title, URL, and a brief note on why it's relevant

That's it! The maintainers will review your submission and add it to the appropriate section of the guide. You'll be credited as a contributor.

**What kinds of resources are we looking for?**
- 📄 Academic papers on agent architecture, memory, context management
- 🛠️ Open-source tools and frameworks
- 📝 Blog posts and articles with technical depth
- 🎥 Talks and video tutorials
- 📰 News about harness implementations (new releases, architecture changes)
- 💡 Anything else that helps people understand Harness Engineering

### 💡 Suggest a Topic

Want the guide to cover something specific? [Open a Topic Request](https://github.com/nexu-io/harness-engineering-guide/issues/new?template=suggest-topic.md) and tell us what you'd like to see.

### ✍️ Write Content (PRs Welcome)

For those who want to contribute directly:

1. Fork the repository
2. Create a branch: `git checkout -b your-topic`
3. Write your content in Markdown
4. Submit a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for writing style and structure guidelines.

---

## Community

- 💬 **Discord** — [Join the Nexu Discord](https://discord.gg/nexu) (#harness-engineering channel)
- 🐦 **Twitter** — Follow [@nexu](https://x.com/nexu) for updates
- 📫 **Newsletter** — Subscribe to the weekly Harness Engineering digest *(coming soon)*
- 💬 **飞书群** — [加入 Harness Engineering 话题群](https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=717g465a-0bc8-4242-9281-12b23953491a)

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
