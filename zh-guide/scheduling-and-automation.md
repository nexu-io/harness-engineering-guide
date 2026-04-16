---
title: "定时任务与自动化"
section: practice
author: Nexu
---

> **Core Insight:** 只在被问到时才回应的 Agent 是聊天机器人；按时间表、按事件、主动行动的 Agent 才是生产力系统。

## 为什么需要定时任务？

大多数人把 Agent 当作对话界面——你输入，它回复。这种心智模型把价值上限定在了"更快的搜索引擎"。真正的解锁发生在 Agent *不被要求*也能执行工作时。

对比一下：

- **被动式：** "帮我总结未读邮件。" → Agent 回复。
- **定时式：** 每天早上 8:00，Agent 读取收件箱，按紧急程度过滤，格式化日报，推送到你的 Slack 频道。你醒来时看到一份从未请求过的简报。

第二种模式会复利。一个定时任务每天省你五分钟。十个定时任务重塑你的工作方式。定时任务将 Agent 从一个你使用的工具变成一个为你工作的系统。

本章介绍在 Harness（托管 Agent 的 Tool、Context、Memory 和执行生命周期的 Runtime 环境）中实现定时 Agent 工作的原语。

---

## 定时 Agent 工作的类型

并非所有自动化都遵循相同的节奏。四种模式覆盖了全貌：

### One-Shot Timer（一次性定时器）

单次延迟执行。用户说"20 分钟后提醒我"或"下午 3 点发那封跟进邮件"。Harness 创建一个定时器，触发一次，然后丢弃。

关键特性：
- 仅触发一次
- 通常在对话中创建（"提醒我……"）
- 短周期——分钟到小时，很少到天
- 不需要循环逻辑

One-Shot Timer 是最简单的调度原语。只需一个时间戳和一个载荷。

### Recurring Cron（循环 Cron）

Cron（得名于 Unix `cron` 守护进程）是按 Cron 表达式定义的重复计划运行的任务——一种指定分钟、小时、日、月和星期几的紧凑语法。

示例：
- `0 8 * * *` → 每天 08:00
- `0 9 * * 1` → 每周一 09:00
- `*/30 * * * *` → 每 30 分钟

Cron 是 Agent 自动化的骨干。日报、周报、周期性监控——都是 Cron 的领地。

### Event-Triggered（事件触发）

并非所有调度都基于时间。有些工作应该响应外部事件触发：

- 新的 Pull Request 被打开 → 生成 Review Agent
- 部署完成 → 运行冒烟测试并报告
- 来自 VIP 发件人的新邮件 → 总结并告警

事件触发自动化需要事件源（Webhook、轮询或平台集成）和一个在事件触发时创建 Agent Turn 的分发机制。Harness 在这里不按时钟运行——它按信号运行。

### Heartbeat-Based（心跳式）

Heartbeat 是一种周期性轮询，Harness 按固定间隔（通常每 15-60 分钟）向 Agent 的*主 Session* 注入一个 Prompt。Agent 读取 Prompt，决定检查什么，然后行动或保持沉默。

与创建隔离执行的 Cron 不同，Heartbeat 在进行中的对话内运行。Agent 可以访问最近的消息、用户 Context 和 Session 状态。这使 Heartbeat 非常适合将多个轻量检查批量合并到单轮中。

典型的 Heartbeat Prompt：

```
Read HEARTBEAT.md if it exists. Follow it strictly.
If nothing needs attention, reply HEARTBEAT_OK.
```

Agent 可能检查邮件、看看日历、查看通知——全在一轮中完成，全都有对话 Context。

---

## Cron 实现模式

Cron 是最结构化的调度原语。正确实现需要关注四个维度：调度定义、Session 目标、载荷类型和交付。

### 调度定义

**Cron 表达式** 使用标准五字段格式：

```
┌───────── 分钟 (0–59)
│ ┌─────── 小时 (0–23)
│ │ ┌───── 日 (1–31)
│ │ │ ┌─── 月 (1–12)
│ │ │ │ ┌─ 星期几 (0–7, 0 和 7 = 周日)
│ │ │ │ │
* * * * *
```

**时区处理** 是 Cron Bug 最常见的来源。规则很简单：

> **存储 UTC。显示本地时间。**

内部，Harness 按 UTC 评估所有 Cron 表达式。向用户展示计划时，转换为本地时区。当用户说"每天早上 8 点"，Harness 必须知道*哪个* 8 点——如果不知道就询问时区，存储 UTC 等价值，用本地时间确认。

```
用户："每天早上 8 点跑我的日报"
Agent："好的——每日日报 8:00 AM Asia/Shanghai（UTC 0:00）。✓"
```

这避免了歧义，也能正确处理夏令时转换（对于实施夏令时的时区）。

### Session 目标

当 Cron 触发时，Agent *在哪里*运行？两种模型：

**隔离 Session** —— Cron 生成一个独立的 Agent Turn，拥有全新的 Context Window。没有对话历史。没有之前的消息。Agent 从干净状态开始，执行任务，然后终止。

