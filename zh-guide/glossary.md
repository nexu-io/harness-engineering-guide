---
author: Nexu
---

# 术语表

Harness Engineering指南中使用的核心术语，用直白语言定义。

---

**Harness**
包裹 AI 模型并将其变成可用 Agent 的代码。它管理 Tool 循环、Context、Memory 和决策流程。没有 Harness，你有的是聊天机器人；有了 Harness，你有的是 Agent。

**Runtime**
Harness 运行的执行环境。包括操作系统、文件系统、网络访问和 Sandbox。Runtime 决定了 Agent 在物理上*能做什么*——Harness 决定了它*选择做什么*。

**Framework**
用于构建 Harness 的库或 SDK。Framework 提供抽象（Tool 注册表、Memory 存储、Prompt 模板），让你不用从零开始。例如：LangChain、CrewAI、AutoGen。Framework 是工具包；Harness 是成品。

**Context Window**
模型在单次请求中能处理的最大文本量（以 Token 计量）。前沿模型通常为 128K–200K Token。Agent 在一轮中"知道"的所有东西——指令、Memory、对话历史、文件内容——都必须装进这个窗口。

**Tool Loop**
Agent 的核心执行循环：调用模型 → 模型请求 Tool → 执行 Tool → 把结果喂回去 → 重复。循环持续到模型产出最终文本回复且不再调用 Tool。每个 Harness 都实现了这个循环的某个变体。

**Skill**
一个自包含的能力包，扩展 Agent 的能力。由 SKILL.md 指令文件加任何支持代码或模板组成。Skill 是"薄 Harness、厚 Skill"模式中"厚"的部分——它们编码了领域知识，让 Harness 保持通用。

**AGENTS.md**
定义 Agent 在某个工作区中应如何行为的配置文件。包含指令、惯例、Tool 使用指南和工作流定义。Harness 在每个 Session 开始时读取它。在支持该惯例的 Harness 实现之间可移植。

**MEMORY.md**
基于文件的长期 Memory 存储。包含 Agent 跨 Session 需要的策展知识：用户偏好、项目细节、经验教训。与闭源 Memory 系统不同，MEMORY.md 是人类可读、可编辑、可移植的。

**ReAct (Reasoning + Acting)**
一种 Prompt 模式，模型在思考（"我应该搜索 X"）和行动（调用 Tool）之间交替。产生 Thought → Action → Observation 循环。大多数现代 Agent Harness 实现了 ReAct 的变体，通常通过 Tool Loop 隐式实现。

**Chain-of-Thought (CoT)**
一种 Prompt 技术，鼓励模型在产出最终答案前"逐步思考"。扩展思维（如 Claude 的 thinking 模式）是这种技术在模型层面的实现——模型在回复前生成内部推理 Token。

**HaaS (Harness as a Service)**
将 Agent Harness 部署为托管云服务的模式。API 网关将请求路由到 Session 管理器，Session 管理器分发到运行在 Sandbox 环境中的 Harness Worker。实现多租户 Agent 托管，具备 Session 隔离和资源限制。

**薄 Harness**
一种设计哲学，Harness 本身最小化——只有 Tool Loop、Context 管理和 Session 编排——而领域特定逻辑放在 Skill 中。Harness 是通用引擎；Skill 提供专业知识。与单体式 Agent 架构相对。

**厚 Skill**
"薄 Harness"的对应面。Skill 包含特定任务的详细指令、示例和工作流。一个用于邮件的厚 Skill 可能包含模板、语气指南和平台特定的格式规则。Skill 是领域知识的所在地。

**多 Agent**
多个 AI Agent 协作完成任务的架构。Agent 可能有不同角色（调研员、写手、审阅者）、不同模型或不同 Tool 集。需要编排——决定哪个 Agent 做什么，以及它们如何通信。

**Sub-Agent**
由另一个 Agent spawn 来处理特定子任务的 Agent。父 Agent 委派工作，在 Sub-Agent 完成后接收结果。Sub-Agent 有隔离的 Session，但可能共享 Memory 或工作区访问。分解复杂任务的核心模式。

**Sandbox**
用于安全运行 Agent Tool 调用的隔离执行环境。通常是受限文件系统、网络和进程访问的容器或虚拟机。防止 Agent 意外（或恶意）影响宿主系统。对代码执行 Tool 来说是必需的。

**Context 压缩**
将更多信息装进固定 Context Window 的技术。包括摘要旧消息、移除冗余内容、截断大的 Tool 输出、以及选择性地只加载相关文件。当对话历史超过 Context 限制时至关重要。

**Token 预算**
将 Context Window 分配到不同用途的策略：System Prompt、Memory、对话历史、Tool 结果和模型输出。设计良好的 Token 预算确保最重要的信息获得优先权。例如：20% 给 System Prompt、15% 给 Memory、50% 给历史、15% 给回复。

**Session**
用户和 Agent 之间的一次持续交互。Session 有开始（用户发送第一条消息）、中间（来回的 Tool 调用）和结束（用户离开或 Session 超时）。Session 状态包括对话历史、活跃 Tool 和任何积累的 Context。

**Checkpoint**
在 Session 中某个特定时刻保存的 Agent 状态快照。包括对话历史、Tool 状态和任何中间结果。可以在崩溃或暂停后恢复而无需从零开始。对于中途失败代价高昂的长时间运行任务至关重要。

**MCP (Model Context Protocol)**
连接 AI 模型与外部 Tool 和数据源的开放协议。定义了标准接口，使 Tool（MCP Server）可被任何兼容的 Harness（MCP Client）使用。旨在解决 N×M 集成问题——不需要每个 Harness 都与每个 Tool 对接，双方都说 MCP。

**Eval（评估）**
根据定义标准衡量 Agent 性能的过程。包括行为测试（Agent 是否调用了正确的 Tool？）、结果测试（结果是否正确？）和经济测试（花了多少钱？）。Eval 之于 Agent 就像单元测试之于代码——在生产中不是可选项。

**Trace**
Agent Session 的完整记录：每条发送的消息、每次 Tool 调用、每个接收的结果和最终输出。Trace 用于调试（哪里出了问题？）、评估（Agent 表现如何？）和回归测试（新版本是否更差了？）。Agent 世界的日志文件。

---

*返回 [什么是 Harness？ →](what-is-harness.md)*
