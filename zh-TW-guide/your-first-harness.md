---
author: Nexu
---

# 你的第一個 Harness

> **Core Insight:** Harness 就是一個迴圈——呼叫模型、執行 Tool 呼叫、把結果喂回去、重複。用不到 50 行 Python 就能搞定。理解這個迴圈，就能看透所有 Agent 框架。

大多數 Agent 教程從框架入手——LangChain、CrewAI、AutoGen。但框架隱藏了機制。從零構建一個 Harness 能讓你精確理解發生了什麼：Agentic Loop、Context 組裝、以及模型的決策過程。理解了這些，所有框架對你來說都是透明的。

## 完整的 Harness

這是一個帶兩個 Tool（讀檔案和寫檔案）的完整可執行 Harness。直接複製貼上執行即可。

### 前置條件

```bash
pip install openai
export OPENAI_API_KEY="sk-your-key-here"
```

### 程式碼

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

### 試試看

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

## Harness 的結構剖析

整個 Harness 由四個元件構成：

```
┌────────────────────────────────┐
│         System Prompt          │  ← Agent 的身份定義
├────────────────────────────────┤
│        Tool Definitions        │  ← 能做什麼（JSON Schema）
├────────────────────────────────┤
│        Tool Execution          │  ← Tool 實際執行邏輯
├────────────────────────────────┤
│          Tool Loop             │  ← 迴圈：思考 → 執行 → 觀察
└────────────────────────────────┘
```

**System prompt**：設定 Agent 的角色和約束。這是價效比最高的部分——改一句話就可能完全改變行為。

**Tool 定義**：模型讀取的 JSON Schema，用來理解有哪些 Tool 可用。模型看不到你的 Python 程式碼——只能看到描述和引數 Schema。

**Tool 執行**：實際執行操作的程式碼。模型輸出結構化 JSON，你解析並執行真正的操作。

**Tool 迴圈**：編排器。呼叫模型、檢查有沒有 Tool 呼叫、執行、把結果喂回去。迴圈直到模型返回純文本。

## 新增第三個 Tool

想加 Shell 命令？只需加一個 Tool 定義和處理函式：

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

迴圈不需要改。模型會自動發現並使用新 Tool。

## 切換模型

Harness 是模型無關的。切換到 Anthropic 的 Claude 只需要換 client：

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

同樣的迴圈，同樣的 Tool，不同的模型。

## 缺什麼（以及後續內容）

這個 Harness 能跑，但生產級 Agent 還需要更多：

| 特性 | 當前 Harness | 生產級 Harness |
|---------|-------------|-------------------|
| Memory | 無（無狀態） | MEMORY.md + 每日日誌 |
| Context 管理 | 完整歷史 | 基於優先順序的視窗化 |
| 錯誤恢復 | 基礎 try/catch | 重試 + 升級 |
| 安全 | 無 | Sandbox 執行 |
| Tool 載入 | 一次性全載入 | 按需載入 Skill |

後續章節會逐一講解這些內容。

## 常見誤區

- **忘記追加 assistant 訊息** —— 如果你沒在 Tool 結果之前把 `msg` 加入 `messages`，模型會丟失它請求了什麼的上下文。務必先追加完整的 assistant 響應。
- **Tool 結果序列化錯誤** —— Tool 結果必須是字串。如果你的 Tool 返回 dict，用 `json.dumps()` 轉一下。直接返回 Python 物件會崩。
- **沒有迭代上限** —— 沒有 `MAX_TURNS`，模型可能會無限迴圈，燒 Token。一定要設上限。

## 延伸閱讀

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling) —— 官方 Tool 定義文件
- [Anthropic Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) —— Claude 的對應文件
- [ReAct Paper](https://arxiv.org/abs/2210.03629) —— Tool 迴圈的學術基礎
