---
author: Nexu
---

# Agentic Loop

> **Core Insight:** Every agent is a loop — think, act, observe, repeat. The loop itself is trivial. What makes it production-grade is how you handle the edges: when to stop, what to do when tools fail, and how to prevent infinite cycles.

## The Pattern

The Agentic Loop (also called the ReAct pattern — Reason + Act) is the fundamental execution cycle of any AI agent. The model generates a response, optionally invokes one or more tools, observes the results, and loops until the task is done.

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

This is distinct from a simple tool-calling API. A single tool call is a one-shot: the model says "call this function," you return the result. An **agentic loop** runs that process repeatedly — the model sees the result, decides it needs more information, calls another tool, sees *that* result, and continues until it has enough context to produce a final answer.

## Implementation

A minimal agentic loop in Python:

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

The `max_turns` parameter is critical. Without it, a confused model will loop forever — calling the same tool repeatedly, getting the same error, and burning tokens. This is the simplest guardrail and should always be present.

## Parallel Tool Calls

Modern APIs support **parallel tool calls** — the model can request multiple tools in a single response. This is not just an optimization; it changes agent behavior. A model that needs to read three files will request all three simultaneously rather than sequentially:

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

## Turn Budget and Exit Conditions

The loop needs clear exit conditions beyond `max_turns`:

| Condition | Action |
|-----------|--------|
| No tool calls in response | Return the text — agent is done |
| Max turns reached | Raise error or force summarization |
| Token budget exceeded | Trigger context compression, then continue |
| Consecutive identical tool calls | Likely stuck — escalate or abort |
| Human interrupt signal | Pause loop, surface current state |

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

## Streaming in the Loop

Production harnesses stream the model's output token by token while the loop runs. This is important for user experience — the human sees the agent "thinking" in real time, not staring at a blank screen:

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

## Common Pitfalls

- **No turn limit** — The single most common harness bug. Always set a maximum.
- **Swallowing tool errors** — If a tool fails silently, the model will retry or hallucinate success. Always return error messages as tool results so the model can adapt.
- **Appending raw results** — Large tool outputs (entire files, API responses) bloat the context window. Truncate or summarize before appending.
- **Ignoring parallel calls** — If your loop processes tool calls sequentially but the model issued them in parallel, you may create ordering dependencies that don't exist.

## Further Reading

- [Yao et al., "ReAct: Synergizing Reasoning and Acting"](https://arxiv.org/abs/2210.03629) — The original paper formalizing the Reason + Act pattern
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Practical patterns for production loops
