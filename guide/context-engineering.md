---
author: Nexu
---

# Context Engineering

> **Core Insight:** The model doesn't know what you don't tell it. Context engineering is the discipline of deciding what goes into the context window, in what order, and what gets cut when space runs out. It's the highest-leverage work in harness engineering — more impactful than model selection, prompt tuning, or tool design.

## The Problem

A 128K-token context window sounds enormous until you start filling it. A single large file can consume 10K tokens. Twenty tool schemas eat 3K. Conversation history grows linearly with every turn. Within a dozen turns of a complex coding task, you're already making hard choices about what to keep and what to drop.

Context engineering is the art of those choices. It has three pillars: **assembly** (what goes in), **compression** (what gets shrunk), and **budgeting** (how you allocate capacity).

## Context Assembly Priority System

Not all context is created equal. A priority system ensures the most critical information survives when space is tight:

| Priority | Category | Typical Tokens | Notes |
|----------|----------|---------------|-------|
| 0 (highest) | System prompt | 300–800 | Identity, behavior rules, safety constraints |
| 1 | Active tool schemas | 1,000–3,000 | Only loaded skills, not all tools |
| 2 | Task instruction | 200–1,000 | Current user request + any pinned goals |
| 3 | Memory summary | 500–2,000 | Compressed MEMORY.md + today's daily log |
| 4 | Injected files | 2,000–20,000 | AGENTS.md, SKILL.md, relevant source files |
| 5 | Recent conversation | 5,000–50,000 | Last N turns of messages + tool results |
| 6 (lowest) | Older conversation | remainder | Earlier turns, first to be compressed or dropped |

The assembler walks this list top-to-bottom, packing content until the budget is exhausted. Lower-priority content gets truncated or excluded entirely.

```python
import tiktoken

encoder = tiktoken.encoding_for_model("gpt-4o")

def estimate_tokens(text: str) -> int:
    """Fast token estimation using tiktoken."""
    return len(encoder.encode(text))


class ContextAssembler:
    """Assemble context with priority-based token budgeting."""

    def __init__(self, max_tokens: int = 128_000, reserve: int = 4_096):
        self.max_tokens = max_tokens
        self.reserve = reserve  # Leave room for the model's response
        self.budget = max_tokens - reserve
        self.sections: list[tuple[int, str, str]] = []

    def add(self, priority: int, name: str, content: str):
        """Add a section. Lower priority number = higher importance."""
        self.sections.append((priority, name, content))

    def build(self) -> list[dict]:
        """Pack sections into messages within the token budget."""
        self.sections.sort(key=lambda s: s[0])
        messages = []
        used = 0

        for priority, name, content in self.sections:
            tokens = estimate_tokens(content)
            if used + tokens <= self.budget:
                messages.append({
                    "role": "system",
                    "content": f"[{name}]\n{content}",
                })
                used += tokens
            elif priority <= 2:
                # Critical sections get truncated rather than dropped
                remaining = self.budget - used
                truncated = self._truncate_to_tokens(content, remaining)
                if truncated:
                    messages.append({
                        "role": "system",
                        "content": f"[{name} (truncated)]\n{truncated}",
                    })
                    used += estimate_tokens(truncated)
            # Priority > 2: silently dropped when over budget

        return messages

    def _truncate_to_tokens(self, text: str, max_tokens: int) -> str:
        """Truncate text to fit within a token limit."""
        tokens = encoder.encode(text)
        if len(tokens) <= max_tokens:
            return text
        return encoder.decode(tokens[:max_tokens]) + "\n[...truncated]"
```

The `reserve` parameter is easy to overlook but critical — you need to leave headroom for the model's response. If you pack the context to 100%, the model has no room to reply.

## Context Compression: Three Lines of Defense

As a session progresses, raw conversation history grows without bound. Three techniques prevent it from consuming the entire context window:

### Line 1: Auto-Decay

Older messages naturally lose relevance. A simple decay strategy drops messages beyond a fixed window, keeping only the most recent N turns:

```python
def apply_decay(messages: list[dict], max_turns: int = 20) -> list[dict]:
    """Keep the system prompt and the last max_turns exchanges."""
    system = [m for m in messages if m["role"] == "system"]
    conversation = [m for m in messages if m["role"] != "system"]
    # Each "turn" is roughly a user + assistant + tool cycle
    if len(conversation) > max_turns * 3:
        conversation = conversation[-(max_turns * 3):]
    return system + conversation
```

### Line 2: Threshold Compression

When total tokens cross a threshold (e.g., 70% of budget), compress older conversation turns into a summary while keeping recent turns verbatim:

