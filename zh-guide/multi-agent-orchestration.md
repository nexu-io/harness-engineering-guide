---
author: Nexu
---

# 多 Agent 编排

> **Core Insight:** 单个 Agent 会遇到硬性限制——Context Window 大小、领域专业化、串行执行。多 Agent 编排将工作分配给多个 Agent，每个 Agent 拥有独立的 Context 和 Tool，通过借鉴分布式系统的模式进行协调。

[Sub-Agent](sub-agent.md) 一文介绍了最简单的情况：一个主 Agent 生成多个 Worker 执行并行任务。本文更进一步——探讨多个 Agent 协作、专业化和规模化的编排模式。

## 为什么需要多 Agent？

单个 Agent 运行单个 Agentic Loop 是默认做法，对大多数任务都够用。但三面墙最终会迫使你突破它：

### 1. Context Window 限制

即使有 200K Token 的窗口，复杂项目也可能耗尽可用 Context。一次涉及 80 个文件的代码重构、一个需要消化 40 个文档的调研任务、一条不断积累 Tool 输出的多步流水线——都可能溢出单个窗口。当 Context 被填满，Model 会开始遗忘早期指令，输出质量下降。

多 Agent 分割工作。每个 Agent 获得一个全新的 Context Window，专注于问题的一个切片。

### 2. 专业化

一个通用 Agent 同时写代码、审 PR、生成营销文案、做数据分析——每件事都做得平庸。当 Agent 的 System Prompt、Tool 和 Context 针对特定领域调优时，表现会好得多。一个加载了 Lint 工具和风格指南的 "Code Review Agent" 比一个碰巧也能调用 Linter 的通用 Agent 产出更好的审查结果。

### 3. 并行性

单个 Agent 是串行的。它调用一个 Tool，等结果，推理，再调下一个。当你有五个独立任务——为五个模块写测试、调研五个竞品、翻译成五种语言——单个 Agent 逐个处理，五个 Agent 同时处理。

## 编排模式

四种模式覆盖了绝大多数多 Agent 架构。它们并非互斥——生产系统经常组合使用。

### Sequential Pipeline（顺序流水线）

Agent A 完成工作，将输出传给 Agent B，再传给 Agent C。每个 Agent 对结果进行转换或增强。

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Ingest  │────►│ Analyze │────►│  Draft  │────►│ Review  │
│  Agent  │     │  Agent  │     │  Agent  │     │  Agent  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

**适用场景：** 具有自然阶段的任务，每个阶段需要不同的专业知识或工具。例如：抓取数据 → 清洗分析 → 生成报告 → 校对审查。

**关键特性：** 每个 Agent 只看到上一阶段的输出，而非全部累积的 Context。这是一个特性——它强制阶段之间有清晰的接口，防止 Context 膨胀。

### Fan-Out / Fan-In（扇出/扇入）

一个协调者将相同（或相关）的任务并行分发给 N 个 Agent，然后收集合并所有结果。

```
                    ┌───────────┐
               ┌───►│ Worker A  │───┐
               │    └───────────┘   │
┌──────────┐   │    ┌───────────┐   │    ┌──────────┐
│Dispatcher│───┼───►│ Worker B  │───┼───►│  Merger  │
└──────────┘   │    └───────────┘   │    └──────────┘
               │    ┌───────────┐   │
               └───►│ Worker C  │───┘
                    └───────────┘
```

**适用场景：** 可分解为独立、可并行子任务的工作。例如：将文档翻译成 8 种语言、为 10 个模块写单元测试、调研 5 个竞品。

**关键特性：** Worker 之间零交互。Merger Agent（或 Dispatcher 本身）负责合并结果和解决冲突。

### Supervisor（监督者）

一个监督 Agent 做所有委派决策。它观察当前状态，决定下一步调用哪个专家，读取结果，再决定下一步。与流水线不同，Supervisor 可以循环、重新委派、或根据中间结果多次调用同一个专家。

```
                 ┌─────────────────┐
                 │   Supervisor    │
                 │ (decides, loops)│
                 └───┬───┬───┬────┘
                     │   │   │
            ┌────────┘   │   └────────┐
            ▼            ▼            ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │ Code     │ │ Research │ │ Review   │
      │ Agent    │ │ Agent    │ │ Agent    │
      └──────────┘ └──────────┘ └──────────┘
```

