---
author: Nexu
---

# Tool 系统

> **Core Insight:** Tool 是 Agent 的双手。模型负责推理，Tool 负责执行。但 Tool 系统的设计——如何注册、描述、分发和管理 Tool——对 Agent 质量的影响比模型本身更大。

## 什么是 Tool？

Tool 是模型可以通过名称和结构化参数调用的函数。模型看到的是 **Schema**（名称、描述、参数类型）；Harness 负责**执行**（实际调用函数并返回结果）。

```python
# What the model sees (tool schema)
{
    "name": "read_file",
    "description": "Read the contents of a file at the given path",
    "parameters": {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "File path to read"}
        },
        "required": ["path"]
    }
}

# What the harness executes (tool implementation)
def read_file(path: str) -> str:
    with open(path, 'r') as f:
        return f.read()
```

模型永远看不到也不执行实现代码。它只知道 Schema。这种分离是根本性的——意味着你可以在不影响模型行为的情况下修改 Tool 的实现，也可以在模型不知情的情况下限制 Tool 的行为。

## Tool 注册表

Tool 注册表是 Harness 中将 Tool 名称映射到 Schema 和实现的组件：

```python
class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, name: str, schema: dict, handler: Callable):
        self._tools[name] = Tool(name=name, schema=schema, handler=handler)

    def get_schemas(self) -> list[dict]:
        """Return schemas for the LLM API call."""
        return [t.schema for t in self._tools.values()]

    def dispatch(self, name: str, arguments: dict) -> str:
        """Execute a tool call and return the result as a string."""
        tool = self._tools.get(name)
        if not tool:
            return f"Error: Unknown tool '{name}'"
        try:
            result = tool.handler(**arguments)
            return str(result)
        except Exception as e:
            return f"Error: {type(e).__name__}: {e}"
```

注意 `dispatch` 即使出错也始终返回字符串。这是故意的——模型需要看到错误信息来调整策略，而不是静默崩溃。

## 静态 vs. 动态 Tool

**静态 Tool** 在启动时加载，始终可用。这在 Tool 数量少（5-15 个）时没问题，但规模大了就不行——100 个 Tool 意味着每次 API 调用都带 100 个 Schema，消耗 Token 且让模型困惑。

**动态 Tool**（也叫 **Skill 加载**）通过向模型展示可用 Tool 类别的菜单来解决这个问题，只在请求时才加载特定 Tool：

```python
# Instead of loading all 100 tools, show a menu
SKILL_MENU = """
Available skills (use load_skill to activate):
- file_ops: Read, write, search files
- git: Git operations (status, diff, commit, push)
- web: HTTP requests, web search
- database: SQL queries, schema inspection
"""

# The model calls load_skill("git") and then gets git-specific tools
def load_skill(skill_name: str) -> str:
    tools = skill_registry.load(skill_name)
    active_tools.extend(tools)
    return f"Loaded {len(tools)} tools: {[t.name for t in tools]}"
```

Token 节省非常可观。一个 Skill 菜单可能花费 200 Token；一次性加载所有 Tool 可能要 5,000+。

## Tool 描述质量

模型能否正确使用 Tool，几乎完全取决于 Tool 描述的质量。模糊的描述导致误用，精确的描述引导正确行为：

```python
# Bad — the model will guess at behavior
{"name": "search", "description": "Search for things"}

# Good — unambiguous, includes format and constraints
{
    "name": "search_files",
    "description": "Search for files matching a glob pattern in the workspace. "
                   "Returns a list of relative file paths, one per line. "
                   "Max 100 results. Use '**/*.py' for recursive Python file search.",
    "parameters": {
        "type": "object",
        "properties": {
            "pattern": {
                "type": "string",
                "description": "Glob pattern (e.g., '*.md', 'src/**/*.ts')"
            }
        },
        "required": ["pattern"]
    }
}
```

Tool 描述的关键原则：
- 描述 Tool **做什么**，而不是它**是什么**
- 指明**输出格式**（JSON、纯文本、每行一个）
- 包含**约束**（最大结果数、文件大小限制）
- 对非直观参数加上**示例**

## Tool 组合模式

复杂的 Agent 能力通常来自简单 Tool 的组合，而非构建复杂的单一 Tool：

| 模式 | 示例 |
|---------|---------|
| **顺序执行** | `read_file` → `edit_file` → `run_tests` |
| **扇出** | 并行读 5 个文件，然后综合分析 |
| **条件分支** | `list_files` → 决定读哪些 → `read_file` |
| **迭代** | `run_tests` → `edit_file` → `run_tests`（直到通过） |

Harness 不需要实现这些模式——模型通过 Agentic Loop 自然发现它们。你的任务是提供正确的原子 Tool，让模型自行组合。

## MCP: Model Context Protocol

[MCP](https://modelcontextprotocol.io/) 是一个开放标准，通过传输层（stdio、HTTP SSE）向 Agent 暴露 Tool。不再需要把 Tool 硬编码到 Harness 中，MCP 让你连接外部 Tool 服务器：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

MCP 的意义在于它将 Tool 实现与 Harness 解耦。为一个 Harness 写的 Tool 可以在任何兼容 MCP 的 Harness 中工作——Claude Desktop、OpenClaw、Cursor 等。

## 常见误区

- **同时加载太多 Tool** —— 超过 ~20 个活跃 Tool 会降低模型表现。用动态加载。
- **静默失败** —— 出错时返回空字符串的 Tool 让模型只能猜。务必返回明确的错误信息。
- **缺失 Tool 结果** —— 忘记把 Tool 结果追加到消息历史，API 调用会失败。每个 Tool 调用必须有对应的 Tool 结果。
- **返回类型不一致** —— 如果 `read_file` 有时返回内容、有时返回错误 dict，模型无法可靠解析输出。标准化你的结果格式。

## 延伸阅读

- [Anthropic: Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) —— 生产级 Tool 使用模式
- [Model Context Protocol](https://modelcontextprotocol.io/) —— Agent Tool 的开放标准
