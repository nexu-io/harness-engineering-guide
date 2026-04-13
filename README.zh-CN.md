# Harness Engineering Guide

<p align="center">
  <em>Harness Engineering 开放指南 — 概念、教程、论文、工具和资源，帮助你构建和管理 AI Agent 运行时。</em>
</p>

<p align="center">
  <a href="https://github.com/nexu-io/harness-engineering-guide/stargazers"><img src="https://img.shields.io/github/stars/nexu-io/harness-engineering-guide?style=social" alt="Stars"></a>
  <a href="https://github.com/nexu-io/harness-engineering-guide/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <b>中文</b>
</p>

---

Harness Engineering 是一门新兴学科，专注于构建、配置和管理包裹 AI 模型的运行时层 —— 也就是位于原始 LLM 和有用 Agent 之间的代码。它涵盖了从上下文管理、记忆持久化到 Skill 编排和多 Agent 协调的所有内容。

随着 AI Agent 从 Demo 走向生产，harness 层 —— 而非模型 —— 正在成为真正的差异化因素。本指南旨在成为 Harness Engineering 领域最全面的开放资源。

---

## 为什么是 Harness Engineering？

> *"你不拥有模型，你拥有的是 harness。而 harness 拥有记忆。"*
> — Harrison Chase, LangChain

- **模型正在商品化** — GPT、Claude、Gemini、开源 LLM 的能力差距越来越小。
- **Harness 才是护城河** — 你如何管理上下文、记忆、工具和 Agent 生命周期，决定了产品质量。
- **51.2 万行代码** — 仅 Claude Code 的 harness 就有 51.2 万行。这是真正的工程，不是套壳。

---

## 📖 指南

| 标题 | 简介 |
|------|------|
| [Harness Engineering 入门](zh-guide/introduction.md) | 什么是 Harness？Harness vs Runtime vs Framework。为什么现在很重要。 |
| [核心概念](zh-guide/concepts.md) | 五大支柱：上下文管理、记忆与持久化、Skill 编排、Agent 生命周期、多 Agent 协调。 |
| [架构模式](zh-guide/patterns.md) | Thin Harness + Thick Skills vs 单体 vs Harness-as-a-Service。Claude Code、Codex、OpenClaw 横向对比。 |
| [记忆系统](zh-guide/memory.md) | AGENTS.md / MEMORY.md 模式。会话记忆 vs 长期记忆。记忆所有权与可迁移性。 |
| [安全与沙箱](zh-guide/security.md) | 权限模型、沙箱架构（Docker / Firecracker / WASM）、信任边界。 |

---

## 🔍 行业全景

| 标题 | 简介 |
|------|------|
| [Harness 实现横向对比](landscape/comparison.md) | 7 个产品在上下文管理、记忆、Skill、多 Agent 等维度的详细对比。 |
| [开源 Harness 项目](landscape/open-source.md) | 20+ 精选开源项目：Agent 运行时、记忆系统、多 Agent 框架、Skill 生态。 |
| [商业平台](landscape/commercial.md) | 商业 Harness 和托管 Agent 平台：Claude Code、Codex、Cursor、Windsurf、Devin。 |

---

## 📄 论文与研究

| 标题 | 简介 |
|------|------|
| [基础论文](papers/foundational.md) | 8 篇关键论文：ReAct、Toolformer、Generative Agents、MemGPT、AutoGen 等。 |
| 记忆与上下文 | *即将发布* |
| 多 Agent 系统 | *即将发布* |
| 评测与基准 | *即将发布* |

---

## 🐦 社区之声 — 大家在聊什么

来自 Harness Engineering 社区的精选文章和讨论。

### 官方 & 基石

