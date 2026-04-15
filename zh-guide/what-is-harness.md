---
author: Nexu
---

# 什么是 Harness？

> **Core Insight:** 模型正在商品化——GPT、Claude、Gemini 的能力趋于收敛。真正的护城河在 Harness：如何编排 Context、Memory、Tool 和 Agent 生命周期，决定了你交付的是聊天机器人还是生产级 Agent。

## 定义

**Harness** 是将裸语言模型转化为 **Agent** 的运行时包装层——一个能感知环境、做出决策、并通过多步操作实现目标的自主系统。

这里有必要区分一下 "Agent" 的含义。在 2023-2024 年，"Agent" 通常指*模型加 Tool*——给 GPT 一个搜索工具就叫 Agent。而 Harness 工程面向的 Agent 复杂得多：

| 组件 | 2023 "Agent" | Harness 时代的 Agent |
|-----------|-------------|-------------------|
| 模型 | ✅ LLM | ✅ LLM |
| Tool | ✅ 函数调用 | ✅ 动态 Tool 系统 |
| Memory | ❌ 无状态 | ✅ 持久化跨 Session Memory |
| Context 管理 | ❌ 简单粗暴 | ✅ 基于优先级的 Context 组装 |
| 编排 | ❌ 单轮 | ✅ Agentic Loop + 错误恢复 |
| 执行环境 | ❌ 宿主进程 | ✅ Sandbox 运行时 |
| Guardrails | ❌ 几乎没有 | ✅ 权限模型 + 信任边界 |

Harness 就是提供这一切的工程层。没有它，你只有一个能调函数的聊天机器人。有了它，你的 Agent 能自主导航代码库、跨文件修 bug、然后提交结果。

## Harness 的结构

所有 Harness，不论实现方式，都包含四个子系统：

```
┌──────────────────────────────────────────────┐
│                   HARNESS                     │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Agentic  │  │   Tool   │  │  Memory &  │  │
│  │   Loop   │  │  System  │  │  Context   │  │
│  └──────────┘  └──────────┘  └────────────┘  │
│                                               │
│  ┌────────────────────────────────────────┐   │
│  │            Guardrails                  │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

1. **Agentic Loop** —— 思考 → 执行 → 观察的循环，驱动所有 Agent 行为。模型推理、调用 Tool、观察结果，循环直到任务完成。

2. **Tool 系统** —— Agent 可用能力的注册表：文件 I/O、Shell 执行、Web 搜索、API 调用。Tool 可以是静态的（启动时加载）或动态的（通过 Skill 菜单按需加载）。

3. **Memory 与 Context** —— 决定模型能*看到*什么的系统。涉及三个不同的关注点：
   - **Context** —— 当前 API 调用中包含的内容（系统提示、Tool、文件、对话历史）
   - **Memory** —— 跨 Session 持久化的内容（MEMORY.md、每日日志、学习到的偏好）
   - **Session** —— 单次 Agent 运行的边界（消息历史、Tool 结果、临时状态）

4. **Guardrails** —— 权限边界、Sandbox 执行和安全约束。Agent 能做什么、不能做什么，以及如何防止 prompt 注入绕过这些边界。

这四个子系统在[核心概念](/guide/agentic-loop)部分有深入讲解。

## 最简示例

最简单的 Harness 就是一个循环。以下代码不适合直接用于生产，但结构是正确的：

```python
import openai

client = openai.OpenAI()
tools = [{"type": "function", "function": {"name": "read_file", ...}}]

messages = [{"role": "system", "content": "You are a coding agent."}]
messages.append({"role": "user", "content": user_input})

# The agentic loop
while True:
    response = client.chat.completions.create(
        model="gpt-4o", messages=messages, tools=tools
    )
    msg = response.choices[0].message
    messages.append(msg)

    if not msg.tool_calls:
        print(msg.content)  # Done — model has no more actions
        break

    for call in msg.tool_calls:
        result = execute_tool(call.function.name, call.function.arguments)
        messages.append({
            "role": "tool",
            "tool_call_id": call.id,
            "content": result
        })
    # Loop back — model sees the tool results and decides next action
```

从 50 行脚本到 Claude Code，所有 Harness 都是这个循环的变体。复杂度来自围绕它构建的东西：Context 组装、Memory 持久化、Skill 编排、错误恢复和 Sandbox。

## Harness vs. Framework vs. Runtime

这三个术语经常被混淆，但它们是不同的层次：

| 术语 | 角色 | 示例 |
|------|------|----------|
| **Harness** | 将模型包装成 Agent 的编排代码 | Claude Code、Codex CLI、OpenClaw |
| **Framework** | 提供构建 Harness 所需组件的库 | LangChain、CrewAI、AutoGen |
| **Runtime** | 保持 Harness 运行的持久进程，管理其生命周期，并连接外部世界 | OpenClaw Runtime、Docker 容器、systemd 服务 |

Framework 帮你*构建* Harness。Runtime *托管* Harness——保持存活、处理重连、调度心跳、路由消息。Harness 本身是编排逻辑：如何组装 Context、加载哪些 Tool、Agentic Loop 如何运行。

## 常见误区

- **把模型问题归咎于 Harness 问题** —— Agent 出错时，通常是 Context 问题（加载了错误的文件、缺少指令）或 Tool 问题（Schema 不正确、静默报错），而不是模型能力问题。
- **一开始就过度工程** —— 从上面的最小循环开始。需要跨 Session 状态时再加 Memory，Tool 太多时再加 Skill，上生产时再加 Guardrails。
- **把 Context 窗口当成无限的** —— 模型只能基于 Context 中的内容推理。如果关键信息没有被组装进 prompt，对模型来说它就不存在。

## 延伸阅读

- [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/) —— 命名了这一学科的博文
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) —— Anthropic 的生产级 Agent 模式
