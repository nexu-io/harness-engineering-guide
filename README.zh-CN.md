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

## 目录

### 📖 指南

- [Harness Engineering 入门](zh-guide/introduction.md)
  - 什么是 Harness？
  - Harness vs Runtime vs Framework
  - 为什么 Harness Engineering 重要
- [核心概念](zh-guide/concepts.md)
  - 上下文管理 (Context Management)
  - 记忆与持久化 (Memory & Persistence)
  - Skill / 工具编排 (Skill Orchestration)
  - Agent 生命周期 (Agent Lifecycle)
  - 多 Agent 协调 (Multi-Agent Coordination)
- [架构模式](zh-guide/patterns.md)
  - Thin Harness + Thick Skills
  - Monolithic Harness
  - Harness-as-a-Service
  - 对比：Claude Code vs Codex vs OpenClaw
- [记忆系统](zh-guide/memory.md)
  - AGENTS.md / MEMORY.md 模式
  - 会话记忆 vs 长期记忆
  - 记忆所有权与可迁移性
- [安全与沙箱](zh-guide/security.md)
  - 权限模型
  - 沙箱架构
  - 信任边界

### 🛠️ 教程

- 构建你的第一个 Agent Harness *(即将发布)*
- 为任意 Agent 添加持久化记忆 *(即将发布)*
- 多 Agent 任务调度 *(即将发布)*
- 编写自定义 Skill *(即将发布)*

### 🔍 行业全景

- [Harness 实现横向对比](landscape/comparison.md)
- [开源 Harness 项目](landscape/open-source.md)
- [商业平台](landscape/commercial.md)

### 📰 每周精选

> 参考[阮一峰周刊](https://github.com/ruanyf/weekly)模式 — 每周精选 Harness Engineering 领域的新闻、论文和工具。

- 2026-W16 (4月14–20日) *(即将发布)*

### 📄 论文

- [基础论文](papers/foundational.md)
- 记忆与上下文
- 多 Agent 系统
- 评测与基准

### 🧰 工具与资源

- Harness 框架
- 记忆方案
- 沙箱与安全工具
- 监控与可观测性

---

## 如何贡献

我们欢迎所有人的贡献 — 最简单的方式就是通过 **GitHub Issue** 投稿。

### 📬 投稿资源（最简单的方式！）

发现了跟 Harness Engineering 相关的论文、工具、博客或教程？3 步投稿：

1. 打开 [**Issues → New Issue**](https://github.com/nexu-io/harness-engineering-guide/issues/new/choose)
2. 选择 **"📬 Submit a Resource"**
3. 填写标题、URL 和简短说明

就这样！维护者会审核你的投稿并归入指南的相应章节。你会被记录为贡献者。

### 💬 参与讨论

有问题、想法或见解？欢迎到 [**Discussions**](https://github.com/nexu-io/harness-engineering-guide/discussions) 参与讨论：

- 💡 **Ideas** — 对指南内容的建议
- ❓ **Q&A** — Harness Engineering 相关技术问题
- 🗣️ **General** — 自由讨论
- 📰 **Show & Tell** — 分享你的 Harness 实践

### ✍️ 直接贡献内容

1. Fork 仓库
2. 创建分支：`git checkout -b your-topic`
3. 用 Markdown 写内容
4. 提交 Pull Request

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 社区

- 🐦 **推特** — 关注 [@nexu](https://x.com/nexu) 获取更新
- 💬 **飞书群** — [加入 Harness Engineering 话题群](https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=717g465a-0bc8-4242-9281-12b23953491a)
- 💬 **GitHub Discussions** — [参与讨论](https://github.com/nexu-io/harness-engineering-guide/discussions)
- 📫 **Newsletter** — 每周 Harness Engineering 精选 *(即将发布)*

---

## 关于

Harness Engineering Guide 由 [Nexu](https://github.com/nexu-io) 维护 — 开源的 Claude Co-worker & Managed Agent 平台。我们相信 harness 层是 AI 工程的下一个前沿，而这些知识应该是开放的。

---

## 协议

[MIT License](LICENSE)

---

如果这份指南对你有帮助，请给一个 ⭐ — 让更多人发现它。
