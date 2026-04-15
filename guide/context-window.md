# Context Window Management

The context window is everything the model can see in a single API call — system prompt, tools, memory, conversation history, and files. Managing it is the art of deciding what goes in, what stays out, and what gets compressed. Get it wrong and your agent forgets instructions, hallucinates, or runs out of space mid-task.

## Why It Matters

Models have finite context windows: 128K tokens for GPT-4o, 200K for Claude 3.5 Sonnet, 1M for Gemini 1.5 Pro. Sounds like a lot, but a single codebase can be 500K+ tokens. A day of conversation history might be 30K tokens. Every tool definition, every file read, every system instruction competes for the same space. Without active management, you'll blow through the window in 10 minutes of work.

## Priority System

Not all context is equal. Use a priority hierarchy:

```
Priority 1 (ALWAYS load):  System prompt + AGENTS.md
Priority 2 (ALWAYS load):  Tool definitions (active tools only)
Priority 3 (ALWAYS load):  MEMORY.md (curated long-term memory)
Priority 4 (LOAD if fits): Active files the user is working on
Priority 5 (LOAD if fits): Recent conversation history
Priority 6 (COMPRESS):     Older conversation history
Priority 7 (DROP):         Stale file contents, old tool results
```

### Implementation

```python
from dataclasses import dataclass

@dataclass
class ContextBlock:
    name: str
    content: str
    priority: int         # 1 = highest
    tokens: int           # Pre-counted
    compressible: bool    # Can this be summarized?

def assemble_context(blocks: list[ContextBlock], budget: int) -> list[ContextBlock]:
    """Pack context blocks into the token budget by priority."""
    # Sort by priority (lowest number = highest priority)
    sorted_blocks = sorted(blocks, key=lambda b: b.priority)

    selected = []
    used = 0

    for block in sorted_blocks:
        if used + block.tokens <= budget:
            selected.append(block)
            used += block.tokens
        elif block.compressible:
            # Try to compress to fit
            compressed = compress_block(block, budget - used)
            if compressed and compressed.tokens <= budget - used:
                selected.append(compressed)
                used += compressed.tokens
        # else: drop it

    return selected
```

## Token Budget Allocation

A practical allocation for a 128K-token model:

```
┌──────────────────────────────────────────────────┐
│              128K Token Budget                    │
├──────────────────────────────────────────────────┤
│ System Prompt + AGENTS.md      │    2,000 (1.6%) │
│ Tool Schemas (5-10 tools)      │    2,000 (1.6%) │
│ MEMORY.md                      │      700 (0.5%) │
│ ─────────────────────────────  │ ──────────────  │
│ Reserved (always loaded)       │    4,700 (3.7%) │
│                                │                  │
│ Active Files                   │   20,000 (15.6%)│
│ Conversation History           │   60,000 (46.9%)│
│ ─────────────────────────────  │ ──────────────  │
│ Working Space                  │   80,000 (62.5%)│
│                                │                  │
│ Model Output                   │    8,000 (6.3%) │
│ Safety Margin                  │   35,300 (27.5%)│
│ ─────────────────────────────  │ ──────────────  │
│ Headroom                       │   43,300 (33.8%)│
└──────────────────────────────────────────────────┘
```

The safety margin matters — tool results can be unpredictable in size. A `read_file` call might return 50 tokens or 50,000. Budget conservatively.

## Sliding Window for Conversation History

The simplest approach: keep recent messages, drop old ones.

```python
import tiktoken

def sliding_window(messages: list[dict], max_tokens: int, model: str = "gpt-4o") -> list[dict]:
    """Keep the most recent messages that fit within the token budget.
    Always preserves the system message and the first user message."""
    enc = tiktoken.encoding_for_model(model)

    def count(msg):
        return len(enc.encode(msg.get("content", "") or "")) + 4  # ~4 tokens overhead per message

    # Always keep system prompt and first user message
    preserved = []
    remaining = []
    for i, msg in enumerate(messages):
        if msg["role"] == "system" or (msg["role"] == "user" and i <= 1):
            preserved.append(msg)
        else:
            remaining.append(msg)

    budget = max_tokens - sum(count(m) for m in preserved)

    # Fill from the end (most recent first)
    selected = []
    used = 0
    for msg in reversed(remaining):
        msg_tokens = count(msg)
        if used + msg_tokens > budget:
            break
        selected.insert(0, msg)
        used += msg_tokens

    return preserved + selected
```