优点：
- 无历史污染——主 Session 保持干净
- 可预测的 Context——Agent 只看到 Cron 提供的内容
- 可并行化——多个 Cron 任务可以并发运行互不干扰
- 可配置——每个任务可以使用不同的 Model 或 Thinking 级别

隔离 Session 适用于独立任务：日报、报告、监控检查、数据采集。

**主 Session** —— Cron 将内容注入用户当前活跃的 Session。Agent 看到完整的对话历史，可以引用最近的消息。

优点：
- 对话 Context——Agent 知道你一直在讨论什么
- 连续性——可以跟进之前的话题
- 更低开销——不需要创建新 Session

谨慎使用主 Session 注入。每次注入都会增加 Context Window，过多会膨胀（见下方反模式）。

### 载荷类型

Cron 触发时究竟交付什么？

**agentTurn** —— 触发完整的 Agent 执行周期。Agent 收到 Prompt，可以访问所有 Tool 和 Skill，能做决策、调用 API、读文件、产出输出。这是最强大的载荷类型。

例如：日报 Cron 用 `agentTurn` 载荷触发。Agent 通过 IMAP 读邮件，检查日历，获取天气，格式化为简报，推送到频道。完全自主。

**systemEvent** —— 向 Session 注入一条文本消息，但不触发完整的 Agent Turn。可以理解为往对话里丢一张便条。Agent 会在下一轮（或 Heartbeat）时看到它，但不会立即行动。

例如：Webhook 收到部署通知，注入"Deploy v2.3.1 部署成功"作为 systemEvent。Agent 不需要行动——但如果用户问起，信息是可用的。

### 交付

结果去哪里？

- **Announce to channel** —— Agent 的输出被推送到特定消息频道（Slack、Discord、飞书群等）。这是日报和告警最常见的交付方式。
- **Webhook** —— 结果被 POST 到 HTTP 端点，用于与外部系统集成。
- **None（静默）** —— Cron 运行但不产出外部输出。适用于后台维护任务如 Memory 清理或数据预取。

交付配置应在 Cron 创建时设置，并绑定到发起 Session。如果用户在飞书群创建 Cron，结果应交付到那个群——而不是追随用户到他们最近聊天的地方。

---

## 实际案例

### LangSmith Deployments Cron

