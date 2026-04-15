---
author: Nexu
---

# Harness vs. Framework

> **Core Insight:** 一个 Framework 引入数百个依赖和多层抽象，但你的任务可能只需要 50 行 Python。然而，如果 CrewAI 已经解决了多 Agent 编排，你非要从零手写就是浪费几周时间。关键是根据问题选工具，而不是无脑选最火的那个。

Harness 是你从零编写的代码，用来给模型包装 Tool、Memory 和 Context。**Framework** 是提供构建 Agent 抽象的库——LangChain、CrewAI、AutoGen 等。选择哪个不在于谁"更好"，而在于什么场景下各自的收益更大。

## 决策树

```
需要一个 Agent？
│
├── 是单模型循环且 Tool < 5 个？
│   └── 是 → 直接写原生 Harness（50-200 行）
│
├── 需要开箱即用的多 Agent 编排？
│   └── 是 → 考虑 CrewAI 或 AutoGen
│
├── 需要复杂的 RAG 管道 + 向量存储？
│   └── 是 → 考虑 LangChain
│
├── 是生产级产品，需要完全掌控？
│   └── 是 → 写原生 Harness（每一行都自己把控）
│
├── 在做原型验证/快速探索？
│   └── 是 → Framework 没问题，做好之后重写的准备
│
└── 需要搞清楚底层到底发生了什么？
    └── 是 → 先写一个原生 Harness，再做决定
```

## 同一任务：三种实现

**任务**：读取 CSV 文件，分析数据，把摘要写到 Markdown 文件。

### 原生 Harness（~60 行）

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

**依赖**：`openai`（1 个包）
**代码行数**：~60
**你掌控**：一切

### LangChain（~40 行，但是……）

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

**依赖**：`langchain`、`langchain-openai`、`langchain-core`，加上传递依赖（~50+ 个包）
**代码行数**：~40（但底下的抽象层有几千行）
**你掌控**：Tool 定义、prompt 模板。其余都是 LangChain 的。

### CrewAI（~35 行）

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

**依赖**：`crewai`、`crewai-tools`，加上传递依赖（~80+ 个包）
**代码行数**：~35
**你掌控**：Agent 角色、任务描述。执行流程是 CrewAI 的。

## 权衡对比

| 维度 | 原生 Harness | LangChain | CrewAI |
|-----------|------------|-----------|--------|
| 代码行数 | 多 | 少 | 最少 |
| 依赖 | 1 | ~50 | ~80 |
| 调试 | 简单（都是自己的代码） | 困难（深层堆栈） | 中等 |
| 灵活性 | 完全掌控 | 受抽象层限制 | 仅限角色模式 |
| 多 Agent | 自己实现 | 可以但复杂 | 内置支持 |
| 学习曲线 | 理解模型 API | 学 LangChain 概念 | 学 CrewAI 概念 |
| 升级路径 | 想改什么改什么 | 等 LangChain 更新 | 等 CrewAI 更新 |
| 生产就绪 | 你说了算 | 取决于版本稳定性 | 较新，实战验证较少 |

## Framework 的隐性成本

### 1. 调试黑箱

原生 Harness 出问题，你看 60 行代码。LangChain 出问题：

```
File "langchain/agents/openai_tools/base.py", line 147, in _plan
File "langchain_core/runnables/base.py", line 534, in invoke
File "langchain/chains/base.py", line 89, in __call__
File "langchain_core/callbacks/manager.py", line 442, in _handle_event
...
```

你在调试别人的架构。

### 2. 抽象锁定

想加流式输出？自定义 Memory？非标准 Tool 调用模式？原生 Harness 直接写就行。Framework 里你得在它的扩展点内操作——要么就 fork。

### 3. 版本变动

LangChain 经历了多次 API 大重构。半年前写的代码今天可能跑不了。只依赖 `openai` 包的原生 Harness 多年来一直稳定。

## Framework 占优的场景

Framework 不是坏东西。以下场景确实有帮助：

- **做原型** —— 一下午搞出能跑的东西来验证想法。之后再重写。
- **多 Agent 编排** —— CrewAI 的 Agent-Task 模型对复杂多角色工作流确实好用。
- **RAG 管道** —— LangChain 的文档加载器、分割器和向量存储集成能省不少事。
- **你不关心底层管道** —— Agent 只是大产品的一小部分，能跑就行。

## 混合方案

很多生产团队先用 Framework，再迁移到原生 Harness：

```
第 1 周：LangChain 原型 → "能跑了！"
第 4 周：遇到限制 → "为什么做不了 X？"
第 8 周：Fork/覆写了一半框架 → "我在和框架搏斗"
第 12 周：重写为原生 Harness → "200 行，精确实现我需要的功能"
```

这完全没问题。Framework 教会了你需要什么，Harness 给你掌控权。

## 常见误区

- **没搞懂基础就上 Framework** —— 你 debug 不了你不理解的东西。至少自己写一次原生 Harness，哪怕生产不用它。
- **按 GitHub star 数选型** —— Star 多 ≠ 适合。一个 8 万 star 的 RAG 管道框架对你做 coding Agent 毫无帮助。
- **怕"重复造轮子"** —— 这个轮子只有 50 行 Python，没那么大。

## 延伸阅读

- [LangChain Documentation](https://python.langchain.com/) —— 最流行的 Framework
- [CrewAI Documentation](https://docs.crewai.com/) —— 多 Agent 编排
- [AutoGen](https://microsoft.github.io/autogen/) —— 微软的多 Agent 框架
- [你的第一个 Harness](/guide/your-first-harness) —— 自己动手写原生版本
