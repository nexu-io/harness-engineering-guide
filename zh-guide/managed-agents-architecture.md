---
author: Nexu
---

# 托管 Agent：将大脑与双手解耦

> **Core Insight:** 单体 Agent 容器——Harness、Sandbox 和 Session 状态共享一个进程——是一只你丢不起的宠物。将大脑（Harness + LLM）与双手（Sandbox + Tool）以及 Session（事件日志）解耦，使每个组件变成可替换的"牲畜"，从而解锁独立扩展、故障恢复和安全隔离。

## 单体问题

最简单的 Agent 架构把一切放在一个盒子里：

```
┌──────────────────────────────────┐
│         单一容器                  │
│                                   │
│  ┌─────────┐  ┌──────────────┐   │
│  │ Harness  │  │   Sandbox    │   │
│  │ (大脑)   │  │ (代码执行)   │   │
│  │          │  │              │   │
│  │ Session  │  │ 凭证         │   │
│  │ 状态     │  │ 用户文件     │   │
│  └─────────┘  └──────────────┘   │
│                                   │
└──────────────────────────────────┘
```

这对原型可以。在生产环境中，它会以三种可预见的方式失败。

### 失败 1：宠物问题

在 [宠物 vs. 牲畜](https://cloudscaling.com/blog/cloud-computing/the-history-of-pets-vs-cattle/) 的类比中，宠物是一台有名字、精心照料、丢不起的服务器。牲畜是可互换的——一只死了，你换一只。

单体 Agent 容器就是宠物。如果容器崩溃，Session 就丢了。如果它无响应，你必须把它"救活"。你不能直接杀掉它再启一个新的，因为 Session 状态——Agent 做过的一切的完整历史——就在里面。

### 失败 2：调试盲区

当单体容器卡住时，你唯一的窗口是外部事件流。但 Harness 的 bug、丢失的网络包和崩溃的容器，从外面看起来都一样。要诊断真正的原因，工程师需要进入容器内部的 shell 访问——但那个容器也保存着用户数据和凭证。调试变成了一起安全事件。

### 失败 3：安全边界

Agent 生成的不可信代码与凭证运行在同一个容器中。提示注入只需说服 Agent 读取自己的环境变量。一旦攻击者拿到这些 Token，他们就能发起不受限制的 Session。缩小权限范围有帮助，但它建立在对模型用有限 Token 做不了什么的假设之上——而模型一直在变得更聪明。

## 三层架构

解决方案是将单体分解为三个独立层，每层有自己的生命周期：

```
┌─────────────────────────────────────────────────────────┐
│                    编排层                                 │
│                                                          │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │    大脑       │  │ Session  │  │      双手          │  │
│  │  (Harness +   │  │ (事件    │  │  (Sandbox A)      │  │
│  │   LLM 调用)   │  │  日志)   │  │  (Sandbox B)      │  │
│  │              │  │          │  │  (MCP Tool)       │  │
│  │  无状态      │  │ 持久化   │  │  可丢弃           │  │
│  └──────┬───────┘  └────┬─────┘  └────────┬──────────┘  │
│         │               │                  │             │
│         │  emitEvent()  │   execute()      │             │
│         ├──────────────►│◄─────────────────┤             │
│         │  getEvents()  │   provision()    │             │
│         ├──────────────►│                  │             │
│         └───────────────┴──────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

### 大脑（Harness）

Harness 运行 Agent 循环：调用 LLM、路由 Tool 调用、管理上下文。关键的是，Harness 是**无状态的**。它不在内存中保存任何 Session 数据。所有持久化内容通过 `emitEvent()` 写入 Session 日志。

当 Harness 崩溃时，一个新的 Harness 启动，调用 `wake(sessionId)`，通过 `getEvents()` 获取事件日志，从最后一个事件恢复。没有数据丢失。不需要"抢救"。Harness 变成了牲畜。

### Session（事件日志）

Session 是一个**仅追加日志**，记录了发生的一切：LLM 调用、Tool 结果、用户消息、系统事件。它存在于 Harness 和 Sandbox 之外的持久存储中。

关键接口：
- `emitEvent(sessionId, event)` — 在 Agent 循环中写入事件
- `getEvents(sessionId, options)` — 读回事件（位置切片、过滤）
- `getSession(sessionId)` — 获取元数据和状态

Session 的生命周期超越 Harness 和 Sandbox。如果任一崩溃，Session 保持完整。

### 双手（Sandbox）

Sandbox 是执行环境，Agent 在其中运行代码、编辑文件、执行命令。它们按需通过 `provision({resources})` 创建，不再需要时销毁。

Harness 调用 Sandbox 的方式与调用任何 Tool 相同：`execute(name, input) → string`。如果 Sandbox 挂了，Harness 将错误作为失败的 Tool 调用捕获并传递给 LLM。模型可以决定在新的 Sandbox 上重试。

## Session ≠ Context Window

这个区分是架构中最微妙也最重要的部分。

**Session** 是完整的持久记录——可能跨越数小时或数天的 Agent 工作，包含数百万 Token。**Context Window** 是 Harness 为当前 LLM 调用选取的该记录的子集——通常是 128K-200K Token。

```
Session（仅追加事件日志，持久化）
┌─────────────────────────────────────────────────────────────┐
│ event_1 │ event_2 │ ... │ event_500 │ ... │ event_2000     │
└─────────────────────────────────────────────────────────────┘
                                    │
                          getEvents(slice)
                                    │
                                    ▼
                    Context Window（选取的子集）
                    ┌───────────────────────────┐
                    │ system_prompt             │
                    │ event_1950 ... event_2000 │
                    │ (最近 50 个事件)           │
                    └───────────────────────────┘
```

这种分离有三个好处：

**1. 不可逆决策变为可逆。** 压缩（总结旧上下文以腾出空间）会永久性地销毁信息。有了持久化的 Session 日志，Harness 可以重新读取任何过去的事件——即使那些之前已从 Context Window 中压缩掉的。如果后续轮次需要 event_200 的信息，Harness 可以去取。

**2. 上下文工程成为 Harness 的职责。** Harness 决定什么进入 Context Window：最近的事件、旧事件的摘要、系统提示、相关文件内容。不同的 Harness 实现可以使用不同的策略，而无需更改 Session 格式。今天的上下文工程可能是 Token 级别的裁剪；明天可能是语义检索。Session 保持不变。

**3. 多大脑架构成为可能。** 多个 Harness 可以同时读取同一个 Session 日志。规划大脑可以审查完整历史，而执行大脑专注于最近的事件。两者从同一个持久化来源读取。

## 安全：凭证绝不进入 Sandbox

解耦架构创建了天然的安全边界。凭证存在于 Sandbox 之外的保险库中。Agent 从不直接处理 Token。

两种模式：

**随资源捆绑：** 对于 Git，访问 Token 在 Sandbox 初始化期间用于克隆仓库和配置本地远端。`git push` 和 `git pull` 在 Sandbox 内部即可工作，Agent 永远看不到 Token。

**保险库 + 代理：** 对于外部 API（通过 MCP），OAuth Token 存在安全保险库中。Agent 通过代理调用 MCP Tool。代理从保险库中查找 Session 的凭证并发起外部调用。Sandbox 永远看不到凭证。

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌──────────┐
│  Agent    │────►│  MCP      │────►│  保险库    │────►│ 外部     │
│ (sandbox) │     │  代理     │     │ (密钥)    │     │ 服务     │
│           │     │           │     │           │     │          │
│ 此处无    │     │ Session   │     │ OAuth     │     │          │
│ 凭证      │     │ → 凭证   │     │ Token     │     │          │
└───────────┘     └───────────┘     └───────────┘     └──────────┘
```

即使提示注入说服 Agent 搜索整个环境，也找不到任何凭证。

## 性能：TTFT 改进

在单体设计中，每个 Session——即使是从未用到 Sandbox 的——都要付出完整的容器启动成本：克隆仓库、启动进程、获取事件。推理要等容器准备好才能开始。

在解耦架构中，Harness 立即启动。Sandbox 配置通过 Tool 调用延迟发生，仅在需要时进行。来自 Anthropic 生产部署的结果：

| 指标 | 单体 | 解耦 | 提升 |
|------|------|------|------|
| TTFT p50 | 基准 | ~基准的 40% | **~60% 降低** |
| TTFT p95 | 基准 | ~基准的 10% | **~90% 降低** |

p95 的改进尤为显著，因为最坏情况下的容器启动（冷拉取、慢磁盘）被完全从不需要 Sandbox 的 Session 的关键路径中移除了。

## 多大脑，多双手

该架构在两个维度上自然扩展。

### 扩展大脑

扩展到大量并发 Agent Session 意味着启动大量无状态 Harness。由于每个 Harness 不保存状态（所有持久化内容在 Session 日志中），水平扩展非常简单。没有共享内存、没有分布式锁、没有状态同步。

### 扩展双手

单个大脑可以连接多个 Sandbox。实际上，这意味着 Agent 对多个执行环境进行推理，并决定将工作发送到哪里：

```
┌──────────┐
│  大脑     │
│ (harness)│
└────┬─────┘
     │
     ├──► Sandbox A（Python 环境）
     ├──► Sandbox B（Node.js 环境）
     ├──► Sandbox C（客户 VPC）
     └──► MCP Tool Server（外部 API）
```

早期模型做不到这一点——同时对多个执行环境进行推理太复杂了。随着模型能力的提升，单容器假设变成了瓶颈。解耦架构已经为模型的能力追上来做好了准备。

### 客户 VPC 集成

当一切运行在一个容器中时，连接到客户的基础设施意味着网络对等——客户的 VPC 必须从我们的容器可达。在解耦架构中，Sandbox 可以运行在客户的 VPC 内部，而大脑运行在我们的基础设施上。大脑通过标准的 `execute()` 接口与 Sandbox 通信，无论 Sandbox 实际运行在哪里。

## 反模式

### 在 Harness 中存储 Session 状态

```python
# ❌ Session 状态在 Harness 内存中
class HarnessWithState:
    def __init__(self):
        self.events = []  # Harness 崩溃就丢了
        self.current_plan = None
    
    def run_turn(self, message):
        result = self.llm.call(self.events + [message])
        self.events.append(result)  # 只在内存中
```

如果 Harness 崩溃，一切都没了。始终将事件发射到持久化的 Session 日志。

```python
# ✅ Session 状态外置
class StatelessHarness:
    def run_turn(self, session_id, message):
        events = self.session_store.get_events(session_id)
        result = self.llm.call(events + [message])
        self.session_store.emit(session_id, result)  # 持久化
```

### 凭证进入 Sandbox

```python
# ❌ 将 API 密钥传入 Sandbox 环境
sandbox.execute("export GITHUB_TOKEN=ghp_xxx && git push")
```

距离被窃取只差一次提示注入。改用保险库 + 代理模式。

### 急切的 Sandbox 配置

```python
# ❌ 在不知道是否需要之前就配置 Sandbox
sandbox = provision_sandbox(resources=large_config)  # 30 秒启动
result = llm.call(prompt)  # 可能根本不需要 Sandbox
```

延迟配置。让 LLM 通过 Tool 调用决定是否需要 Sandbox，以及需要哪种。

## 设计清单

在构建托管 Agent 架构之前：

1. **大脑无状态性** — Harness 能否崩溃后重启而不丢失数据？
2. **Session 持久性** — 事件日志是否存储在大脑和双手之外？
3. **Sandbox 可丢弃性** — 任何 Sandbox 能否被终止和替换？
4. **凭证隔离** — 密钥是否从 Sandbox 中不可访问？
5. **延迟配置** — Sandbox 是否按需创建，而非预先配置？
6. **接口稳定性** — 大脑↔双手的接口是否通用到足以超越当前实现？

## 总结

单体 Agent 容器是自然的起点——把一切放在一个盒子里很简单。但它创建了不可替换的宠物、无法执行的安全边界和无法消除的性能瓶颈。

分解为三层——无状态大脑、持久化 Session、可丢弃双手——解决了这三个问题。大脑变成了牲畜（崩溃后重启）。Session 成为唯一的真实来源（比一切都长寿）。双手变成了按需资源（需要时配置，完成后销毁）。

这与操作系统几十年前发现的模式相同：虚拟化组件，保持接口稳定，让底层实现自由变化。`read()` 系统调用不关心它是从 1970 年代的磁盘包还是现代 SSD 读取。`execute()` 接口不关心 Sandbox 运行在本地、客户的 VPC 还是另一个大洲。

## 延伸阅读

- [Sub-Agent](sub-agent.md) — 派生具有独立生命周期的隔离 Agent
- [Multi-Agent Orchestration](multi-agent-orchestration.md) — 协调多个大脑的模式
- [Sandbox](sandbox.md) — 执行环境隔离与安全
- [Scheduling & Automation](scheduling-and-automation.md) — 长时运行周期性工作的 Session 定向
- [Anthropic: Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents) — 原始架构文章
- [Anthropic: Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) — 基础 Agent 设计模式
