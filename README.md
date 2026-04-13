# Harness Engineering Guide

<p align="center">
  <em>The open guide to Harness Engineering — concepts, tutorials, papers, tools, and resources for building and managing AI agent runtimes.</em>
</p>

<p align="center">
  <a href="https://github.com/nexu-io/harness-engineering-guide/stargazers"><img src="https://img.shields.io/github/stars/nexu-io/harness-engineering-guide?style=social" alt="Stars"></a>
  <a href="https://github.com/nexu-io/harness-engineering-guide/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

<p align="center">
  <b>English</b> | <a href="README.zh-CN.md">中文</a>
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

## 📖 Guide

| Title | Description |
|-------|-------------|
| [Introduction to Harness Engineering](guide/introduction.md) | What is a Harness? Harness vs Runtime vs Framework. Why it matters now. |
| [Core Concepts](guide/concepts.md) | The five pillars: Context Management, Memory & Persistence, Skill Orchestration, Agent Lifecycle, Multi-Agent Coordination. |
| [Architecture Patterns](guide/patterns.md) | Thin Harness + Thick Skills vs Monolithic vs Harness-as-a-Service. Side-by-side comparison of Claude Code, Codex, and OpenClaw. |
| [Memory Systems](guide/memory.md) | The AGENTS.md / MEMORY.md pattern. Session vs long-term memory. Memory ownership & portability. |
| [Security & Sandboxing](guide/security.md) | Permission models, sandbox architectures (Docker / Firecracker / WASM), trust boundaries. |

---

## 🔍 Landscape

| Title | Description |
|-------|-------------|
| [Harness Implementations Compared](landscape/comparison.md) | Detailed comparison of 7 products across context management, memory, skills, and multi-agent support. |
| [Open-Source Harness Projects](landscape/open-source.md) | 20+ curated open-source projects: agent runtimes, memory systems, multi-agent frameworks, skill ecosystems. |
| [Commercial Platforms](landscape/commercial.md) | Commercial harness and managed agent platforms: Claude Code, Codex, Cursor, Windsurf, Devin. |

---

## 📄 Papers & Research

| Title | Description |
|-------|-------------|
| [Foundational Papers](papers/foundational.md) | 8 key papers: ReAct, Toolformer, Generative Agents, MemGPT, AutoGen, and more. |
| Memory & Context | *(coming soon)* |
| Multi-Agent Systems | *(coming soon)* |
| Benchmarks & Evaluation | *(coming soon)* |

---

## 🐦 Community Voices — What People Are Saying

Essential reads and discussions from the Harness Engineering community.

### Official & Foundational