**适用场景：** 下一步取决于上一步结果、且决定调用哪个专家需要判断力的任务。例如：一个编码 Supervisor 将实现委派给 Code Agent，将结果送给 Review Agent，如果 Review 发现问题就循环回 Code Agent。

**关键特性：** Supervisor 维护整体计划和状态。专家是无状态的——接收任务，返回结果，然后遗忘。这保持了专家的 Context Window 干净。

### Peer-to-Peer（对等通信）

Agent 之间直接通信，没有中央协调者。每个 Agent 有自己的收件箱，可以向任何其他 Agent 发送消息。

**适用场景：** 模拟、辩论式推理（Agent A 正方、Agent B 反方、Agent C 裁判），或 Agent 代表不同利益方的系统。

**关键特性：** 没有单一的协调点。这使 Peer-to-Peer 成为最灵活的模式，但也最难调试。没有 Supervisor，很难保证终止或追踪进度。

**警告：** 在生产 Harness 系统中，Peer-to-Peer 很少是正确选择。缺乏中央控制使错误处理、超时执行和结果收集变得显著更难。除非有特定原因需要去中心化通信，否则优先使用 Supervisor 或 Fan-Out/Fan-In。

## 在 Harness 中实现

Harness（将 LLM 包装成可工作 Agent 的宿主程序——参见[什么是 Harness](what-is-harness.md)）通过四个机制实现多 Agent 编排：Sub-Agent 生成、Context 隔离、父读子结果通信、超时处理。

### Sub-Agent 生成

基础原语是生成一个隔离的 Agent Session。在 OpenClaw 中，这是 `sessions_spawn` 模式：

```
Parent Agent
    │
    ├── sessions_spawn(label="research", task="调研竞品定价")
    │       → 创建隔离 Session，拥有独立的 Context、Tool、Model
    │
    ├── sessions_spawn(label="writer", task="撰写定价页面")
    │       → 另一个隔离 Session
    │
    └── 等待两者完成（push-based）
```

每个生成的 Session 是一个完全独立的 Agent，拥有自己的：
- Context Window（不与父 Agent 共享 Token 预算）
- System Prompt（可为每个 Sub-Agent 定制）
- Tool 集合（可限制或扩展）
- Model（可为简单任务使用更便宜的 Model）

父 Agent 指定 Label、Task 描述，以及可选的 Model 或 Thinking 级别。Harness 处理进程生命周期、超时和结果交付。

### Context 隔离

Context 隔离不是便利功能——它是核心设计约束。每个 Sub-Agent 的 Context Window 完全独立：

```
┌──────────────────────┐    ┌──────────────────────┐
│   Parent Context     │    │  Sub-Agent Context    │
│                      │    │                       │
│ [system prompt]      │    │ [system prompt]       │
│ [user conversation]  │    │ [task instruction]    │
│ [tool results A,B,C] │    │ [tool results X,Y]   │
│ [128K tokens used]   │    │ [12K tokens used]     │
│                      │    │                       │
│  无法看到 ──────────►│ X  │◄────── 无法看到       │
│  sub-agent context   │    │  parent context       │
└──────────────────────┘    └──────────────────────┘
```

**为什么重要：** 一个已累积 128K Token 对话的父 Agent 可以生成一个从干净的 200K Token 预算开始的 Sub-Agent。Sub-Agent 不被无关历史拖累——它只看到 Task 指令和父 Agent 显式传递的 Context。

推论：Sub-Agent 无法读取父 Agent 的变量、Tool 结果或对话历史。所有信息传递都是显式的——父 Agent 将相关 Context 包含在 Task 指令字符串中。

### 通信：父读子结果

Harness 中的多 Agent 通信遵循严格模式：**父 Agent 读取子结果；子 Agent 不向父 Agent 的内存写入。**

```
1. 父 Agent 用 Task 指令生成子 Agent（单向写入）
2. 子 Agent 独立执行
3. 子 Agent 完成 → Harness 将结果推送给父 Agent（push-based）
4. 父 Agent 在下一轮 Agentic Loop 迭代中读取结果
```

没有共享内存，没有消息总线，没有子 Agent 修改父 Agent 状态的回调机制。这个约束极大简化了系统推理——父 Agent 始终是整体进度的唯一真相来源。

