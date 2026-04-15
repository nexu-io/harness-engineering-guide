# 搭建你的第一个 Harness

Harness 就是一个循环：把消息发给模型，执行它发出的工具调用，把结果喂回去，重复直到完成。你可以用不到 50 行 Python 搭一个能跑的出来。

## 为什么重要

大多数 Agent 教程一上来就用框架 — LangChain、CrewAI、AutoGen。但框架隐藏了机制。从头搭建 Harness 能让你真正理解底层发生了什么：Tool Loop、上下文组装、模型的决策过程。一旦你理解了这些，任何框架对你来说都是透明的。

## 完整的 Harness

这是一个带两个工具（读文件和写文件）的完整 Harness。复制粘贴就能跑。

### 前置条件

```bash
pip install openai
export OPENAI_API_KEY="sk-your-key-here"
```

### 代码

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

### 试试看

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

## Harness 的解剖

整个 Harness 由四个组件构成：

```
┌────────────────────────────────┐
│         System Prompt          │  ← Agent 的身份定义
├────────────────────────────────┤
│        Tool Definitions        │  ← 它能做什么（JSON schema）
├────────────────────────────────┤
│        Tool Execution          │  ← 工具实际如何运行
├────────────────────────────────┤
│          Tool Loop             │  ← 循环：思考 → 行动 → 观察
└────────────────────────────────┘
```

**System prompt**: 设定 Agent 的人设和约束。这是性价比最高的部分 — 改一句话就能完全改变行为。

**Tool definitions**: 模型读取的 JSON schema，用来了解有哪些工具可用。模型永远看不到你的 Python 代码 — 只能看到描述和参数 schema。

**Tool execution**: 你写的代码，真正执行动作。模型输出结构化 JSON；你解析并执行实际操作。

**Tool Loop**: 编排器。调用模型、检查工具调用、执行、把结果喂回去。重复直到模型返回纯文本。

## 添加第三个工具

想加 shell 命令？只需要加一个工具定义和一个处理函数：

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

循环不用改。模型会自动发现并使用新工具。

## 切换模型

Harness 是模型无关的。换成 Anthropic 的 Claude 只需要改 client：

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

同样的循环。同样的工具。不同的模型。

## 缺少什么（以及后续内容）

这个 Harness 能用，但生产级 Agent 还需要更多：

| 特性 | 当前 Harness | 生产级 Harness |
|------|-------------|---------------|
| 记忆 | 无（无状态） | MEMORY.md + 每日日志 |
| 上下文管理 | 完整历史 | 基于优先级的窗口化 |
| 错误恢复 | 基础 try/catch | 重试 + 升级处理 |
| 安全 | 无 | 沙箱执行 |
| 工具加载 | 全部一次加载 | 按需加载 Skill |

这些内容在本指南的后续章节中会逐一覆盖。

## 常见陷阱

- **忘记追加 assistant 消息** — 如果你不把 `msg` 加到 `messages` 里（在工具结果之前），模型会丢失它请求的上下文。一定要先追加完整的 assistant 响应。
- **工具结果序列化错误** — 工具结果必须是字符串。如果你的工具返回 dict，用 `json.dumps()` 转换。返回原始 Python 对象会直接崩溃。
- **没有迭代上限** — 没有 `MAX_TURNS` 的话，困惑的模型可能会无限循环，疯狂烧 Token。一定要设上限。

## 延伸阅读

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling) — 工具定义的官方文档
- [Anthropic Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — Claude 的对应文档
- [ReAct Paper](https://arxiv.org/abs/2210.03629) — Tool Loop 的学术基础
