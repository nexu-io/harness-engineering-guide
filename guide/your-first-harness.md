# Your First Harness

A harness is just a loop: send messages to a model, execute any tool calls it makes, feed the results back, and repeat until it's done. You can build a working one in under 50 lines of Python.

## Why It Matters

Most agent tutorials start with a framework — LangChain, CrewAI, AutoGen. But frameworks hide the mechanism. Building a harness from scratch teaches you exactly what's happening: the tool loop, context assembly, and the model's decision-making process. Once you understand this, every framework becomes transparent.

## The Complete Harness

Here's a fully working harness with two tools (read file and write file). Copy-paste this and run it.

### Prerequisites

```bash
pip install openai
export OPENAI_API_KEY="sk-your-key-here"
```

### The Code

```python
#!/usr/bin/env python3
"""A complete agent harness in ~50 lines. Run: python harness.py"""

import json
import os
from openai import OpenAI

client = OpenAI()
MODEL = "gpt-4o-mini"  # Cheap and fast for learning
MAX_TURNS = 15

# --- System prompt ---
SYSTEM = """You are a helpful file assistant. You can read and write files.
When asked to work with files, use the tools provided.
Always confirm what you did after completing a task."""

# --- Tool definitions ---
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a file at the given path",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"}
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file (creates or overwrites)",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"},
                    "content": {"type": "string", "description": "Content to write"}
                },
                "required": ["path", "content"]
            }
        }
    }
]

# --- Tool execution ---
def execute_tool(name: str, args: dict) -> str:
    try:
        if name == "read_file":
            with open(args["path"], "r") as f:
                return f.read()
        elif name == "write_file":
            os.makedirs(os.path.dirname(args["path"]) or ".", exist_ok=True)
            with open(args["path"], "w") as f:
                f.write(args["content"])
            return f"Wrote {len(args['content'])} chars to {args['path']}"
        else:
            return f"Error: Unknown tool '{name}'"
    except Exception as e:
        return f"Error: {e}"

# --- The tool loop ---
def run(user_message: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user_message}
    ]

    for turn in range(MAX_TURNS):
        response = client.chat.completions.create(
            model=MODEL, messages=messages, tools=TOOLS
        )
        msg = response.choices[0].message
        messages.append(msg)

        # No tool calls → model is done
        if not msg.tool_calls:
            return msg.content

        # Execute each tool call
        for tc in msg.tool_calls:
            args = json.loads(tc.function.arguments)
            print(f"  🔧 {tc.function.name}({args})")
            result = execute_tool(tc.function.name, args)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result
            })

    return "Max turns reached."

# --- Main ---
if __name__ == "__main__":
    print("🤖 File Agent (type 'quit' to exit)")
    while True:
        user_input = input("\nYou: ").strip()
        if user_input.lower() in ("quit", "exit"):
            break
        response = run(user_input)
        print(f"\nAgent: {response}")
```

### Try It

```bash
python harness.py
```

```
🤖 File Agent (type 'quit' to exit)

You: Create a file called hello.txt with a haiku about programming

  🔧 write_file({'path': 'hello.txt', 'content': 'Semicolons fall\nLike rain upon the server\nCompile error: none'})

Agent: I've created hello.txt with a programming haiku!

You: Read it back to me

  🔧 read_file({'path': 'hello.txt'})

Agent: Here's the content of hello.txt:
"Semicolons fall / Like rain upon the server / Compile error: none"
```

## Anatomy of the Harness

The entire harness is four components:

```
┌────────────────────────────────┐
│         System Prompt          │  ← Who the agent is
├────────────────────────────────┤
│        Tool Definitions        │  ← What it can do (JSON schema)
├────────────────────────────────┤
│        Tool Execution          │  ← How tools actually run
├────────────────────────────────┤
│          Tool Loop             │  ← The cycle: think → act → observe
└────────────────────────────────┘
```

**System prompt**: Sets the agent's personality and constraints. This is the cheapest, highest-leverage piece — a single sentence change here can completely alter behavior.

**Tool definitions**: JSON schemas the model reads to understand what tools exist. The model never sees your Python code — only the descriptions and parameter schemas.

**Tool execution**: Your code that actually performs actions. The model outputs structured JSON; you parse it and do the real work.

**Tool loop**: The orchestrator. Call the model, check for tool calls, execute them, feed results back. Repeat until the model responds with plain text.

## Adding a Third Tool

Want to add shell commands? Just add a tool definition and a handler:

```python
# Add to TOOLS list:
{
    "type": "function",
    "function": {
        "name": "run_shell",
        "description": "Run a shell command and return stdout/stderr",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to run"}
            },
            "required": ["command"]
        }
    }
}

# Add to execute_tool():
elif name == "run_shell":
    import subprocess
    r = subprocess.run(args["command"], shell=True, capture_output=True, text=True, timeout=30)
    return r.stdout + r.stderr
```

The loop doesn't change. The model automatically discovers and uses the new tool.

## Swapping Models

The harness is model-agnostic. Switch to Anthropic's Claude by changing the client:

```python
from anthropic import Anthropic

client = Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    system=SYSTEM,
    messages=messages,
    tools=[{
        "name": t["function"]["name"],
        "description": t["function"]["description"],
        "input_schema": t["function"]["parameters"]
    } for t in TOOLS]
)

# Parse tool calls from response.content blocks
for block in response.content:
    if block.type == "tool_use":
        result = execute_tool(block.name, block.input)
```

Same loop. Same tools. Different model.

## What's Missing (and What Comes Next)

This harness works, but production agents need more:

| Feature | This harness | Production harness |
|---------|-------------|-------------------|
| Memory | None (stateless) | MEMORY.md + daily logs |
| Context management | Entire history | Priority-based windowing |
| Error recovery | Basic try/catch | Retry + escalation |
| Security | None | Sandboxed execution |
| Tool loading | All at once | On-demand skills |

Each of these is covered in the rest of this guide.

## Common Pitfalls

- **Forgetting to append the assistant message** — If you don't add `msg` to `messages` before the tool results, the model loses track of what it asked for. Always append the full assistant response first.
- **Stringifying tool results wrong** — Tool results must be strings. If your tool returns a dict, `json.dumps()` it. Returning a raw Python object will crash.
- **No iteration limit** — Without `MAX_TURNS`, a confused model can loop forever, burning tokens. Always cap it.

## Further Reading

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling) — Official docs on tool definitions
- [Anthropic Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — Claude's equivalent
- [ReAct Paper](https://arxiv.org/abs/2210.03629) — The academic foundation for tool loops