在 OpenClaw 中，完成是 **push-based** 的：当 Sub-Agent 完成时，结果自动在父 Session 中公布。父 Agent 不需要轮询。这消除了最常见的多 Agent Bug：紧密轮询循环浪费 Token 检查"完成了吗？"

### 超时和错误处理

Sub-Agent 可能挂起、崩溃或产出垃圾。生产 Harness 必须处理所有三种情况：

```python
@dataclass
class SubAgentConfig:
    task: str
    label: str
    timeout_seconds: int = 300       # 5 分钟后终止
    max_retries: int = 1             # 失败重试一次
    fallback: str | None = None      # 多次失败后的备选任务

class SubAgentManager:
    def spawn_with_safeguards(self, config: SubAgentConfig) -> str:
        for attempt in range(config.max_retries + 1):
            try:
                result = self.spawn(
                    task=config.task,
                    label=config.label,
                    timeout=config.timeout_seconds,
                )
                if self.validate_result(result):
                    return result
                config.task += "\n\n上次尝试输出无效。请更精确。"
            except TimeoutError:
                if attempt == config.max_retries and config.fallback:
                    return self.spawn(task=config.fallback, label=f"{config.label}-fallback")
                continue
            except Exception as e:
                log.error(f"Sub-agent {config.label} failed: {e}")
                if attempt == config.max_retries:
                    return f"[FAILED] {config.label}: {e}"
        return f"[FAILED] {config.label}: max retries exceeded"
```

**关键原则：**
- **始终设置超时。** 没有超时的 Sub-Agent 是等待发生的资源泄漏。
- **验证结果。** 输出为空或包含错误信息的 Sub-Agent 不算成功。
- **优雅降级。** 当 Sub-Agent 失败时，父 Agent 应该用部分结果继续，而非完全中止——除非失败的任务是关键的。
- **限制深度。** Sub-Agent 生成自己的 Sub-Agent 会造成指数级复杂度。将递归限制在 1-2 层。

## 实际案例

三个开源项目展示了不同规模的多 Agent 编排。

### Multica（14K+ Star）

**模式：** Supervisor + Fan-Out / Fan-In

Multica 将 Agent 视为项目看板上的队友。人类（或主 Agent）将 GitHub Issue 分配给 Agent Worker，每个独立运行。系统在看板视图上追踪进度，显示哪个 Agent 在做什么、什么在审查中、什么已合并。

关键设计决策：
- **多 Runtime 支持** —— Agent 可以运行在 Claude Code、Codex、OpenClaw 或 OpenCode 上。编排器不关心 Worker 使用哪个 Runtime，只关心它产出预期输出。
- **复合 Skill** —— Agent 可以组合多个 Skill（例如，一个 "fix-and-test" Agent 同时加载编码 Skill 和测试 Skill）。
- **Issue 驱动委派** —— 工作围绕 GitHub Issue 组织，而非抽象的"任务"。这给每个 Agent 一个具体、可追踪的工作单元，有明确的验收标准。

### Paseo（3.6K+ Star）

**模式：** Supervisor + 跨设备执行

Paseo 提供统一界面与多个 Agent 交互。你发出命令，Paseo 将其路由到合适的 Agent——或扇出到多个 Agent 并行执行。

关键设计决策：
- **一个界面，多个 Agent** —— 用户不需要知道哪个 Agent 处理哪个任务。Paseo 的路由层决定。
- **跨设备** —— 同样的编排在手机、桌面应用或 CLI 上都能工作。Agent 在服务端运行；界面只是一个薄客户端。
- **默认并行** —— 当任务独立时，Paseo 自动在可用 Agent 之间并行化，而非排队。

### OpenClaw

**模式：** 原生 Sub-Agent 生成 + Push-based 完成

OpenClaw 将多 Agent 编排实现为一等 Harness 原语，通过 `sessions_spawn`。父 Agent 用一个 Tool 调用生成 Sub-Agent，指定 Label、Task 和可选的 Model/Thinking 配置。

关键设计决策：
- **Push-based 完成** —— 当 Sub-Agent 完成时，其结果自动在父 Session 中公布。无需轮询。
- **Label 追踪** —— 每个 Sub-Agent 获得人类可读的 Label（如 `article-research`、`code-review`）。父 Agent 可以按 Label 列出、引导或终止 Sub-Agent。
- **深度限制** —— Sub-Agent 可配置最大深度，防止失控的递归生成。
- **Context 注入** —— 父 Agent 可以向 Sub-Agent 的 Session 注入特定 Context（文件、指令、约束），而不共享完整对话历史。

