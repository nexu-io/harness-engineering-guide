# 工具调用循环

Tool Loop 是每个 Agent Harness 的核心心跳。它是模型思考、调用工具、观察结果、然后决定下一步的循环。

## 为什么重要

没有 Tool Loop，LLM 只能生成文本。有了它，LLM 可以读文件、跑代码、搜索网页、执行真实操作。Tool Loop 是把语言模型变成 Agent 的关键。

## 基本模式

```python
def agent_loop(messages, tools):
    while True:
        # Ask the model what to do
        response = llm.chat(messages, tools=tools)

        # If no tool calls, we're done
        if not response.tool_calls:
            return response.text

        # Execute each tool call
        for call in response.tool_calls:
            result = execute_tool(call.name, call.arguments)
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": str(result)
            })

        # Loop back — model sees the tool results and decides next step
```

这就是 [ReAct 模式](https://arxiv.org/abs/2210.03629) 的工程表达：**推理**（模型思考）→ **行动**（工具执行）→ **观察**（模型看到结果）→ 重复。

## 实际实现：添加一个工具

定义一个模型可以调用的工具：

```python
tools = [{
    "type": "function",
    "function": {
        "name": "read_file",
        "description": "Read the contents of a file",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path to read"
                }
            },
            "required": ["path"]
        }
    }
}]

def execute_tool(name, args):
    if name == "read_file":
        return open(args["path"]).read()
    raise ValueError(f"Unknown tool: {name}")
```

模型看到工具描述后自己决定什么时候使用。你不需要告诉它"现在读文件" — 它会根据上下文自己判断。

## 关键设计决策

### 1. 循环终止

模型自己决定何时停止。但你需要防护措施：

```python
MAX_ITERATIONS = 25

for i in range(MAX_ITERATIONS):
    response = llm.chat(messages, tools=tools)
    if not response.tool_calls:
        return response.text
    # ... execute tools ...

# If we hit the limit, force a response
messages.append({"role": "system", "content": "Maximum steps reached. Provide your final answer now."})
return llm.chat(messages).text
```

### 2. 并行 vs. 串行工具调用

有些模型会一次返回多个工具调用：

```python
# Sequential (one at a time)
response.tool_calls = [read_file("src/main.py")]

# Parallel (multiple at once)
response.tool_calls = [
    read_file("src/main.py"),
    read_file("src/utils.py"),
    read_file("package.json")
]
```

并行调用应该并发执行以提高速度。模型会把相关的读取操作批量发出来提高效率。

### 3. 错误处理

工具会失败。模型需要看到错误并自行恢复：

```python
def execute_tool(name, args):
    try:
        if name == "read_file":
            return open(args["path"]).read()
    except FileNotFoundError:
        return f"Error: File '{args['path']}' not found"
    except PermissionError:
        return f"Error: Permission denied for '{args['path']}'"
```

不要捕获并隐藏错误 — 把它们返回给模型。模型通常能自我纠正："文件没找到，让我先看看目录结构。"

## 不改循环就能添加工具

最好的 Harness 设计：循环永远不变，只有工具注册表在增长。

```python
# Tool registry
TOOLS = {}

def register_tool(name, description, parameters, handler):
    TOOLS[name] = {"description": description, "parameters": parameters, "handler": handler}

# Register tools
register_tool("read_file", "Read a file", {"path": "string"}, read_file_handler)
register_tool("write_file", "Write a file", {"path": "string", "content": "string"}, write_file_handler)
register_tool("run_command", "Run a shell command", {"command": "string"}, run_command_handler)
register_tool("web_search", "Search the web", {"query": "string"}, web_search_handler)

# The loop stays the same forever
def agent_loop(messages):
    tool_schemas = [to_schema(t) for t in TOOLS.values()]
    while True:
        response = llm.chat(messages, tools=tool_schemas)
        if not response.tool_calls:
            return response.text
        for call in response.tool_calls:
            result = TOOLS[call.name]["handler"](call.arguments)
            messages.append(tool_result(call, result))
```

这就是"薄 Harness + 厚 Skill"的架构。Harness 就是循环。Skill 就是工具。

## 常见陷阱

- **没有迭代上限** — Agent 可能会无限循环。一定要设上限。
- **吞掉错误** — 如果工具静默失败，模型会幻想结果。一定要返回错误信息。
- **工具太多** — 每个工具定义都占 Context Window 空间。按需加载工具，而不是一次性全部加载。参考 [Skill 按需加载 →](skill-loading.md)。
- **没有工具确认** — 破坏性工具（删除、发邮件）应该在执行前要求人工确认。

## 延伸阅读

- [ReAct: Synergizing Reasoning and Acting](https://arxiv.org/abs/2210.03629) — 该模式背后的论文
- [Skill 按需加载 →](skill-loading.md) — 如何管理可用工具