```python
def threshold_compress(
    messages: list[dict],
    budget: int,
    threshold: float = 0.7,
    keep_recent: int = 10,
) -> list[dict]:
    """Compress older messages when token usage exceeds threshold."""
    total = sum(estimate_tokens(m["content"]) for m in messages)
    if total < budget * threshold:
        return messages  # Under threshold, no compression needed

    system = [m for m in messages if m["role"] == "system"]
    conversation = [m for m in messages if m["role"] != "system"]

    old = conversation[:-keep_recent]
    recent = conversation[-keep_recent:]

    summary = summarize_with_llm(old)  # Use a fast, cheap model
    compressed = system + [{
        "role": "system",
        "content": f"[Conversation summary]\n{summary}",
    }] + recent

    return compressed
```

### Line 3: Active Summarization

For extremely long-running tasks, periodically extract key facts and decisions into a running summary document. This is not automatic — the harness explicitly asks the model to produce a checkpoint:

```python
SUMMARIZE_PROMPT = """Summarize the key decisions, findings, and current state 
from this conversation. Include: files modified, tests run, errors encountered, 
and the current plan. Be concise — under 500 words."""

def active_summarize(messages: list[dict]) -> str:
    """Ask the model to produce a checkpoint summary."""
    response = llm.chat(
        messages=messages + [{"role": "user", "content": SUMMARIZE_PROMPT}],
        max_tokens=1024,
    )
    return response.choices[0].message.content
```

## Token Budgeting in Practice

Real token arithmetic for a 128K context window:

```
Total capacity:              128,000 tokens
Response reserve:             -4,096
System prompt:                  -500
Tool schemas (12 tools):      -2,400
MEMORY.md:                    -1,200
AGENTS.md:                      -800
─────────────────────────────────────
Available for conversation:  119,004 tokens

At ~3 tokens/word, that's ~39,600 words of conversation.
A 50-turn coding session with tool results: ~60,000 tokens.
→ You'll hit the budget around turn 35 without compression.
```

The takeaway: compression is not optional for any non-trivial session.

## Context Injection Patterns

Context doesn't only come from conversation history. Five common injection patterns:

| Pattern | When | Example |
|---------|------|---------|
| **File injection** | Session startup | Load AGENTS.md, MEMORY.md, relevant source files |
| **Memory injection** | Session startup | Compressed long-term memory + recent daily logs |
| **Tool result injection** | During loop | Append tool outputs as tool-role messages |
| **Skill injection** | On demand | Load SKILL.md when a skill is activated |
| **Retrieval injection** | Per query | RAG results from a vector store |

Each injection point has a cost. A 200-line source file is ~800 tokens. Injecting ten files speculatively costs 8K tokens before the conversation even starts. Be deliberate: inject what's needed, not what *might* be needed.

## Sliding Window Implementation

A sliding window keeps the most recent turns intact and compresses everything before the window boundary. This is the most practical strategy for production harnesses:

```python
class SlidingWindowContext:
    """Maintain a sliding window over conversation history."""

    def __init__(self, window_size: int = 15, max_tokens: int = 128_000):
        self.window_size = window_size
        self.max_tokens = max_tokens
        self.summary = ""
        self.messages: list[dict] = []

    def add(self, message: dict):
        self.messages.append(message)
        conversation = [m for m in self.messages if m["role"] != "system"]
        if len(conversation) > self.window_size * 3:
            self._compress()

    def _compress(self):
        """Move older messages into a rolling summary."""
        conversation = [m for m in self.messages if m["role"] != "system"]
        system = [m for m in self.messages if m["role"] == "system"]

        old = conversation[:-(self.window_size * 3)]
        recent = conversation[-(self.window_size * 3):]

        new_summary = summarize_with_llm(
            [{"role": "system", "content": self.summary}] + old
        )
        self.summary = new_summary
        self.messages = system + recent

    def get_messages(self) -> list[dict]:
        """Return context-ready message list."""
        result = [m for m in self.messages if m["role"] == "system"]
        if self.summary:
            result.append({
                "role": "system",
                "content": f"[Conversation history summary]\n{self.summary}",
            })
        result.extend(m for m in self.messages if m["role"] != "system")
        return result
```

## Common Pitfalls

- **Treating all context as equal priority** — System prompt and task instructions must survive; old conversation can be compressed. Without priority, you either waste space on stale messages or drop critical instructions.
- **Compressing too aggressively** — Summarization is lossy. If you compress a tool result that contained a file path the model needs later, it will hallucinate the path. Keep recent turns verbatim.
- **Ignoring token counting** — Eyeballing "this seems short enough" breaks down fast. Use actual token counting (tiktoken, model-specific tokenizers) for budgeting.
- **One-shot context assembly** — Building context once at session start and never updating it means the model operates on stale information after the first tool call. Reassemble context every turn.

## Further Reading

- [Karpathy: "Context Engineering is the New Prompt Engineering"](https://x.com/karpathy/status/1937902263428948034) — Why context assembly matters more than prompt tricks
- [Letta: MemGPT and the Future of Agent Memory](https://www.letta.com/blog/memgpt) — OS-inspired memory management with virtual context
- [OpenAI: Managing Tokens](https://platform.openai.com/docs/guides/text-generation#managing-tokens) — Token counting fundamentals