## 何时不该使用多 Agent

多 Agent 编排有实际成本：延迟增加（生成开销）、Token 消耗更高（跨 Agent 重复的 System Prompt 和 Context）、调试复杂度增加。以下情况应避免使用：

### 任务适合单个 Context Window

如果一个任务只需 10K Token 的 Context 和 5 次 Tool 调用，单个 Agent 比生成 Worker 更快更可靠。多 Agent 协调的开销（生成、传递 Context、合并结果）超过了收益。

### 协调成本超过收益

需要两个 Agent 紧密来回配合的任务——Agent A 需要 Agent B 的结果才能进行下一步，反之亦然——用单个 Agent 顺序调用 Tool 更好。多 Agent 在工作*独立*时发光；在工作深度交织时受限。

### 需要严格顺序

如果步骤必须按精确顺序执行并精确交接，且没有并行机会，那么带有逐步计划的单个 Agent 更简单、更确定性。Agent 顺序流水线在每个阶段边界增加延迟但没有并行收益——仅在阶段确实受益于 Context 隔离或专业化时使用。

## 反模式

### 共享可变状态

两个 Agent 同时写入同一文件、数据库行或变量。这会产生竞态条件、覆盖工作和不确定性结果。解决方案：为每个 Agent 分配独立的资源所有权。如果两个 Agent 必须贡献到同一产出物，使用 Fan-Out/Fan-In 模式，由 Merger Agent 顺序合并它们的输出。

### 无界扇出

按输入大小比例生成 Agent 而不设上限。"将这个文档翻译成所有 50 种支持的语言" 会生成 50 个同时运行的 Agent，压垮系统。解决方案：设置 `max_workers` 限制并分批处理。

```python
# 错误：无界
for lang in all_50_languages:
    spawn_agent(task=f"Translate to {lang}")

# 正确：分批限制
BATCH_SIZE = 8
for batch in chunked(all_50_languages, BATCH_SIZE):
    results = fan_out_fan_in(
        [f"Translate to {lang}" for lang in batch],
        merge_prompt="Collect all translations.",
    )
```

### 无超时或断路器

Sub-Agent 挂起——等待限速的 API、陷入无限循环、或只是运行复杂任务——如果没有超时，会阻塞整个编排。每次 Sub-Agent 生成必须包含：
- **超时** —— 在最大时长后终止 Agent
- **断路器** —— N 次失败后停止重试
- **降级路径** —— 允许父 Agent 用部分结果继续

### 过度分解

将 30 秒的任务拆成 5 个 Sub-Agent，每个需要 15 秒的生成和返回开销。总耗时从 30 秒增加到 75 秒。多 Agent 是管理复杂度和并行性的工具——不是每个任务的默认选择。

## 选择正确的模式

| 场景 | 模式 | 原因 |
|------|------|------|
| 具有不同专业知识的阶段 | Sequential Pipeline | 每个阶段获得专业化的 Context 和 Tool |
| N 个独立的相同任务 | Fan-Out / Fan-In | 最大并行性，简单合并 |
| 需要判断下一步的复杂任务 | Supervisor | 中央决策，灵活路由 |
| 辩论或多视角分析 | Peer-to-Peer | Agent 代表不同观点 |
| 并行与顺序工作混合 | Supervisor + Fan-Out | Supervisor 决定何时并行化 |

从最简单的有效模式开始。单个 Agent 加上好的 Tool 使用能处理 80% 的任务。当你遇到[为什么需要多 Agent？](#为什么需要多-agent)中描述的限制时，选择解决特定瓶颈的最轻量编排模式。[Sub-Agent](sub-agent.md) 一文介绍了最简单的委派模式——在构建完整编排层之前先从那里开始。

## 延伸阅读

- [Sub-Agent](sub-agent.md) — 单主多从的基础委派模式
- [Agentic Loop](agentic-loop.md) — 每个 Agent 内部运行的核心执行循环
- [Context 工程](context-engineering.md) — 管理每个 Agent 的 Context Window 中放什么
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — 多 Agent 协调模式
- [OpenAI: Agents SDK — Multi-Agent](https://openai.github.io/openai-agents-python/) — Handoff 和编排原语
- [Microsoft AutoGen](https://microsoft.github.io/autogen/) — 多 Agent 对话模式框架
