# Harness 和框架的区别

Harness 是你从头写的代码，用来给模型包上工具、记忆和上下文。框架是用于构建 Agent 的库 — LangChain、CrewAI、AutoGen 等。两者之间的选择不是"谁更好"的问题，而是什么场景下各自更划算。

## 为什么重要

选错方案会浪费真金白银的时间。一个框架引入 500+ 依赖和多层抽象，而你的需求可能只要 50 行 Python 就能搞定。反过来，当 CrewAI 已经解决了多 Agent 编排的问题时，你从头手搓就是在浪费几周时间。下面的决策树帮你做选择。

## 决策树

```
需要一个 Agent？
│
├── 是不是单模型循环 + 不到 5 个工具？
│   └── 是 → 写原生 Harness（50-200 行）
│
├── 需要开箱即用的多 Agent 编排？
│   └── 是 → 考虑 CrewAI 或 AutoGen
│
├── 需要复杂的 RAG 管道 + 向量存储？
│   └── 是 → 考虑 LangChain
│
├── 这是一个需要完全掌控的生产产品？
│   └── 是 → 写原生 Harness（每一行代码都是你的）
│
├── 只是在快速验证原型？
│   └── 是 → 框架没问题，做好后面重写的准备
│
└── 你需要搞清楚底层到底发生了什么？
    └── 是 → 先写一个原生 Harness，然后再决定
```

## 同一个任务：三种实现方式

**任务**: 读取一个 CSV 文件，分析数据，把摘要写入 Markdown 文件。

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

**依赖**: `openai`（1 个包）
**代码行数**: ~60
**你掌控的**: 一切

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

**依赖**: `langchain`、`langchain-openai`、`langchain-core`，加上它们的传递依赖（~50+ 个包）
**代码行数**: ~40（但底层的抽象层有数千行）
**你掌控的**: 工具定义、prompt 模板。其他全是 LangChain 的。

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

**依赖**: `crewai`、`crewai-tools`，加上它们的依赖（~80+ 个包）
**代码行数**: ~35
**你掌控的**: Agent 角色、任务描述。执行流程是 CrewAI 的。

## 权衡矩阵

| 维度 | 原生 Harness | LangChain | CrewAI |
|------|-------------|-----------|--------|
| 代码行数 | 更多 | 更少 | 最少 |
| 依赖 | 1 个 | ~50 | ~80 |
| 调试 | 简单（就是你的代码） | 困难（深层堆栈跟踪） | 中等 |
| 灵活性 | 完全掌控 | 受抽象层限制 | 只能基于角色 |
| 多 Agent | 自己搭 | 可以但复杂 | 内置 |
| 学习曲线 | 理解模型 API | 学 LangChain 概念 | 学 CrewAI 概念 |
| 升级路径 | 想改哪里改哪里 | 等 LangChain 更新 | 等 CrewAI 更新 |
| 生产就绪 | 你说了算 | 取决于版本稳定性 | 更新、实战检验更少 |

## 框架的隐性成本

### 1. 调试黑盒

在原生 Harness 里出了问题，你看你的 60 行代码。在 LangChain 里出问题：

```
File "langchain/agents/openai_tools/base.py", line 147, in _plan
File "langchain_core/runnables/base.py", line 534, in invoke
File "langchain/chains/base.py", line 89, in __call__
File "langchain_core/callbacks/manager.py", line 442, in _handle_event
...
```

你在调试别人的架构。

### 2. 抽象锁定

想加流式输出？自定义记忆？非标准的工具调用模式？在原生 Harness 里，直接写。在框架里，你得在它的扩展点里操作 — 或者 fork 整个库。

### 3. 版本变更

LangChain 经历过多次大版本 API 重构。6 个月前写的代码今天可能已经跑不了了。只用 `openai` 包的原生 Harness 已经稳定运行了好几年。

## 框架什么时候更好

框架不是坏东西。在这些场景下它们确实有帮助：

- **你在做原型** — 用一个下午把东西跑通来验证想法。后面再重写。
- **多 Agent 编排** — CrewAI 的 agent-task 模型对复杂的多角色工作流确实好用。
- **RAG 管道** — LangChain 的文档加载器、分割器和向量存储集成省了很多活。
- **你不关心底层管道** — 如果 Agent 只是更大产品的一小部分，你只需要它能跑。

## 混合方案

很多生产团队先用框架起步，再迁移到原生 Harness：

```
第 1 周:  LangChain 原型 → "能跑了！"
第 4 周:  撞上限制 → "为什么做不了 X？"
第 8 周:  Fork / 覆写了框架一半的东西 → "我在跟框架对着干"
第 12 周: 重写为原生 Harness → "200 行代码，精准满足我的需求"
```

这完全没问题。框架教会了你需要什么。Harness 给你掌控权。

## 常见陷阱

- **在理解基础之前就上框架** — 你无法调试你不理解的东西。先从头搭一个原生 Harness，哪怕生产环境不用它。
- **根据 GitHub stars 选型** — Stars ≠ 适合。一个 80K stars 的框架如果是为 RAG 管道设计的，对你搭 coding agent 没有帮助。
- **害怕"重新造轮子"** — 这里的轮子就 50 行 Python。没多少轮子好造的。

## 延伸阅读

- [LangChain Documentation](https://python.langchain.com/) — 最流行的框架
- [CrewAI Documentation](https://docs.crewai.com/) — 多 Agent 编排
- [AutoGen](https://microsoft.github.io/autogen/) — 微软的多 Agent 框架
- [搭建你的第一个 Harness](your-first-harness.md) — 自己动手搭原生版本
