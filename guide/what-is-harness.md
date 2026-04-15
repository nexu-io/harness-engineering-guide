---
author: Nexu
---

# What is a Harness?

> **Core Insight:** Models are commoditizing — GPT, Claude, Gemini converge in capability. The harness is the real moat: how you orchestrate context, memory, tools, and agent lifecycle determines whether you ship a chatbot or a production agent.

## Definition

A **harness** is the runtime wrapper that turns a bare language model into an **agent** — an autonomous system that can perceive its environment, make decisions, and take actions over multiple steps to achieve goals.

It's important to distinguish "agent" here from earlier usage. In 2023-2024, "agent" typically meant *a model plus tools* — you gave GPT a web search tool and called it an agent. The agents that harness engineering targets are fundamentally more complex:

| Component | 2023 "Agent" | Harness-era Agent |
|-----------|-------------|-------------------|
| Model | ✅ LLM | ✅ LLM |
| Tools | ✅ Function calling | ✅ Dynamic tool system |
| Memory | ❌ Stateless | ✅ Persistent cross-session memory |
| Context management | ❌ Naive | ✅ Priority-based context assembly |
| Orchestration | ❌ Single-turn | ✅ Agentic loop with error recovery |
| Execution environment | ❌ Host process | ✅ Sandboxed runtime |
| Guardrails | ❌ Minimal | ✅ Permission model + trust boundaries |

The harness is the engineering layer that provides all of this. Without it, you have a chatbot that can call functions. With it, you have an agent that can navigate a codebase, fix bugs across multiple files, and commit the result — all autonomously.

## Anatomy of a Harness

Every harness, regardless of implementation, has four subsystems:

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

1. **Agentic Loop** — The think → act → observe cycle that drives all agent behavior. The model reasons, invokes a tool, observes the result, and loops until the task is complete.

2. **Tool System** — The registry of capabilities available to the agent: file I/O, shell execution, web search, API calls. Tools can be static (loaded at startup) or dynamic (loaded on demand via skill menus).

3. **Memory & Context** — The system that decides what the model can *see*. This encompasses three distinct concerns:
   - **Context** — what goes into the current API call (system prompt, tools, files, conversation history)
   - **Memory** — what persists across sessions (MEMORY.md, daily logs, learned preferences)
   - **Session** — the boundary of a single agent run (message history, tool results, scratch state)

4. **Guardrails** — Permission boundaries, sandbox enforcement, and safety constraints. What the agent can and cannot do, and how to prevent prompt injection from bypassing those boundaries.

These four subsystems are explored in depth in the [Core Concepts](/guide/agentic-loop) section.

## A Minimal Example

The simplest harness is a loop. This is production-incomplete but structurally correct:

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

Every harness — from a 50-line script to Claude Code — is a variation of this loop. The complexity comes from what you build *around* it: context assembly, memory persistence, skill orchestration, error recovery, and sandboxing.

## Harness vs. Framework vs. Runtime

These three terms are often confused. They are different layers:

| Term | Role | Examples |
|------|------|----------|
| **Harness** | The orchestration code that wraps a model into an agent | Claude Code, Codex CLI, OpenClaw |
| **Framework** | A library that provides building blocks for constructing harnesses | LangChain, CrewAI, AutoGen |
| **Runtime** | The persistent process that keeps a harness running, manages its lifecycle, and connects it to the outside world | OpenClaw runtime, Docker container, systemd service |

A framework helps you *build* a harness. A runtime *hosts* a harness — keeping it alive, handling reconnection, scheduling heartbeats, and routing messages to it. The harness itself is the orchestration logic: how context is assembled, which tools are loaded, and how the agentic loop behaves.

## Common Pitfalls

- **Blaming the model for harness problems** — When an agent fails, it's usually a context issue (wrong files loaded, missing instructions) or a tool issue (incorrect schema, silent errors), not a model capability problem.
- **Over-engineering from day one** — Start with the minimal loop above. Add memory when you need cross-session state. Add skills when you have too many tools. Add guardrails when you move to production.
- **Treating the context window as unlimited** — The model can only reason about what's in its context. If critical information isn't assembled into the prompt, it effectively doesn't exist.

## Further Reading

- [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/) — The blog post that named the discipline
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Anthropic's patterns for production agents
