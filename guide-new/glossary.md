# Glossary

Key terms used throughout the Harness Engineering guide, defined in plain language.

---

**Harness**
The code that wraps an AI model and turns it into a functional agent. It manages the tool loop, context, memory, and decision flow. Without a harness, you have a chatbot; with one, you have an agent.

**Runtime**
The execution environment where a harness runs. Includes the operating system, filesystem, network access, and sandbox. The runtime determines what the agent can physically *do* — the harness determines what it *chooses* to do.

**Framework**
A library or SDK for building harnesses. Frameworks provide abstractions (tool registries, memory stores, prompt templates) so you don't build from scratch. Examples: LangChain, CrewAI, AutoGen. A framework is a toolkit; a harness is the finished product.

**Context Window**
The maximum amount of text (measured in tokens) a model can process in a single request. Typically 128K–200K tokens for frontier models. Everything the agent "knows" during a turn — instructions, memory, conversation history, file contents — must fit in this window.

**Tool Loop**
The core execution cycle of an agent: call the model → model requests a tool → execute the tool → feed the result back → repeat. The loop continues until the model produces a final text response with no tool calls. Every harness implements some version of this loop.

**Skill**
A self-contained capability package that extends an agent's abilities. Consists of a SKILL.md instruction file plus any supporting code or templates. Skills are the "thick" part of the "thin harness, thick skills" pattern — they encode domain knowledge so the harness stays generic.

**AGENTS.md**
A configuration file that defines how an agent should behave within a workspace. Contains instructions, conventions, tool usage guidelines, and workflow definitions. Read by the harness at the start of each session. Portable across harness implementations that support the convention.

**MEMORY.md**
A file-based long-term memory store. Contains curated knowledge the agent needs across sessions: user preferences, project details, lessons learned. Unlike proprietary memory systems, MEMORY.md is human-readable, editable, and portable.

**ReAct (Reasoning + Acting)**
A prompting pattern where the model alternates between thinking ("I should search for X") and acting (calling a tool). Produces a Thought → Action → Observation loop. Most modern agent harnesses implement a variant of ReAct, often implicitly through the tool loop.

**Chain-of-Thought (CoT)**
A prompting technique where the model is encouraged to "think step by step" before producing a final answer. Extended thinking (as in Claude's thinking mode) is a model-level implementation of this — the model generates internal reasoning tokens before responding.

**HaaS (Harness as a Service)**
The pattern of deploying agent harnesses as managed cloud services. An API gateway routes requests to session managers, which dispatch to harness workers running in sandboxed environments. Enables multi-tenant agent hosting with session isolation and resource limits.

**Thin Harness**
A design philosophy where the harness itself is minimal — just the tool loop, context management, and session orchestration — while domain-specific logic lives in skills. The harness is a generic engine; skills provide the expertise. Opposite of monolithic agent architectures.

**Thick Skills**
The counterpart to "thin harness." Skills contain the detailed instructions, examples, and workflows for specific tasks. A thick skill for email might include templates, tone guidelines, and platform-specific formatting rules. The skill is where domain knowledge lives.

**Multi-Agent**
An architecture where multiple AI agents collaborate on a task. Agents may have different roles (researcher, writer, reviewer), different models, or different tool sets. Requires orchestration — deciding which agent does what, and how they communicate.

**Sub-Agent**
An agent spawned by another agent to handle a specific subtask. The parent agent delegates work and receives results when the sub-agent completes. Sub-agents have isolated sessions but may share memory or workspace access. Key pattern for decomposing complex tasks.

**Sandbox**
An isolated execution environment for running agent tool calls safely. Typically a container or VM with restricted filesystem, network, and process access. Prevents agents from accidentally (or maliciously) affecting the host system. Essential for code execution tools.

**Context Compression**
Techniques for fitting more information into a fixed context window. Includes summarizing old messages, removing redundant content, truncating large tool outputs, and selectively loading only relevant files. Critical when the conversation history exceeds the context limit.

**Token Budget**
The allocation strategy for distributing the context window across different purposes: system prompt, memory, conversation history, tool results, and model output. A well-designed token budget ensures the most important information gets priority. Example: reserve 20% for system prompt, 15% for memory, 50% for history, 15% for response.

**Session**
A single continuous interaction between a user and an agent. Sessions have a start (user sends first message), a middle (back-and-forth with tool calls), and an end (user disengages or session times out). Session state includes conversation history, active tools, and any accumulated context.

**Checkpoint**
A saved snapshot of agent state at a specific point in a session. Includes conversation history, tool states, and any intermediate results. Enables resuming after crashes or pauses without restarting from zero. Critical for long-running tasks where failure mid-stream is costly.

**MCP (Model Context Protocol)**
An open protocol for connecting AI models to external tools and data sources. Defines a standard interface so tools (MCP servers) can be used by any compatible harness (MCP client). Aims to solve the N×M integration problem — instead of every harness integrating with every tool, both sides speak MCP.

**Eval (Evaluation)**
The process of measuring agent performance against defined criteria. Includes behavioral tests (did the agent call the right tools?), outcome tests (was the result correct?), and economic tests (what did it cost?). Evals are to agents what unit tests are to code — not optional in production.

**Trace**
A complete recording of an agent session: every message sent, every tool called, every result received, and the final output. Traces are used for debugging (what went wrong?), evaluation (how did the agent perform?), and regression testing (is the new version worse?). The agent equivalent of a log file.

---

*Back to [What is a Harness? →](what-is-harness.md)*
