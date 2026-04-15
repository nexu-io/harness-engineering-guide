# What is a Harness?

A **harness** is the runtime layer that wraps an AI model and turns it into a useful agent. It handles everything the model can't do on its own: reading files, calling tools, remembering context across sessions, and deciding when to stop.

## Why It Matters

Models are stateless. Every API call starts from zero. The harness gives the model:

- **Tools** — file access, web search, code execution
- **Memory** — what happened in previous sessions
- **Context** — which files are relevant right now
- **Constraints** — what the agent is and isn't allowed to do

Without a harness, you have a chatbot. With one, you have an agent.

## A Minimal Example

The simplest harness is a loop:

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

That's it. Every harness — from a 50-line script to Claude Code's 512K lines — is a variation of this loop. The complexity comes from what you put *around* it: context management, memory persistence, skill orchestration, error recovery, and security.

## Harness vs. Framework vs. Runtime

| Term | What it is | Example |
|------|-----------|---------|
| **Harness** | The code wrapping a model to make it an agent | Claude Code, Codex CLI, OpenClaw |
| **Framework** | A library for building agents | LangChain, CrewAI, AutoGen |
| **Runtime** | The execution environment for an agent | OpenClaw runtime, Docker sandbox |

A framework helps you *build* a harness. A runtime helps you *run* one. The harness is the thing itself.

## The Key Insight

> *"You don't own the model. You own the harness. And the harness owns the memory."*
> — Harrison Chase, LangChain

Models are commoditizing. GPT, Claude, Gemini, open-source LLMs — all converge in capability. **The harness is the moat**: how you manage context, memory, tools, and agent lifecycle determines product quality.

## Common Pitfalls

- **Confusing the harness with the model** — When an agent fails, it's usually a harness problem (wrong context, missing tools), not a model problem.
- **Over-engineering from day one** — Start with the minimal loop above. Add complexity only when you hit a real limitation.
- **Ignoring the context window** — The model can only see what's in its context. If you don't put it there, it doesn't exist.

## Further Reading

- [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/) — The blog post that named the discipline
- [Your First Harness →](your-first-harness.md) — Build one from scratch in 15 minutes

---

*Next: [Your First Harness →](your-first-harness.md)*
