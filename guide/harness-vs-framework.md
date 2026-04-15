---
author: Nexu
---

# Harness vs. Framework

> **Core Insight:** A framework adds hundreds of dependencies and layers of abstraction for a task that might need 50 lines of Python. But hand-rolling multi-agent orchestration from scratch when CrewAI already solves it wastes weeks. The key is matching the tool to the problem, not defaulting to the most popular option.

A harness is code you write from scratch to wrap a model with tools, memory, and context. A **framework** is a library that provides abstractions for building agents — LangChain, CrewAI, AutoGen, and others. The choice between them isn't about which is "better" — it's about when each one pays off.

## Decision Tree

```
Need an agent? 
│
├── Is it a single-model loop with < 5 tools?
│   └── YES → Write a raw harness (50-200 lines)
│
├── Do you need multi-agent orchestration out of the box?
│   └── YES → Consider CrewAI or AutoGen
│
├── Do you need complex RAG pipelines with vector stores?
│   └── YES → Consider LangChain
│
├── Is this a production product where you need full control?
│   └── YES → Write a raw harness (own every line)
│
├── Are you prototyping / exploring quickly?
│   └── YES → Framework is fine, expect to rewrite later
│
└── Do you need to understand what's actually happening?
    └── YES → Write a raw harness first, then decide
```

## The Same Task: Three Ways

**Task**: Read a CSV file, analyze it, and write a summary to a Markdown file.

### Raw Harness (~60 lines)

```python
import json, csv, io
from openai import OpenAI

client = OpenAI()

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file's contents",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"}
                },
                "required": ["path", "content"]
            }
        }
    }
]

def execute(name, args):
    if name == "read_file":
        return open(args["path"]).read()
    elif name == "write_file":
        open(args["path"], "w").write(args["content"])
        return f"Written to {args['path']}"

def run(task):
    messages = [
        {"role": "system", "content": "You analyze data files and write reports."},
        {"role": "user", "content": task}
    ]
    for _ in range(10):
        resp = client.chat.completions.create(
            model="gpt-4o-mini", messages=messages, tools=TOOLS
        )
        msg = resp.choices[0].message
        messages.append(msg)
        if not msg.tool_calls:
            return msg.content
        for tc in msg.tool_calls:
            result = execute(tc.function.name, json.loads(tc.function.arguments))
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
    return "Done"

run("Read data.csv, analyze the trends, and write a summary to report.md")
```

**Dependencies**: `openai` (1 package)
**Lines of code**: ~60
**You control**: everything

### LangChain (~40 lines, but...)

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.tools import tool

@tool
def read_file(path: str) -> str:
    """Read a file's contents"""
    return open(path).read()

@tool
def write_file(path: str, content: str) -> str:
    """Write content to a file"""
    open(path, "w").write(content)
    return f"Written to {path}"

llm = ChatOpenAI(model="gpt-4o-mini")
prompt = ChatPromptTemplate.from_messages([
    ("system", "You analyze data files and write reports."),
    ("human", "{input}"),
    MessagesPlaceholder("agent_scratchpad"),
])

agent = create_openai_tools_agent(llm, [read_file, write_file], prompt)
executor = AgentExecutor(agent=agent, tools=[read_file, write_file], verbose=True)

executor.invoke({"input": "Read data.csv, analyze trends, write summary to report.md"})
```

**Dependencies**: `langchain`, `langchain-openai`, `langchain-core`, plus their transitive deps (~50+ packages)
**Lines of code**: ~40 (but the abstraction layers below are thousands)
**You control**: tool definitions, prompt template. Everything else is LangChain's.

### CrewAI (~35 lines)

```python
from crewai import Agent, Task, Crew
from crewai_tools import FileReadTool, FileWriterTool

analyst = Agent(
    role="Data Analyst",
    goal="Analyze CSV data and produce insightful reports",
    backstory="You are an expert data analyst.",
    tools=[FileReadTool(), FileWriterTool()],
    verbose=True
)

task = Task(
    description="Read data.csv, analyze the trends, write a summary to report.md",
    expected_output="A markdown report with key findings",
    agent=analyst
)

crew = Crew(agents=[analyst], tasks=[task], verbose=True)
crew.kickoff()
```

**Dependencies**: `crewai`, `crewai-tools`, plus their deps (~80+ packages)
**Lines of code**: ~35
**You control**: agent roles, task descriptions. Execution flow is CrewAI's.

## The Tradeoff Matrix

| Dimension | Raw Harness | LangChain | CrewAI |
|-----------|------------|-----------|--------|
| Lines of code | More | Less | Least |
| Dependencies | 1 | ~50 | ~80 |
| Debugging | Easy (it's your code) | Hard (deep stack traces) | Medium |
| Flexibility | Total | Limited by abstractions | Role-based only |
| Multi-agent | Build it yourself | Possible but complex | Built-in |
| Learning curve | Understand the model API | Learn LangChain concepts | Learn CrewAI concepts |
| Upgrade path | Change what you want | Wait for LangChain updates | Wait for CrewAI updates |
| Production readiness | You decide | Depends on version stability | Newer, less battle-tested |

## The Hidden Cost of Frameworks

### 1. Debugging Black Boxes

When something breaks in a raw harness, you look at your 60 lines. When something breaks in LangChain:

```
File "langchain/agents/openai_tools/base.py", line 147, in _plan
File "langchain_core/runnables/base.py", line 534, in invoke
File "langchain/chains/base.py", line 89, in __call__
File "langchain_core/callbacks/manager.py", line 442, in _handle_event
...
```

You're debugging someone else's architecture.

### 2. Abstraction Lock-in

Want to add streaming? Custom memory? A non-standard tool calling pattern? In a raw harness, you just write it. In a framework, you work within its extension points — or fork the library.

### 3. Version Churn

LangChain has had multiple major API overhauls. Code written 6 months ago may not run today. A raw harness with just the `openai` package has been stable for years.

## When Frameworks Win

Frameworks aren't bad. They genuinely help when:

- **You're prototyping** — Get something working in an afternoon to validate an idea. Rewrite later.
- **Multi-agent orchestration** — CrewAI's agent-task model is genuinely good for complex multi-role workflows.
- **RAG pipelines** — LangChain's document loaders, splitters, and vector store integrations save real work.
- **You don't care about the plumbing** — If the agent is a small part of a bigger product and you just need it to work.

## The Hybrid Approach

Many production teams start with a framework and migrate to a raw harness:

```
Week 1:  LangChain prototype → "It works!"
Week 4:  Hit a limitation → "Why can't I do X?"
Week 8:  Fork/override half the framework → "I'm fighting the framework"
Week 12: Rewrite as raw harness → "This is 200 lines and does exactly what I need"
```

This is fine. The framework taught you what you need. The harness gives you control.

## Common Pitfalls

- **Starting with a framework before understanding the basics** — You can't debug what you don't understand. Build a raw harness once, even if you never use it in production.
- **Choosing based on GitHub stars** — Stars ≠ fit. A framework with 80K stars that's designed for RAG pipelines won't help you build a coding agent.
- **Fear of "reinventing the wheel"** — The wheel here is 50 lines of Python. It's not that much wheel.

## Further Reading

- [LangChain Documentation](https://python.langchain.com/) — The most popular framework
- [CrewAI Documentation](https://docs.crewai.com/) — Multi-agent orchestration
- [AutoGen](https://microsoft.github.io/autogen/) — Microsoft's multi-agent framework
- [Your First Harness](/guide/your-first-harness) — Build the raw version yourself
