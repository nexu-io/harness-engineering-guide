---
author: Nexu
---

# Tool System

> **Core Insight:** Tools are the agent's hands. The model reasons; tools act. But the design of the tool system — how tools are registered, described, dispatched, and managed — has a bigger impact on agent quality than the model itself.

## What is a Tool?

A tool is a function that the model can invoke by name with structured arguments. The model sees a **schema** (name, description, parameter types); the harness handles **execution** (actually calling the function and returning the result).

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

The model never sees or executes the implementation. It only knows the schema. This separation is fundamental — it means you can change how a tool works without changing the model's behavior, and you can restrict what the tool does without the model knowing.

## Tool Registry

The tool registry is the harness component that maps tool names to their schemas and implementations:

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

Note that `dispatch` always returns a string, even for errors. This is intentional — the model needs to see error messages so it can adapt its approach, not crash silently.

## Static vs. Dynamic Tools

**Static tools** are loaded at startup and always available. This works for small tool sets (5-15 tools) but breaks down at scale — 100 tools means 100 schemas in every API call, consuming tokens and confusing the model.

**Dynamic tools** (also called **skill loading**) solve this by presenting the model with a menu of available tool categories, and loading specific tools only when requested:

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

The token savings are dramatic. A skill menu might cost 200 tokens; loading all tools upfront can cost 5,000+.

## Tool Description Quality

The model's ability to use tools correctly depends almost entirely on the quality of tool descriptions. A vague description leads to misuse; a precise one guides correct behavior:

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

Key principles for tool descriptions:
- State what the tool **does**, not what it **is**
- Specify the **output format** (JSON, plain text, one-per-line)
- Include **constraints** (max results, file size limits)
- Add **examples** for non-obvious parameters

## Tool Composition Patterns

Complex agent capabilities often emerge from composing simple tools rather than building complex ones:

| Pattern | Example |
|---------|---------|
| **Sequential** | `read_file` → `edit_file` → `run_tests` |
| **Fan-out** | Read 5 files in parallel, then synthesize |
| **Conditional** | `list_files` → decide which to `read_file` |
| **Iterative** | `run_tests` → `edit_file` → `run_tests` (until passing) |

The harness doesn't need to implement these patterns — the model discovers them naturally through the agentic loop. Your job is to provide the right atomic tools and let the model compose them.

## MCP: Model Context Protocol

[MCP](https://modelcontextprotocol.io/) is an open standard for exposing tools to agents over a transport layer (stdio, HTTP SSE). Instead of hardcoding tools into your harness, MCP lets you connect to external tool servers:

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

MCP is significant because it decouples tool implementation from the harness. A tool written for one harness works in any MCP-compatible harness — Claude Desktop, OpenClaw, Cursor, and others.

## Common Pitfalls

- **Too many tools at once** — More than ~20 active tools degrades model performance. Use dynamic loading.
- **Silent failures** — Tools that return empty strings on error leave the model guessing. Always return explicit error messages.
- **Missing tool results** — If you forget to append a tool result to the message history, the API call will fail. Every tool call must have a corresponding tool result.
- **Inconsistent return types** — If `read_file` sometimes returns content and sometimes returns an error dict, the model can't reliably parse the output. Standardize your result format.

## Further Reading

- [Anthropic: Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — Production tool use patterns
- [Model Context Protocol](https://modelcontextprotocol.io/) — The open standard for agent tools