| 标题 | 作者 | 简介 |
|------|------|------|
| [Harness Engineering](https://openai.com/index/harness-engineering/) | OpenAI | 定义 Harness Engineering 的开山博客。OpenAI 如何用 harness 生成超 100 万行生产级代码。 |
| [Multi-Agent Harness 实践](https://www.anthropic.com/engineering/harness-design-long-running-apps) | Anthropic | Generator + Evaluator 多 Agent harness，用于前端设计和长时间自主软件工程。 |
| [Your Harness, Your Memory](https://blog.langchain.dev/) | Harrison Chase | 记忆属于你的 harness，不属于第三方 API。 |

### 深度解析

| 标题 | 作者 | 简介 |
|------|------|------|
| [Harness Engineering Scalability](https://yage.ai/share/harness-engineering-scalability-20260330.html) | Wayne Zhang ([@wayne_zhang0](https://x.com/wayne_zhang0)) | "目前看到写 harness engineering 写得最好的文章" — 可扩展性深度拆解。742 赞，1299 收藏。 |
| [Claude Code & Codex Harness 设计哲学](https://x.com/wquguru/status/2039333332987810103) | WquGuru🦀 ([@wquguru](https://x.com/wquguru)) | 两本开放 PDF 书，解剖 Claude Code 和 Codex 的 harness 架构。1976 赞，3306 收藏。 |
| [Coding Agent 六大核心组件](https://x.com/Hesamation/status/2040453130324709805) | ℏεsam ([@Hesamation](https://x.com/Hesamation)) | repo context、prompt cache、tools、context reduction、session memory、subagents。394 赞。 |
| [池建强：Harness 两本 PDF 书推荐](https://x.com/sagacity/status/2042515263837605900) | 池建强 ([@sagacity](https://x.com/sagacity)) | Harness 两本 PDF 书推荐 + 为什么 harness 现在才冒出来。1112 赞，1616 收藏。 |
| [驾驭工程：《马书》](https://x.com/QingQ77/status/2040709023058583774) | Geek Lite ([@QingQ77](https://x.com/QingQ77)) | 从 Claude Code v2.1.88 源码分析的中文技术书。400 赞，561 收藏。 |
| [Harness Engineering Orange Book](https://github.com/alchaincyf/harness-engineering-orange-book) | 花叔 ([@AlchainHust](https://x.com/AlchainHust)) | 开源 Harness Engineering 参考书。 |

### 实践与案例

| 标题 | 作者 | 简介 |
|------|------|------|
| [Deux: Swift → Kotlin 的 Harness](https://x.com/hwwaanng/status/2040064208461762993) | Hwang ([@hwwaanng](https://x.com/hwwaanng)) | 自动把 Swift 代码库转成原生 Kotlin Android — 自我验证、自我迭代、生成子 Agent。655 赞。 |
| [Meta-Harness: 自动化 Harness 优化](https://x.com/LiorOnAI/status/2038669301541228606) | Lior Alexander ([@LiorOnAI](https://x.com/LiorOnAI)) | 仅改变 harness 就能产生 6 倍性能差距。242 赞，390 收藏。 |
| [AutoAgent: 自我优化 Agent](https://x.com/servasyy_ai/status/2040411682355511646) | huangserva ([@servasyy_ai](https://x.com/servasyy_ai)) | Meta-Agent 读失败轨迹改 harness。SpreadsheetBench 96.5%（第一）、TerminalBench 55.1%（第一）。 |
| [Kitaru 0.4.0: 记忆内置于 Harness](https://x.com/strickvl/status/2043620630273343925) | Alex Strick ([@strickvl](https://x.com/strickvl)) | 版本化记忆 + 溯源追踪，内置在 harness 基底中。 |
| [Learn Harness Engineering](https://github.com/walkinglabs/learn-harness-engineering) | Sanbu ([@sanbuphy](https://x.com/sanbuphy)) | 严格遵守 OpenAI 和 Anthropic 原始资料的完整实践指南。298 赞，447 收藏。 |
| [Ralph: 简单高效的 Harness Loop](https://github.com/snarktank/ralph) | via Wayne Zhang | "调研了半天不如 ralph，简单好用、不漂移、不污染上下文。" 729 赞，1162 收藏。 |

### 行业观点

| 标题 | 作者 | 简介 |
|------|------|------|
| [Anthropic 切掉第三方 Harness 订阅](https://x.com/_LuoFuli/status/2040825059342721520) | Fuli Luo ([@_LuoFuli](https://x.com/_LuoFuli)) | 为什么 Anthropic 这么做，算力经济分析，"更高效的 harness × 更强的模型"协同进化论。1770 赞。 |
| [Claude Managed Agents 开源版](https://x.com/berryxia/status/2042016446243631328) | Berryxia ([@berryxia](https://x.com/berryxia)) | 完整复刻 Claude Managed Agents 核心能力，生产就绪。346 赞。 |
| [Managed Agents 三概念四场景拆解](https://x.com/indigox/status/2042047463562080483) | indigo ([@indigox](https://x.com/indigox)) | Agent / Environment / Session 三核心概念 + 事件触发、定时任务、Fire-and-forget、长时任务四场景。 |
| [Zeratul 定律：Harness 膨胀](https://x.com/z3ratul163071/status/2042831408226304279) | z3ratul ([@z3ratul163071](https://x.com/z3ratul163071)) | "Every agent harness will bloat to become unusable within 2 months of hitting the GitHub exponential." |
| [Skill 膨胀与框架整合](https://x.com/kasong2048/status/2038599301618889042) | 卡颂 ([@kasong2048](https://x.com/kasong2048)) | Skill 数量失控问题与整合策略。464 赞，558 收藏。 |

---

## 🛠️ 教程

| 标题 | 简介 |
|------|------|
| 构建你的第一个 Agent Harness | *即将发布* |
| 为任意 Agent 添加持久化记忆 | *即将发布* |
| 多 Agent 任务调度 | *即将发布* |
| 编写自定义 Skill | *即将发布* |

---

## 📰 每周精选

> 每周精选 Harness Engineering 领域的新闻、论文和工具。

| 期数 | 日期 | 状态 |
|------|------|------|
| [2026-W16](weekly/2026-W16.md) | 4月14–20日 | *即将发布* |

---

## 如何贡献

我们欢迎所有人的贡献 — 最简单的方式就是通过 **GitHub Issue** 投稿。

### 📬 投稿资源（最简单的方式！）

1. 打开 [**Issues → New Issue**](https://github.com/nexu-io/harness-engineering-guide/issues/new/choose)
2. 选择 **"📬 Submit a Resource"**
3. 填写标题、URL 和简短说明

维护者会审核并归入相应章节。你会被记录为贡献者。

### 💬 参与讨论

欢迎到 [**Discussions**](https://github.com/nexu-io/harness-engineering-guide/discussions) 交流：

- 💡 **Ideas** — 对指南内容的建议
- ❓ **Q&A** — Harness Engineering 技术问题
- 📰 **Show & Tell** — 分享你的 Harness 实践

### ✍️ 直接贡献内容

1. Fork 仓库 → 创建分支 → 写 Markdown → 提 PR

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 社区

- 💬 **GitHub Discussions** — [参与讨论](https://github.com/nexu-io/harness-engineering-guide/discussions)
- 🐦 **推特** — 关注 [@nexu](https://x.com/nexu) 获取更新
- 💬 **飞书群** — [加入 Harness Engineering 话题群](https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=717g465a-0bc8-4242-9281-12b23953491a)

---

## 关于

Harness Engineering Guide 由 [Nexu](https://github.com/nexu-io) 维护 — 开源的 Claude Co-worker & Managed Agent 平台。我们相信 harness 层是 AI 工程的下一个前沿，而这些知识应该是开放的。

---

## 协议

[MIT License](LICENSE)

---

如果这份指南对你有帮助，请给一个 ⭐ — 让更多人发现它。
