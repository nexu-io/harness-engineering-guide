# The Tool Loop

The tool loop is the beating heart of every agent harness. It's the cycle where the model thinks, calls a tool, sees the result, and decides what to do next.

## Why It Matters

Without the tool loop, an LLM can only generate text. With it, the LLM can read files, run code, search the web, and take real actions. The tool loop is what turns a language model into an agent.

## The Basic Pattern

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

This is the [ReAct pattern](https://arxiv.org/abs/2210.03629) in engineering terms: **Reason** (model thinks) → **Act** (tool executes) → **Observe** (model sees result) → repeat.

## Real Implementation: Adding a Tool

Define a tool the model can call:

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

The model sees the tool description and decides when to use it. You never tell it "now read the file" — it figures that out from context.

## Key Design Decisions

### 1. Loop Termination

The model decides when to stop. But you need guardrails:

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

### 2. Parallel vs. Sequential Tool Calls

Some models return multiple tool calls at once:

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

Execute parallel calls concurrently for speed. The model batches related reads to be efficient.

### 3. Error Handling

Tools fail. The model needs to see the error and recover:

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

Don't catch and hide errors — return them to the model. It can often self-correct: "File not found, let me check the directory first."

## Adding Tools Without Changing the Loop

The best harness design: the loop never changes, only the tool registry grows.

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

This is the "thin harness + thick skills" architecture. The harness is the loop. The skills are the tools.

## Common Pitfalls

- **No iteration limit** — An agent can loop forever. Always set a max.
- **Swallowing errors** — If a tool fails silently, the model hallucinates results. Always return errors.
- **Too many tools** — Each tool definition takes context window space. Load tools on demand, not all at once. See [Skill Loading →](skill-loading.md).
- **No tool confirmation** — Destructive tools (delete, send email) should require human approval before execution.

## Further Reading

- [ReAct: Synergizing Reasoning and Acting](https://arxiv.org/abs/2210.03629) — The paper behind the pattern
- [Skill Loading →](skill-loading.md) — How to manage which tools are available
