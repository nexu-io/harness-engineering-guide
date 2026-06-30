---
author: Nexu
---

# Harness vs. Framework

> **Core Insight:** 一個 Framework 引入數百個依賴和多層抽象，但你的任務可能只需要 50 行 Python。然而，如果 CrewAI 已經解決了多 Agent 編排，你非要從零手寫就是浪費幾周時間。關鍵是根據問題選工具，而不是無腦選最火的那個。

Harness 是你從零編寫的程式碼，用來給模型包裝 Tool、Memory 和 Context。**Framework** 是提供構建 Agent 抽象的庫——LangChain、CrewAI、AutoGen 等。選擇哪個不在於誰"更好"，而在於什麼場景下各自的收益更大。

## 決策樹

```
需要一個 Agent？
│
├── 是單模型迴圈且 Tool < 5 個？
│   └── 是 → 直接寫原生 Harness（50-200 行）
│
├── 需要開箱即用的多 Agent 編排？
│   └── 是 → 考慮 CrewAI 或 AutoGen
│
├── 需要複雜的 RAG 管道 + 向量儲存？
│   └── 是 → 考慮 LangChain
│
├── 是生產級產品，需要完全掌控？
│   └── 是 → 寫原生 Harness（每一行都自己把控）
│
├── 在做原型驗證/快速探索？
│   └── 是 → Framework 沒問題，做好之後重寫的準備
│
└── 需要搞清楚底層到底發生了什麼？
    └── 是 → 先寫一個原生 Harness，再做決定
```

## 同一任務：三種實現

**任務**：讀取 CSV 檔案，分析資料，把摘要寫到 Markdown 檔案。

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

**依賴**：`openai`（1 個包）
**程式碼行數**：~60
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

**依賴**：`langchain`、`langchain-openai`、`langchain-core`，加上傳遞依賴（~50+ 個包）
**程式碼行數**：~40（但底下的抽象層有幾千行）
**你掌控**：Tool 定義、prompt 模板。其餘都是 LangChain 的。

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

**依賴**：`crewai`、`crewai-tools`，加上傳遞依賴（~80+ 個包）
**程式碼行數**：~35
**你掌控**：Agent 角色、任務描述。執行流程是 CrewAI 的。

## 權衡對比

| 維度 | 原生 Harness | LangChain | CrewAI |
|-----------|------------|-----------|--------|
| 程式碼行數 | 多 | 少 | 最少 |
| 依賴 | 1 | ~50 | ~80 |
| 除錯 | 簡單（都是自己的程式碼） | 困難（深層堆疊） | 中等 |
| 靈活性 | 完全掌控 | 受抽象層限制 | 僅限角色模式 |
| 多 Agent | 自己實現 | 可以但複雜 | 內建支援 |
| 學習曲線 | 理解模型 API | 學 LangChain 概念 | 學 CrewAI 概念 |
| 升級路徑 | 想改什麼改什麼 | 等 LangChain 更新 | 等 CrewAI 更新 |
| 生產就緒 | 你說了算 | 取決於版本穩定性 | 較新，實戰驗證較少 |

## Framework 的隱性成本

### 1. 除錯黑箱

原生 Harness 出問題，你看 60 行程式碼。LangChain 出問題：

```
File "langchain/agents/openai_tools/base.py", line 147, in _plan
File "langchain_core/runnables/base.py", line 534, in invoke
File "langchain/chains/base.py", line 89, in __call__
File "langchain_core/callbacks/manager.py", line 442, in _handle_event
...
```

你在除錯別人的架構。

### 2. 抽象鎖定

想加流式輸出？自訂 Memory？非標準 Tool 呼叫模式？原生 Harness 直接寫就行。Framework 裡你得在它的擴展點內操作——要麼就 fork。

### 3. 版本變動

LangChain 經歷了多次 API 大重構。半年前寫的程式碼今天可能跑不了。只依賴 `openai` 包的原生 Harness 多年來一直穩定。

## Framework 佔優的場景

Framework 不是壞東西。以下場景確實有幫助：

- **做原型** —— 一下午搞出能跑的東西來驗證想法。之後再重寫。
- **多 Agent 編排** —— CrewAI 的 Agent-Task 模型對複雜多角色工作流確實好用。
- **RAG 管道** —— LangChain 的文件載入器、分割器和向量儲存整合能省不少事。
- **你不關心底層管道** —— Agent 只是大產品的一小部分，能跑就行。

## 混合方案

很多生產團隊先用 Framework，再遷移到原生 Harness：

```
第 1 周：LangChain 原型 → "能跑了！"
第 4 周：遇到限制 → "為什麼做不了 X？"
第 8 周：Fork/覆寫了一半框架 → "我在和框架搏鬥"
第 12 周：重寫為原生 Harness → "200 行，精確實現我需要的功能"
```

這完全沒問題。Framework 教會了你需要什麼，Harness 給你掌控權。

## 常見誤區

- **沒搞懂基礎就上 Framework** —— 你 debug 不了你不理解的東西。至少自己寫一次原生 Harness，哪怕生產不用它。
- **按 GitHub star 數選型** —— Star 多 ≠ 適合。一個 8 萬 star 的 RAG 管道框架對你做 coding Agent 毫無幫助。
- **怕"重複造輪子"** —— 這個輪子只有 50 行 Python，沒那麼大。

## 延伸閱讀

- [LangChain Documentation](https://python.langchain.com/) —— 最流行的 Framework
- [CrewAI Documentation](https://docs.crewai.com/) —— 多 Agent 編排
- [AutoGen](https://microsoft.github.io/autogen/) —— 微軟的多 Agent 框架
- [你的第一個 Harness](/guide/your-first-harness) —— 自己動手寫原生版本