LangChain 的 LangSmith 平台为其 Deployments 功能引入了 Cron 任务（参见 [LangSmith Cron Jobs 文档](https://docs.langchain.com/langsmith/cron-jobs)）。模型：

1. 创建一个 Deployment（托管的 LangGraph Agent）
2. 定义 Cron 计划
3. 每次触发时，系统创建一个新 Thread 并发送固定输入

这种方法干净且可预测。每次执行获得相同输入、全新 Thread，并在 LangSmith 的监控 UI 中产出可追踪的输出。

**优势：**
- 简单的心智模型——相同输入，全新 Thread，每次如此
- 通过 LangSmith Trace 的完整可观测性
- 与 LangGraph 的状态管理集成

**局限：**
- 每个 Cron 固定输入——无法根据 Context 动态调整 Agent 行为
- 每次执行一个 Thread 意味着运行之间没有连续性
- 绑定 LangSmith 的 Deployment 基础设施

### Harness 原生 Cron

Harness 模式提供更丰富的模型：

1. 用计划、Session 目标、载荷和交付定义 Cron
2. 每次触发时，Harness 生成一个隔离 Session（或注入主 Session）
3. Agent 拥有完整的 Tool 访问——可以读文件、调用 API、搜索网页、使用任何已安装的 Skill
4. 结果交付到配置的频道

```yaml
# 概念性 Cron 定义
schedule: "0 8 * * *"          # 8:00 AM UTC
timezone: "Asia/Shanghai"       # 显示参考
session: isolated               # 每次运行全新 Context
payload: agentTurn              # 完整 Agent 执行
model: claude-sonnet            # 可不同于默认
delivery:
  type: announce
  channel: feishu-group-abc     # 绑定到发起 Session
prompt: |
  生成今天的早间简报：
  1. 检查未读邮件中的紧急事项
  2. 列出今天的日历事件
  3. 总结过夜的 GitHub 通知
  格式化为简洁日报。
```

**与 LangSmith 的关键区别：**
- 动态 Prompt——Agent 决定做什么，而非仅处理固定输入
- 完整 Skill 访问——可使用 Harness 提供的任何 Tool
- 按任务选择 Model——简单检查用便宜 Model，分析用强 Model
- 灵活交付——频道、Webhook 或静默

### 日报模式

最常见的 Cron 用例。流程：

```
Cron 触发（本地 8:00 AM）
  → Agent 在隔离 Session 中生成
  → 读邮件（IMAP Tool）
  → 读日历（Calendar Tool）
  → 查天气（Weather Skill）
  → 查 GitHub 通知（GitHub Skill）
  → 格式化日报，标注优先级和要点
  → 推送到用户首选频道
  → Session 终止
```

价值乘数：这每天都运行，不管用户记不记得去问。信息到达时已预处理和格式化。

### 监控模式

一个检查指标并仅在阈值被突破时告警的 Cron：

```
Cron 触发（每 15 分钟）
  → Agent 检查 API 响应时间
  → 与阈值对比（p99 < 500ms）
  → 如果健康：静默（不交付）
  → 如果降级：向运维频道发告警并附详情
  → Session 终止
```

关键设计选择：**异常告警，而非每次检查都推送。** 每 15 分钟推送"一切正常"的监控 Cron 是噪音。保持沉默直到出问题的才是信号。

---

## Heartbeat vs Cron：何时使用哪个

Heartbeat 和 Cron 都能实现周期性 Agent 工作。它们服务不同目的。

| 维度 | Heartbeat | Cron |
|------|-----------|------|
| **时间精度** | 近似（允许漂移） | 精确（按计划触发） |
| **Context** | 主 Session（完整历史） | 隔离（全新 Context） |
| **每轮检查数** | 多个（批量） | 单任务聚焦 |
| **Session 影响** | 增加主 Context Window | 不影响主 Session |
| **配置方式** | 编辑 HEARTBEAT.md | 显式 Cron 定义 |
| **Model** | 使用 Session 的 Model | 可按任务指定 |

**使用 Heartbeat 当：**
- 你想把 3-5 个轻量检查（邮件 + 日历 + 通知）批量合并到一轮
- Agent 需要对话 Context 来判断什么重要
- 时间精度不重要（大约每 30 分钟就行）
- 你想通过合并周期检查来减少总 API 调用

**使用 Cron 当：**
- 精确时间很重要（"每周一早上 9:00 准时"）
- 任务应在隔离环境中运行，不污染主 Session
- 你想为任务使用不同的 Model 或 Thinking 预算
- 输出应交付到特定频道，不碰主 Session
- 一次性提醒（"20 分钟后提醒我"）

**经验法则：** 如果你有五件事要周期检查且都不要求精确时间，把它们放在 HEARTBEAT.md 里，而不是创建五个 Cron 任务。如果你有一个任务必须在精确的早上 9 点用特定 Model 运行并交付到特定频道，那就是 Cron。

---

## 反模式

### 轮询循环

```python
# ❌ 不要这样做
while True:
    result = check_something()
    if result.changed:
        notify()
    sleep(60)
```

这会占用持久进程，浪费计算资源，并绕过 Harness 的调度基础设施。改用 1 分钟间隔的 Cron。Harness 管理生命周期、重试和资源清理。

### 主 Session 污染

向主 Session 注入过多 systemEvent 会膨胀 Context Window。每次注入都增加 Token。经过一天的频繁注入，Agent 的 Context 被系统噪音主导，而非有用的对话。

**症状：** Agent 响应变慢，变得不连贯，或丢失对话主题。

**修复：** 高频工作使用隔离 Session。将主 Session 注入保留给罕见的、高信号的、用户需要在 Context 中看到的事件。

### 无超时

可以无限运行的 Cron 任务是资源泄漏。如果 Agent 卡住了（等待 API、陷入推理循环），任务会永远挂起。

**修复：** 每个 Cron 任务都应有超时。合理默认值：简单任务 2-5 分钟，复杂任务 10-15 分钟。如果任务无法在超时窗口内完成，应该大声失败——而非静默挂起。

### 重复交付

```yaml
# ❌ Cron announce 到频道，同时 Agent 也手动发消息
delivery:
  type: announce
  channel: slack-general
prompt: |
  检查指标并把结果发到 #general  # Agent 也发了！
```

如果 Cron 配置为 Announce 结果到频道，而 Agent 的 Prompt 又指示它向同一频道发消息，用户会收到相同内容两次。

**修复：** 选择一种交付机制。要么让 Harness Announce，要么让 Agent 手动发送——绝不同时使用。

---

## 设计清单

在创建任何定时 Agent 工作之前：

1. **时区** —— 你知道用户的时区吗？如果不知道，问。
2. **Session 类型** —— 需要对话 Context（主 Session）还是干净执行（隔离）？
3. **交付** —— 结果去哪里？绑定到发起 Session。
4. **超时** —— 最大可接受运行时间是多少？
5. **失败模式** —— 任务失败怎么办？静默？告警？重试？
6. **频率** —— 这个更适合做 Cron 还是 HEARTBEAT.md 条目？
7. **去重** —— 你确定结果不会重复交付吗？

做对这七点，你的定时 Agent 工作将是可靠的、可预测的、真正有用的。

---

## 总结

定时任务是把对话新奇感和生产力系统区分开来的关键。Harness 提供四种原语——One-Shot Timer、Recurring Cron、Event Trigger 和 Heartbeat——各适合不同的自动化形态。

架构选择很重要：存储 UTC，显示本地时间。默认隔离 Session。设置超时。将交付绑定到发起频道。将轻量检查批量合并到 Heartbeat 而非生成多个 Cron。

一个按计划、按自己的主动性行动、不需要被要求的 Agent——那不再是聊天机器人。那是基础设施。
