# 什么是 Harness？

**Harness** 是包裹 AI 模型的运行时层，把模型变成一个有用的 Agent。它负责模型自身做不了的所有事情：读取文件、调用工具、跨会话记忆上下文、决定何时停止。

## 为什么重要

模型是无状态的。每次 API 调用都从零开始。Harness 赋予模型：

- **工具** — 文件访问、网页搜索、代码执行
- **记忆** — 之前会话中发生了什么
- **上下文** — 当前哪些文件是相关的
- **约束** — Agent 能做什么、不能做什么

没有 Harness，你只有一个聊天机器人。有了 Harness，你就有了一个 Agent。

## 最简示例

最简单的 Harness 就是一个循环：

```python
while True:
    # 1. Build context (system prompt + memory + user message)
    messages = build_context(memory, user_input)

    # 2. Call the model
    response = llm.chat(messages, tools=available_tools)

    # 3. If the model wants to use a tool, execute it
    if response.tool_calls:
        for call in response.tool_calls:
            result = execute_tool(call)
            messages.append(tool_result(call, result))
        continue  # Let the model see the result

    # 4. Otherwise, return the response
    print(response.text)
    break
```

就这样。从 50 行脚本到 Claude Code 的 512K 行代码，每个 Harness 都是这个循环的变体。复杂性来自循环*外围*的东西：上下文管理、记忆持久化、Skill 编排、错误恢复和安全机制。

## Harness vs. 框架 vs. 运行时

| 术语 | 定义 | 示例 |
|------|------|------|
| **Harness** | 包裹模型使其成为 Agent 的代码 | Claude Code、Codex CLI、OpenClaw |
| **框架** | 用于构建 Agent 的库 | LangChain、CrewAI、AutoGen |
| **运行时** | Agent 的执行环境 | OpenClaw runtime、Docker sandbox |

框架帮你*构建* Harness。运行时帮你*运行* Harness。Harness 本身才是核心。

## 核心洞察

> *"你不拥有模型。你拥有的是 Harness。而 Harness 拥有记忆。"*
> — Harrison Chase, LangChain

模型正在商品化。GPT、Claude、Gemini、开源 LLM — 能力都在趋同。**Harness 才是护城河**：你如何管理上下文、记忆、工具和 Agent 生命周期，决定了产品质量。

## 常见陷阱

- **把 Harness 和模型混为一谈** — 当 Agent 出错时，问题通常出在 Harness（上下文不对、缺少工具），而不是模型。
- **一开始就过度工程化** — 先从上面的最简循环开始。遇到真正的限制时再加复杂度。
- **忽视 Context Window** — 模型只能看到上下文中的内容。你不放进去，它就不知道。

## 延伸阅读

- [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/) — 为这个领域命名的博客文章
- [搭建你的第一个 Harness →](your-first-harness.md) — 15 分钟从零搭建一个
