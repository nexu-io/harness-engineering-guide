# 术语表

Harness 工程指南中使用的关键术语，用通俗语言定义。

---

**Harness**
包装 AI 模型并使其成为可用 Agent 的代码。它管理 Tool Loop、上下文、记忆和决策流程。没有 Harness，你只有一个聊天机器人；有了 Harness，你就有了一个 Agent。

**Runtime（运行时）**
Harness 运行的执行环境。包括操作系统、文件系统、网络访问和沙箱。Runtime 决定了 Agent 在物理层面*能做*什么——Harness 决定了它*选择*做什么。

**Framework（框架）**
用于构建 Harness 的库或 SDK。框架提供抽象（工具注册表、记忆存储、提示模板），让你不必从零开始构建。例如：LangChain、CrewAI、AutoGen。框架是工具箱；Harness 是成品。

**Context Window**
模型在单次请求中能处理的最大文本量（以 Token 计）。前沿模型通常为 128K–200K Token。Agent 在一轮中"知道"的所有内容——指令、记忆、对话历史、文件内容——都必须装进这个窗口。

**Tool Loop**
Agent 的核心执行循环：调用模型 → 模型请求工具 → 执行工具 → 将结果回传 → 重复。循环持续到模型生成不包含工具调用的最终文本响应为止。每个 Harness 都实现了某种版本的 Tool Loop。

**Skill**
扩展 Agent 能力的自包含功能包。由 SKILL.md 指令文件加上支撑代码或模板组成。Skill 是"薄 Harness、厚 Skill"模式中"厚"的部分——它们编码领域知识，使 Harness 保持通用。

**AGENTS.md**
定义 Agent 在工作区中行为方式的配置文件。包含指令、约定、工具使用指南和工作流定义。Harness 在每次会话开始时读取。在支持该约定的 Harness 实现之间可迁移。

**MEMORY.md**
基于文件的长期记忆存储。包含 Agent 跨会话所需的精选知识：用户偏好、项目详情、经验教训。与闭源记忆系统不同，MEMORY.md 可人工阅读、编辑和迁移。

**ReAct（推理 + 行动）**
一种提示模式，模型在思考（"我应该搜索 X"）和行动（调用工具）之间交替进行。产生思考 → 行动 → 观察的循环。大多数现代 Agent Harness 实现了 ReAct 的变体，通常通过 Tool Loop 隐式实现。

**Chain-of-Thought（思维链，CoT）**
一种提示技术，鼓励模型在给出最终答案前"逐步思考"。扩展思考（如 Claude 的 thinking 模式）是模型层面对此的实现——模型在响应前生成内部推理 Token。

**HaaS（Harness 即服务）**
将 Agent Harness 部署为托管云服务的模式。API 网关将请求路由到会话管理器，后者分发给运行在沙箱环境中的 Harness Worker。实现了多租户 Agent 托管，具备会话隔离和资源限制。

**Thin Harness（薄 Harness）**
一种设计理念：Harness 本身保持最小化——只包含 Tool Loop、上下文管理和会话编排——而领域特定逻辑放在 Skill 中。Harness 是通用引擎；Skill 提供专业能力。与单体 Agent 架构相对。

**Thick Skills（厚 Skill）**
"薄 Harness"的对应面。Skill 包含特定任务的详细指令、示例和工作流。一个用于邮件的厚 Skill 可能包含模板、语气指南和平台特定的格式规则。Skill 是领域知识的载体。

**Multi-Agent（多 Agent）**
多个 AI Agent 协作完成任务的架构。Agent 可能有不同角色（研究员、写作者、审阅者）、不同模型或不同工具集。需要编排——决定哪个 Agent 做什么，以及它们如何通信。

**Sub-Agent（子 Agent）**
由另一个 Agent 生成来处理特定子任务的 Agent。父 Agent 委派工作，并在子 Agent 完成后接收结果。子 Agent 有独立的会话，但可以共享记忆或工作区访问。是分解复杂任务的关键模式。

**Sandbox（沙箱）**
安全运行 Agent 工具调用的隔离执行环境。通常是具有受限文件系统、网络和进程访问权限的容器或虚拟机。防止 Agent 意外（或恶意）影响宿主系统。对代码执行工具至关重要。

**Context Compression（上下文压缩）**
在固定 Context Window 中装入更多信息的技术。包括摘要旧消息、移除冗余内容、截断大型工具输出、选择性加载相关文件。在对话历史超出 Context Window 限制时至关重要。

**Token Budget（Token 预算）**
将 Context Window 分配给不同用途的策略：系统提示、记忆、对话历史、工具结果和模型输出。良好的 Token 预算确保最重要的信息获得优先权。例如：20% 系统提示、15% 记忆、50% 历史、15% 响应。

**Session（会话）**
用户与 Agent 之间的一次连续交互。会话有开始（用户发送第一条消息）、中间（包含工具调用的来回交互）和结束（用户离开或会话超时）。会话状态包括对话历史、活跃工具和累积的上下文。

**Checkpoint（检查点）**
在会话特定时刻保存的 Agent 状态快照。包括对话历史、工具状态和中间结果。使得崩溃或暂停后可以恢复而无需从零重来。对于中途失败代价高昂的长时间运行任务至关重要。

**MCP（Model Context Protocol）**
连接 AI 模型与外部工具和数据源的开放协议。定义了标准接口，使工具（MCP 服务器）可以被任何兼容的 Harness（MCP 客户端）使用。旨在解决 N×M 集成问题——不再需要每个 Harness 与每个工具分别集成，双方都说 MCP。

**Eval（评估）**
根据定义的标准衡量 Agent 性能的过程。包括行为测试（Agent 是否调用了正确的工具？）、结果测试（结果是否正确？）和经济测试（花了多少钱？）。Eval 之于 Agent 就像单元测试之于代码——在生产环境中不可省略。

**Trace（追踪）**
Agent 会话的完整记录：每条发送的消息、每次调用的工具、每个接收的结果和最终输出。Trace 用于调试（出了什么问题？）、评估（Agent 表现如何？）和回归测试（新版本是否变差了？）。相当于 Agent 版的日志文件。

---

*返回 [什么是 Harness？ →](what-is-harness.md)*