| Title | Author | Description |
|-------|--------|-------------|
| [Harness Engineering](https://openai.com/index/harness-engineering/) | OpenAI | The blog post that coined the term. How OpenAI uses harness engineering to generate 1M+ lines of production code. |
| [Multi-Agent Harness for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) | Anthropic | How Anthropic uses a Generator + Evaluator multi-agent harness for frontend design and autonomous software engineering. |
| [Your Harness, Your Memory](https://blog.langchain.dev/) | Harrison Chase | The essay that argued memory belongs inside your agent harness, not behind a third-party API. |

### Deep Dives & Analysis

| Title | Author | Description |
|-------|--------|-------------|
| [Harness Engineering Scalability](https://yage.ai/share/harness-engineering-scalability-20260330.html) | Wayne Zhang ([@wayne_zhang0](https://x.com/wayne_zhang0)) | "The best article on Harness Engineering I've seen" — deep dive on scalability patterns. 742 likes, 1299 bookmarks. |
| [Claude Code & Codex Harness Design Philosophy](https://x.com/wquguru/status/2039333332987810103) | WquGuru🦀 ([@wquguru](https://x.com/wquguru)) | Two open PDF books dissecting the harness architecture of Claude Code and Codex. 1976 likes, 3306 bookmarks. |
| [Components of a Coding Agent](https://x.com/Hesamation/status/2040453130324709805) | ℏεsam ([@Hesamation](https://x.com/Hesamation)), ref. Sebastian Raschka | 6 critical components of a coding agent harness: repo context, prompt cache, tools, context reduction, session memory, subagents. 394 likes. |
| [池建强：Harness 两本 PDF 书推荐](https://x.com/sagacity/status/2042515263837605900) | 池建强 ([@sagacity](https://x.com/sagacity)) | Recommended two PDF books on Harness Engineering + personal reflection on why harness is emerging now. 1112 likes, 1616 bookmarks. |
| [驾驭工程：从 Claude Code 源码到 AI 编码最佳实践](https://x.com/QingQ77/status/2040709023058583774) | Geek Lite ([@QingQ77](https://x.com/QingQ77)) | "The Horse Book" — a Chinese technical book analyzing Claude Code v2.1.88 harness from source maps. 400 likes, 561 bookmarks. |
| [花叔：Harness Engineering Orange Book](https://github.com/alchaincyf/harness-engineering-orange-book) | 花叔 ([@AlchainHust](https://x.com/AlchainHust)) | Open-source reference book on Harness Engineering. |

### Practice & Case Studies

| Title | Author | Description |
|-------|--------|-------------|
| [Deux: Swift → Kotlin via Harness](https://x.com/hwwaanng/status/2040064208461762993) | Hwang ([@hwwaanng](https://x.com/hwwaanng)) | A harness that converts any Swift codebase to native Kotlin Android — self-verifying, self-iterating, spawning sub-agents. 655 likes, 887 bookmarks. |
| [Meta-Harness: Automated Harness Optimization](https://x.com/LiorOnAI/status/2038669301541228606) | Lior Alexander ([@LiorOnAI](https://x.com/LiorOnAI)) | Automated harness engineering — a 6x performance gap from harness changes alone, not model changes. 242 likes, 390 bookmarks. |
| [AutoAgent: Self-Optimizing Agent](https://x.com/servasyy_ai/status/2040411682355511646) | huangserva ([@servasyy_ai](https://x.com/servasyy_ai)) | First self-optimizing agent: Meta-Agent reads failure traces and rewrites its own harness. #1 on SpreadsheetBench (96.5%) and TerminalBench (55.1%). |
| [Kitaru 0.4.0: Memory in the Harness](https://x.com/strickvl/status/2043620630273343925) | Alex Strick ([@strickvl](https://x.com/strickvl)) | Implementing "Your Harness, Your Memory" — versioned memory with provenance tracking built into the harness substrate. |
| [Learn Harness Engineering (Repo)](https://github.com/walkinglabs/learn-harness-engineering) | Sanbu ([@sanbuphy](https://x.com/sanbuphy)) | Complete Harness Engineering practice guide following OpenAI & Anthropic official materials. 298 likes, 447 bookmarks. |
| [Ralph: Simple Harness Loop](https://github.com/snarktank/ralph) | via Wayne Zhang | "Better than all the harness engineering frameworks I've researched" — simple, effective, no context drift. 729 likes, 1162 bookmarks. |

### Industry Perspectives

| Title | Author | Description |
|-------|--------|-------------|
| [Anthropic 切掉第三方 Harness 订阅：深度分析](https://x.com/_LuoFuli/status/2040825059342721520) | Fuli Luo ([@_LuoFuli](https://x.com/_LuoFuli)) | Why Anthropic cut third-party harness subscriptions, what it means for compute economics, and the co-evolution thesis. 1770 likes. |
| [Claude Managed Agents 开源版](https://x.com/berryxia/status/2042016446243631328) | Berryxia ([@berryxia](https://x.com/berryxia)) | Open-source replication of Claude Managed Agents — production-ready agent harness + infrastructure. 346 likes. |
| [Managed Agents 拆解](https://x.com/indigox/status/2042047463562080483) | indigo ([@indigox](https://x.com/indigox)) | Three core concepts (Agent, Environment, Session), four common scenarios, and why managed harness solves enterprise pain. |
| [Zeratul's Law: Agent Harness Bloat](https://x.com/z3ratul163071/status/2042831408226304279) | z3ratul ([@z3ratul163071](https://x.com/z3ratul163071)) | "Every agent harness will bloat to become unusable within 2 months of hitting the GitHub exponential." |
| [Skill 膨胀与 Harness 框架整合](https://x.com/kasong2048/status/2038599301618889042) | 卡颂 ([@kasong2048](https://x.com/kasong2048)) | On skill explosion across harness frameworks and strategies for consolidation. 464 likes, 558 bookmarks. |

---

## 🛠️ Tutorials

| Title | Description |
|-------|-------------|
| Build Your First Agent Harness | *(coming soon)* |
| Adding Persistent Memory to Any Agent | *(coming soon)* |
| Multi-Agent Task Scheduling | *(coming soon)* |
| Writing a Custom Skill | *(coming soon)* |
| Migrating from LangChain to a Thin Harness | *(coming soon)* |

---

## 📰 Weekly Digest

> Inspired by [ruanyf/weekly](https://github.com/ruanyf/weekly) — a curated weekly roundup of Harness Engineering news, papers, and tools.

| Issue | Date | Status |
|-------|------|--------|
| [2026-W16](weekly/2026-W16.md) | Apr 14–20 | *upcoming* |

---

## 🧰 Tools & Resources

| Title | Description |
|-------|-------------|
| Harness Frameworks | *(coming soon)* |
| Memory Solutions | *(coming soon)* |
| Sandbox & Security Tools | *(coming soon)* |
| Monitoring & Observability | *(coming soon)* |
| Datasets | *(coming soon)* |

---

## How to Contribute

We welcome contributions from everyone — whether you're a harness engineer, a researcher, or just someone who found a useful resource. The easiest way to contribute is through **GitHub Issues**.

### 📬 Submit a Resource (Easiest Way!)

Found a paper, tool, blog post, or tutorial related to Harness Engineering? Submit it in 3 steps:

1. Go to [**Issues → New Issue**](https://github.com/nexu-io/harness-engineering-guide/issues/new/choose)
2. Choose **"📬 Submit a Resource"**
3. Fill in the title, URL, and a brief note on why it's relevant

That's it! The maintainers will review your submission and add it to the appropriate section of the guide. You'll be credited as a contributor.

### 💬 Join the Discussion

Have questions, ideas, or insights? Head to [**Discussions**](https://github.com/nexu-io/harness-engineering-guide/discussions):

- 💡 **Ideas** — Suggest improvements to the guide
- ❓ **Q&A** — Ask technical questions about Harness Engineering
- 📰 **Show & Tell** — Share your harness implementations and learnings

### ✍️ Write Content (PRs Welcome)

1. Fork the repository
2. Create a branch: `git checkout -b your-topic`
3. Write your content in Markdown
4. Submit a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## Community

- 💬 **GitHub Discussions** — [Join the conversation](https://github.com/nexu-io/harness-engineering-guide/discussions)
- 🐦 **Twitter** — Follow [@nexu](https://x.com/nexu) for updates
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
