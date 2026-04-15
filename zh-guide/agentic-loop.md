---
author: Nexu
---

# Agentic Loop

> **Core Insight:** 每个 Agent 都是一个循环——思考、执行、观察、重复。循环本身很简单。让它达到生产级的是边界处理：什么时候停止、Tool 失败怎么办、如何防止无限循环。

## 模式

Agentic Loop（也叫 ReAct 模式——Reason + Act）是所有 AI Agent 的基本执行周期。模型生成响应，可选地调用一个或多个 Tool，观察结果，循环直到任务完成。

```
┌─────────────┐
│   Reason    │◄──────────────────┐
│  (LLM call) │                   │
└──────┬──────┘                   │
       │                          │
       ▼                          │
  ┌─────────┐    No tools    ┌────┴─────┐
  │  Tools? ├───────────────►│  Output  │
  └────┬────┘                └──────────┘
       │ Yes
       ▼
  ┌─────────┐
  │ Execute │
  │  tools  │
  └────┬────┘
       │
       ▼
  ┌─────────┐
  │ Observe │
  │ results ├─────────────────────┘
  └─────────┘
```

这和简单的 Tool 调用 API 不同。单次 Tool 调用是一次性的：模型说"调用这个函数"，你返回结果。**Agentic Loop** 则是反复运行这个过程——模型看到结果，判断还需要更多信息，调用另一个 Tool，看到*那个*结果，继续循环直到有足够的 Context 产出最终答案。

## 实现

Python 中的最小 Agentic Loop：

```python
def agentic_loop(messages: list, tools: list, max_turns: int = 25) -> str:
    """Run the agentic loop until the model produces a final text response."""
    for turn in range(max_turns):
        response = llm.chat(messages=messages, tools=tools)
        assistant_msg = response.choices[0].message
        messages.append(assistant_msg)

        # Exit condition: no tool calls means the model is done
        if not assistant_msg.tool_calls:
            return assistant_msg.content

        # Execute each tool call and append results
        for tool_call in assistant_msg.tool_calls:
            result = dispatch_tool(tool_call)
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": str(result)
            })

    raise AgentLoopError(f"Agent did not complete within {max_turns} turns")
```

`max_turns` 参数至关重要。没有它，混乱的模型会无限循环——反复调用同一个 Tool、得到同样的错误、不断烧 Token。这是最简单的 Guardrails，必须始终存在。

## 并行 Tool 调用

现代 API 支持**并行 Tool 调用**——模型可以在一次响应中请求多个 Tool。这不仅仅是优化，它改变了 Agent 行为。需要读三个文件的模型会同时请求所有三个，而不是按顺序请求：

```python
# A single assistant message might contain:
# tool_calls = [read_file("a.py"), read_file("b.py"), read_file("c.py")]

for tool_call in assistant_msg.tool_calls:
    result = dispatch_tool(tool_call)
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": str(result)
    })
# All three results are appended, then the model sees them all at once
```

## 轮次预算与退出条件

循环需要明确的退出条件，不只是 `max_turns`：

| 条件 | 处理方式 |
|-----------|--------|
| 响应中没有 Tool 调用 | 返回文本——Agent 已完成 |
| 达到最大轮次 | 抛出错误或强制生成摘要 |
| Token 预算超限 | 触发 Context 压缩，继续执行 |
| 连续相同的 Tool 调用 | 很可能卡住了——升级或中止 |
| 人类中断信号 | 暂停循环，展示当前状态 |

```python
def detect_loop(messages: list, window: int = 3) -> bool:
    """Detect if the agent is stuck calling the same tool repeatedly."""
    recent_calls = []
    for msg in messages[-window * 2:]:
        if hasattr(msg, 'tool_calls') and msg.tool_calls:
            recent_calls.extend(
                (tc.function.name, tc.function.arguments) for tc in msg.tool_calls
            )
    if len(recent_calls) >= window:
        return len(set(recent_calls[-window:])) == 1
    return False
```

## 循环中的流式输出

生产级 Harness 在循环运行时逐 Token 流式输出模型的响应。这对用户体验很重要——用户能实时看到 Agent 在"思考"，而不是盯着空白屏幕：

```python
for turn in range(max_turns):
    stream = llm.chat(messages=messages, tools=tools, stream=True)

    tool_calls = []
    text_chunks = []

    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            text_chunks.append(delta.content)
            emit_to_user(delta.content)  # Real-time streaming
        if delta.tool_calls:
            accumulate_tool_calls(tool_calls, delta.tool_calls)

    if not tool_calls:
        return "".join(text_chunks)

    # Execute tools and continue loop
    ...
```

## 常见误区

- **没设轮次上限** —— Harness 中最常见的 bug。一定要设最大值。
- **吞掉 Tool 错误** —— Tool 静默失败的话，模型会重试或幻觉出成功。务必把错误信息作为 Tool 结果返回，让模型能调整策略。
- **直接追加原始结果** —— 大体积的 Tool 输出（整个文件、API 响应）会撑爆 Context 窗口。追加前做截断或摘要。
- **忽略并行调用** —— 如果你的循环按顺序处理 Tool 调用，但模型是并行发出的，你可能引入不存在的顺序依赖。

## 延伸阅读

- [Yao et al., "ReAct: Synergizing Reasoning and Acting"](https://arxiv.org/abs/2210.03629) —— 形式化 Reason + Act 模式的原始论文
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) —— 生产级循环的实践模式
