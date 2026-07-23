---
author: Nexu
---

# Tool 系統

> **Core Insight:** Tool 是 Agent 的雙手。模型負責推理，Tool 負責執行。但 Tool 系統的設計——如何註冊、描述、分發和管理 Tool——對 Agent 品質的影響比模型本身更大。

## 什麼是 Tool？

Tool 是模型可以通過名稱和結構化引數呼叫的函式。模型看到的是 **Schema**（名稱、描述、引數型別）；Harness 負責**執行**（實際呼叫函式並返回結果）。

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

模型永遠看不到也不執行實現程式碼。它只知道 Schema。這種分離是根本性的——意味著你可以在不影響模型行為的情況下修改 Tool 的實現，也可以在模型不知情的情況下限制 Tool 的行為。

## Tool 註冊表

Tool 註冊表是 Harness 中將 Tool 名稱對映到 Schema 和實現的元件：

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

注意 `dispatch` 即使出錯也始終返回字串。這是故意的——模型需要看到錯誤資訊來調整策略，而不是靜默崩潰。

## 靜態 vs. 動態 Tool

**靜態 Tool** 在啟動時載入，始終可用。這在 Tool 數量少（5-15 個）時沒問題，但規模大了就不行——100 個 Tool 意味著每次 API 呼叫都帶 100 個 Schema，消耗 Token 且讓模型困惑。

**動態 Tool**（也叫 **Skill 載入**）通過向模型展示可用 Tool 類別的選單來解決這個問題，只在請求時才載入特定 Tool：

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

Token 節省非常可觀。一個 Skill 選單可能花費 200 Token；一次性載入所有 Tool 可能要 5,000+。

## Tool 描述品質

模型能否正確使用 Tool，幾乎完全取決於 Tool 描述的品質。模糊的描述導致誤用，精確的描述引導正確行為：

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

Tool 描述的關鍵原則：
- 描述 Tool **做什麼**，而不是它**是什麼**
- 指明**輸出格式**（JSON、純文本、每行一個）
- 包含**約束**（最大結果數、檔案大小限制）
- 對非直觀引數加上**示例**

## Tool 組合模式

複雜的 Agent 能力通常來自簡單 Tool 的組合，而非構建複雜的單一 Tool：

| 模式 | 示例 |
|---------|---------|
| **順序執行** | `read_file` → `edit_file` → `run_tests` |
| **扇出** | 並行讀 5 個檔案，然後綜合分析 |
| **條件分支** | `list_files` → 決定讀哪些 → `read_file` |
| **迭代** | `run_tests` → `edit_file` → `run_tests`（直到通過） |

Harness 不需要實現這些模式——模型通過 Agentic Loop 自然發現它們。你的任務是提供正確的原子 Tool，讓模型自行組合。

## MCP: Model Context Protocol

[MCP](https://modelcontextprotocol.io/) 是一個開放標準，通過傳輸層（stdio、HTTP SSE）向 Agent 暴露 Tool。不再需要把 Tool 硬編碼到 Harness 中，MCP 讓你連線外部 Tool 伺服器：

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

MCP 的意義在於它將 Tool 實現與 Harness 解耦。為一個 Harness 寫的 Tool 可以在任何相容 MCP 的 Harness 中工作——Claude Desktop、OpenClaw、Cursor 等。

## 常見誤區

- **同時載入太多 Tool** —— 超過 ~20 個活躍 Tool 會降低模型表現。用動態載入。
- **靜默失敗** —— 出錯時返回空字串的 Tool 讓模型只能猜。務必返回明確的錯誤資訊。
- **缺失 Tool 結果** —— 忘記把 Tool 結果追加到訊息歷史，API 呼叫會失敗。每個 Tool 呼叫必須有對應的 Tool 結果。
- **返回型別不一致** —— 如果 `read_file` 有時返回內容、有時返回錯誤 dict，模型無法可靠解析輸出。標準化你的結果格式。

## 延伸閱讀

- [Anthropic: Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) —— 生產級 Tool 使用模式
- [Model Context Protocol](https://modelcontextprotocol.io/) —— Agent Tool 的開放標準