## Smart Truncation

Instead of a hard cutoff, summarize what was dropped:

```python
def sliding_window_with_summary(
    client, messages: list[dict], max_tokens: int
) -> list[dict]:
    """Like sliding window, but summarizes dropped messages."""
    enc = tiktoken.encoding_for_model("gpt-4o")

    # Count total tokens
    total = sum(len(enc.encode(m.get("content", "") or "")) for m in messages)

    if total <= max_tokens:
        return messages  # Everything fits

    # Split: keep first message + system, summarize middle, keep recent
    system_msgs = [m for m in messages if m["role"] == "system"]
    conversation = [m for m in messages if m["role"] != "system"]

    # Keep the last 60% of conversation tokens
    keep_count = int(len(conversation) * 0.6)
    to_summarize = conversation[:-keep_count]
    to_keep = conversation[-keep_count:]

    # Summarize the dropped portion
    summary_prompt = "Summarize this conversation concisely, preserving key decisions and context:\n\n"
    for msg in to_summarize:
        summary_prompt += f"{msg['role']}: {msg.get('content', '[tool call]')}\n"

    summary_resp = client.chat.completions.create(
        model="gpt-4o-mini",  # Cheap model for summaries
        messages=[{"role": "user", "content": summary_prompt}],
        max_tokens=500
    )
    summary = summary_resp.choices[0].message.content

    # Reconstruct
    return system_msgs + [
        {"role": "system", "content": f"## Earlier Conversation Summary\n{summary}"},
        *to_keep
    ]
```

## File Content Management

Large file reads are the biggest context window threat. Manage them:

```python
def smart_read_file(path: str, max_lines: int = 200) -> str:
    """Read a file with intelligent truncation."""
    with open(path) as f:
        lines = f.readlines()

    if len(lines) <= max_lines:
        return "".join(lines)

    # Show first 100 and last 100 lines
    head = "".join(lines[:100])
    tail = "".join(lines[-100:])
    skipped = len(lines) - 200

    return f"{head}\n\n... ({skipped} lines omitted) ...\n\n{tail}"


def evict_stale_files(messages: list[dict], max_age: int = 5) -> list[dict]:
    """Replace old file contents with a summary after N turns."""
    result = []
    turn_count = 0

    for msg in messages:
        if msg["role"] == "assistant":
            turn_count += 1

        if msg["role"] == "tool" and turn_count > max_age:
            content = msg.get("content", "")
            if len(content) > 500:
                # Replace large tool outputs with a summary
                msg = {**msg, "content": f"[File content from {max_age}+ turns ago — evicted to save context. Re-read if needed.]"}

        result.append(msg)

    return result
```

## Real-World Numbers

How fast does context fill up during a coding session:

```
Turn 1:  User asks to fix a bug
         System prompt:    2,000 tokens
         User message:       100 tokens
         Total:            2,100 tokens

Turn 2:  Agent reads 3 files
         Tool calls:         150 tokens
         File contents:    8,000 tokens
         Total:           10,250 tokens

Turn 3:  Agent writes a fix
         Analysis:         1,000 tokens
         Tool calls:         200 tokens
         Total:           11,450 tokens

Turn 5:  Agent reads test output
         Test results:     2,000 tokens
         Total:           15,450 tokens

Turn 10: Deep debugging
         More files:      12,000 tokens
         Total:           35,000 tokens

Turn 20: Complex refactor
         Many files + history
         Total:           80,000+ tokens  ← Approaching limits
```

Without management, a 30-turn coding session easily exceeds 128K tokens.

## Common Pitfalls

- **Loading entire files when you need one function** — Use targeted reads (`grep`, line ranges) instead of reading whole files. A 2,000-line file is ~10,000 tokens; the function you need is 200 tokens.
- **Keeping all tool results forever** — A file read from 15 turns ago is almost certainly stale. Evict it or summarize it.
- **Ignoring the output token budget** — If you set `max_tokens=8000` for the model's response but only have 2,000 tokens of headroom left, the response will be truncated silently.

## Further Reading

- [Anthropic: Long Context Tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) — Prompt caching for repeated context
- [Lost in the Middle](https://arxiv.org/abs/2307.03172) — Research on how models handle information position in long contexts
- [tiktoken](https://github.com/openai/tiktoken) — OpenAI's fast token counter
