# Core Concepts

This chapter covers the five pillars of Harness Engineering. Each one is a deep topic on its own — we introduce the fundamentals here and link to deeper dives.

## Context Management

Context is the information fed to the model on each turn. Managing it well is the difference between an agent that feels magical and one that feels broken.

### The Context Window Problem

Every model has a finite context window (8K–2M tokens). Your harness must decide:
- **What goes in** — system prompt, conversation history, file contents, tool results
- **What gets dropped** — older messages, redundant information, resolved threads
- **In what order** — priority ranking of context sources

### Strategies

| Strategy | How It Works | Trade-off |
|----------|-------------|-----------|
| **Sliding window** | Keep last N messages | Loses early context |
| **Summarization** | Compress old context into summaries | Lossy but compact |
| **Retrieval (RAG)** | Fetch relevant context on demand | Requires indexing |
| **Hierarchical** | Multi-level: hot (recent) + warm (session) + cold (archive) | Complex but effective |

### How Context Flows Through a Harness

```mermaid
graph TD
    A[System Prompt] --> E[Context Assembler]
    B[Conversation History] --> E
    C[Retrieved Documents / RAG] --> E
    D[Tool Results] --> E
    E --> F{Fits Token Limit?}
    F -->|Yes| G[Send to LLM]
    F -->|No| H[Prioritize & Trim]
    H --> E
```

### Key Design Decisions
- How do you handle context overflow?
- Do you summarize automatically or let the model decide?
- How do you prioritize competing context sources?

---

## Memory & Persistence

Memory is context that survives across sessions. Without it, your agent wakes up with amnesia every time.

### Memory Layers

```
┌─ Working Memory ──────── Current conversation context
├─ Session Memory ──────── Survives within a session (temp files, state)
├─ Long-term Memory ────── Persists across sessions (MEMORY.md, vector DB)
└─ Shared Memory ──────── Accessible across agents (team knowledge base)
```

### The AGENTS.md / MEMORY.md Pattern

A file-based memory pattern popularized by OpenClaw and Claude Code:

- **AGENTS.md** — Agent configuration, personality, rules (read every session)
- **MEMORY.md** — Curated long-term memories (read + updated by agent)
- **memory/YYYY-MM-DD.md** — Daily raw logs (append-only)

This pattern is simple, portable, and version-controlled — the agent's memory lives in plain text files that humans can read and edit.

### Memory Ownership

> Who owns the agent's memory?

This is one of the most consequential questions in Harness Engineering:
- **User-owned memory** (open harness): stored locally, exportable, portable
- **Platform-owned memory** (closed harness): stored on vendor servers, locked in

---

## Skill / Tool Orchestration

Skills (also called tools, plugins, or capabilities) extend what an agent can do beyond text generation.

### Skill Architecture

```
Agent receives task
  → Harness determines which skills are needed
    → Skills are invoked (API calls, file ops, code execution)
      → Results are fed back to the agent
        → Agent synthesizes and responds
```

### Design Patterns

| Pattern | Description | Example |
|---------|-------------|---------|
| **Thin harness + thick skills** | Harness is minimal; skills carry complexity | OpenClaw skills |
| **Thick harness + thin tools** | Harness has built-in logic; tools are simple | Claude Code built-in tools |
| **Plugin marketplace** | Community-contributed skills | OpenClaw Skill Gallery |

### Key Considerations
- How does the agent discover available skills?
- How are permissions managed per skill?
- How do you handle skill failures gracefully?
- Can skills be composed (skill A calls skill B)?

---

## Agent Lifecycle

An agent goes through distinct phases. The harness manages transitions between them.

```
Boot → Initialize → Active → [Paused] → Shutdown
  │        │          │          │
  │        │          │          └── Heartbeat / wake
  │        │          └── Handle messages, run tasks
  │        └── Load memory, read config, check permissions
  └── Start runtime, validate environment
```

### Key Lifecycle Events
- **Cold start** — First boot, no prior state
- **Warm start** — Resuming with existing memory
- **Heartbeat** — Periodic check-in (proactive tasks)
- **Graceful shutdown** — Save state, flush memory
- **Crash recovery** — Restore from last known good state

---

## Multi-Agent Coordination

When multiple agents work together, the harness becomes an orchestrator.

### Coordination Patterns

| Pattern | Description | When to Use |
|---------|-------------|-------------|
| **Hub-and-spoke** | One coordinator delegates to specialist agents | Task decomposition |
| **Peer-to-peer** | Agents communicate directly | Collaborative editing |
| **Pipeline** | Output of agent A feeds into agent B | Sequential processing |
| **Swarm** | Many agents work independently on sub-tasks | Parallel exploration |

### Hub-and-Spoke Example

```mermaid
graph TD
    User[User Request] --> Coordinator[Coordinator Agent]
    Coordinator --> A[Research Agent]
    Coordinator --> B[Code Agent]
    Coordinator --> C[Review Agent]
    A -->|findings| Coordinator
    B -->|code| Coordinator
    C -->|feedback| B
    Coordinator --> User
```

### Challenges
- **State sharing** — How do agents share context?
- **Conflict resolution** — What if two agents edit the same file?
- **Resource management** — Token budgets, API rate limits
- **Observability** — Who did what, when, and why?

## The Fundamental Equation

As Huang Jia puts it simply: **Agent = Model + Harness**. The model provides the brain; the harness provides the body.

### Harness Core Components (Huang Jia's Framework)

A useful decomposition into six modules:

1. **Agentic Loop** — The heart. Accept input → execute tools → iterate → return result. Directly descended from the ReAct (Reasoning + Acting) pattern.
2. **Tool System** — The hands. Extends LLM capabilities beyond language into real-world actions.
3. **Memory & Context** — The long-term brain. Provides continuity across sessions. (See Memory chapter.)
4. **Guardrails** — The reins. Allow / Deny / Ask permission controls.
5. **Hooks** — The guards. Pre/post-execution checks (e.g., preventing secret leaks).
6. **Session** — The continuity layer. Runtime state management across interactions.

### Five Production Problems a Harness Solves

When moving from prototype to production, agents hit predictable walls. A well-designed harness addresses each:

| Problem | Symptom | Harness Solution |
|---------|---------|-----------------|
| Infinite loops | Agent keeps calling tools without converging | Loop budgets, step limits, convergence detection |
| Context explosion | Token usage balloons, quality degrades | Context compaction, summarization, priority queues |
| Permission loss-of-control | Agent executes dangerous operations | Guardrails (Allow/Deny/Ask), sandbox isolation |
| Quality unpredictability | Output varies wildly between runs | Quality gates, self-review loops, structured output |
| Cost opacity | Bills spike without visibility | Token accounting, cost caps, usage dashboards |

---

*Next: [Architecture Patterns →](patterns.md)*
