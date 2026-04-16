---
author: Nexu
---

# Multi-Agent Orchestration

> **Core Insight:** A single agent hits hard limits — context window size, domain specialization, and serial execution. Multi-agent orchestration breaks work across multiple agents, each with its own context and tools, coordinated by patterns borrowed from distributed systems.

The [Sub-Agent](sub-agent.md) article covers the simplest case: one leader spawning workers for parallel tasks. This article goes further — orchestration patterns for systems where multiple agents collaborate, specialize, and scale.

## Why Multi-Agent?

A single agent running a single Agentic Loop is the default. It works well for most tasks. But three walls eventually force you beyond it:

### 1. Context Window Limits

Even with 200K-token windows, a complex project can exhaust available context. A codebase refactoring that touches 80 files, a research task that consumes 40 source documents, a multi-step pipeline that accumulates tool outputs — all of these can overflow a single window. When context fills up, the model starts forgetting earlier instructions and losing coherence.

Multi-agent splits the work. Each agent gets a fresh context window dedicated to its slice of the problem.

### 2. Specialization

A generalist agent that writes code, reviews PRs, generates marketing copy, and runs data analysis is mediocre at all of them. Agents perform better when their system prompt, tools, and context are tuned for a specific domain. A "code review agent" with linting tools and style guides loaded produces better reviews than a general-purpose agent that also happens to have access to a linter.

### 3. Parallelism

A single agent is sequential. It calls one tool, waits for the result, reasons, calls another tool. When you have five independent tasks — writing tests for five modules, researching five competitors, translating into five languages — a single agent processes them one by one. Five agents process them simultaneously.

## Orchestration Patterns

Four patterns cover the majority of multi-agent architectures. They are not mutually exclusive — production systems often combine them.

### Sequential Pipeline

Agent A completes its work, passes the output to Agent B, which passes its output to Agent C. Each agent transforms or enriches the result.

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Ingest  │────►│ Analyze │────►│  Draft  │────►│ Review  │
│  Agent  │     │  Agent  │     │  Agent  │     │  Agent  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

**When to use:** Tasks with natural stages where each stage requires different expertise or tools. Example: scrape data → clean and analyze → generate report → proofread and fact-check.

**Key property:** Each agent sees only the output of the previous stage, not the full accumulated context. This is a feature — it forces clear interfaces between stages and prevents context bloat.

### Fan-Out / Fan-In

A coordinator dispatches the same (or related) tasks to N agents in parallel, then collects and merges all results.

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

**When to use:** Tasks that decompose into independent, parallelizable sub-tasks. Example: translate a document into 8 languages, write unit tests for 10 modules, research 5 competing products.

**Key property:** Workers have zero interaction with each other. The merger agent (or the dispatcher itself) is responsible for combining results and resolving conflicts.

### Supervisor

One supervisory agent makes all delegation decisions. It observes the current state, decides which specialist to invoke next, reads the result, and decides the next step. Unlike a pipeline, the supervisor can loop, re-delegate, or invoke the same specialist multiple times based on intermediate results.

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

**When to use:** Tasks where the next step depends on the result of the previous step, and the decision of *which* specialist to call requires judgment. Example: a coding supervisor that delegates implementation to a code agent, sends the result to a review agent, and loops back to the code agent if the review finds issues.

**Key property:** The supervisor maintains the overall plan and state. Specialists are stateless — they receive a task, return a result, and forget. This keeps specialist context windows clean.

### Peer-to-Peer

Agents communicate directly with each other without a central coordinator. Each agent has its own inbox and can send messages to any other agent.

**When to use:** Simulations, debate-style reasoning (agent A argues for, agent B argues against, agent C judges), or systems where agents represent distinct stakeholders.

**Key property:** No single point of coordination. This makes peer-to-peer the most flexible pattern but also the hardest to debug. Without a supervisor, it is difficult to guarantee termination or track progress.

**Warning:** Peer-to-peer is rarely the right choice in production Harness systems. The lack of central control makes error handling, timeout enforcement, and result collection significantly harder. Prefer Supervisor or Fan-Out/Fan-In unless you have a specific reason for decentralized communication.

## Implementation in a Harness

A Harness (the host program that wraps an LLM into a working agent — see [What Is a Harness](what-is-harness.md)) implements multi-agent orchestration through four mechanisms: sub-agent spawning, context isolation, parent-reads-child communication, and timeout handling.

### Sub-Agent Spawning

The foundational primitive is spawning an isolated agent session. In OpenClaw, this is the `sessions_spawn` pattern:

```
Parent Agent
    │
    ├── sessions_spawn(label="research", task="Find competitor pricing")
    │       → creates isolated session with own context, tools, model
    │
    ├── sessions_spawn(label="writer", task="Draft the pricing page")
    │       → another isolated session
    │
    └── waits for both to complete (push-based)
```

Each spawned session is a fully independent Agent with its own:
- Context window (no shared token budget with the parent)
- System prompt (can be customized per sub-agent)
- Tool set (can be restricted or expanded)
- Model (can use a cheaper model for simpler tasks)

The parent specifies a label, a task description, and optionally a model or thinking level. The Harness handles process lifecycle, timeout, and result delivery.

### Context Isolation

Context isolation is not a convenience — it is the core design constraint. Each sub-agent's context window is completely independent:

```
┌──────────────────────┐    ┌──────────────────────┐
│   Parent Context     │    │  Sub-Agent Context    │
│                      │    │                       │
│ [system prompt]      │    │ [system prompt]       │
│ [user conversation]  │    │ [task instruction]    │
│ [tool results A,B,C] │    │ [tool results X,Y]   │
│ [128K tokens used]   │    │ [12K tokens used]     │
│                      │    │                       │
│  Cannot see ────────►│ X  │◄──── Cannot see       │
│  sub-agent context   │    │  parent context       │
└──────────────────────┘    └──────────────────────┘
```

**Why this matters:** A parent agent with 128K tokens of accumulated conversation can spawn a sub-agent that starts with a clean 200K token budget. The sub-agent isn't burdened by irrelevant history — it sees only its task instruction and whatever context the parent explicitly passes.

The corollary: sub-agents cannot read the parent's variables, tool results, or conversation history. All information transfer is explicit — the parent includes relevant context in the task instruction string.

### Communication: Parent Reads Child Results

Multi-agent communication in a Harness follows a strict pattern: **the parent reads child results; children do not write to the parent's memory.**

```
1. Parent spawns child with task instruction (one-way write)
2. Child executes independently
3. Child completes → Harness delivers result to parent (push-based)
4. Parent reads the result in its next Agentic Loop iteration
```

There is no shared memory, no message bus, no callback mechanism where a child modifies the parent's state. This constraint dramatically simplifies reasoning about the system — the parent is always the single source of truth about overall progress.

In OpenClaw, completion is **push-based**: when a sub-agent finishes, the result is automatically announced in the parent's session. The parent does not need to poll. This eliminates the most common multi-agent bug: tight polling loops that waste tokens checking "is it done yet?"

### Timeout and Error Handling

Sub-agents can hang, crash, or produce garbage. A production Harness must handle all three:

```python
@dataclass
class SubAgentConfig:
    task: str
    label: str
    timeout_seconds: int = 300       # Kill after 5 minutes
    max_retries: int = 1             # Retry once on failure
    fallback: str | None = None      # Alternative task on repeated failure

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
                # Invalid result — retry with clarified instructions
                config.task += "\n\nPrevious attempt produced invalid output. Be precise."
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

**Key principles:**
- **Always set timeouts.** A sub-agent without a timeout is a resource leak waiting to happen.
- **Validate results.** A sub-agent that "completes" with empty output or an error message is not a success.
- **Degrade gracefully.** When a sub-agent fails, the parent should continue with partial results rather than aborting entirely — unless the failed task is critical.
- **Limit depth.** Sub-agents spawning their own sub-agents creates exponential complexity. Cap recursion at 1–2 levels.

## Real-World Examples

Three open-source projects demonstrate multi-agent orchestration at different scales.

### Multica (14K+ Stars)

**Pattern:** Supervisor + Fan-Out / Fan-In

Multica treats agents as teammates on a project board. A human (or a lead agent) assigns GitHub issues to agent workers, each running independently. The system tracks progress on a Kanban-style board view, showing which agent is working on what, what's in review, and what's merged.

Key design decisions:
- **Multi-runtime support** — agents can run on Claude Code, Codex, OpenClaw, or OpenCode. The orchestrator doesn't care which runtime a worker uses, only that it produces the expected output.
- **Compound skills** — agents can combine multiple Skills (for example, a "fix-and-test" agent loads both the coding Skill and the testing Skill).
- **Issue-driven delegation** — work is organized around GitHub issues, not abstract "tasks." This gives every agent a concrete, trackable unit of work with clear acceptance criteria.

### Paseo (3.6K+ Stars)

**Pattern:** Supervisor with cross-device execution

Paseo provides a single unified interface for interacting with multiple agents. You issue a command, and Paseo routes it to the appropriate agent — or fans it out to multiple agents for parallel execution.

Key design decisions:
- **One interface, many agents** — the user doesn't need to know which agent handles which task. Paseo's routing layer decides.
- **Cross-device** — the same orchestration works from a phone, desktop app, or CLI. The agents run server-side; the interface is just a thin client.
- **Parallel by default** — when tasks are independent, Paseo automatically parallelizes across available agents rather than queuing them.

### OpenClaw

**Pattern:** Native sub-agent spawning with push-based completion

OpenClaw implements multi-agent orchestration as a first-class Harness primitive via `sessions_spawn`. The parent agent spawns sub-agents with a single tool call, specifying a label, task, and optional model/thinking configuration.

Key design decisions:
- **Push-based completion** — when a sub-agent finishes, its result is automatically announced in the parent session. No polling required. This is explicitly documented: *"Completion is push-based: it will auto-announce when done."*
- **Label-based tracking** — each sub-agent gets a human-readable label (e.g., `article-research`, `code-review`). The parent can list, steer, or kill sub-agents by label.
- **Depth limiting** — sub-agents can be configured with a maximum depth to prevent runaway recursive spawning.
- **Context injection** — the parent can inject specific context (files, instructions, constraints) into the sub-agent's session without sharing its full conversation history.

## When NOT to Use Multi-Agent

Multi-agent orchestration has real costs: increased latency (spawning overhead), higher token usage (duplicated system prompts and context across agents), and added complexity in debugging. Avoid it when:

### The task fits one context window

If a task takes 10K tokens of context and 5 tool calls, a single agent handles it faster and more reliably than spawning workers. The overhead of multi-agent coordination (spawning, passing context, merging results) exceeds the benefit.

### Coordination cost exceeds benefit

A task that requires tight back-and-forth between two agents — where Agent A needs Agent B's result before it can take its next step, and vice versa — is better handled by a single agent that makes sequential tool calls. Multi-agent shines when work is *independent*; it struggles when work is deeply interleaved.

### Strict ordering is required

If steps must execute in exact order with precise handoffs, and there is no parallelism opportunity, a single agent with a step-by-step plan is simpler and more deterministic. A sequential pipeline of agents adds latency at each stage boundary for no parallelism gain — use it only when the stages genuinely benefit from context isolation or specialization.

## Anti-Patterns

### Shared Mutable State

Two agents writing to the same file, database row, or variable simultaneously. This produces race conditions, overwritten work, and non-deterministic results. The fix: assign each agent ownership of distinct resources. If two agents must contribute to the same artifact, use the Fan-Out/Fan-In pattern where a merger agent combines their outputs sequentially.

### Unbounded Fan-Out

Spawning agents proportional to input size without a cap. "Translate this document into all 50 supported languages" spawns 50 simultaneous agents, overwhelming the system. The fix: set a `max_workers` limit and process in batches.

```python
# Bad: unbounded
for lang in all_50_languages:
    spawn_agent(task=f"Translate to {lang}")

# Good: bounded batches
BATCH_SIZE = 8
for batch in chunked(all_50_languages, BATCH_SIZE):
    results = fan_out_fan_in(
        [f"Translate to {lang}" for lang in batch],
        merge_prompt="Collect all translations.",
    )
```

### No Timeout or Circuit Breaker

A sub-agent that hangs — waiting for a rate-limited API, stuck in an infinite loop, or simply running a complex task — blocks the entire orchestration if there is no timeout. Every sub-agent spawn must include:
- A **timeout** that kills the agent after a maximum duration
- A **circuit breaker** that stops retrying after N failures
- A **fallback path** that allows the parent to continue with partial results

### Over-Decomposition

Splitting a 30-second task into 5 sub-agents, each taking 15 seconds of overhead to spawn and return results. The total wall-clock time increases from 30 seconds to 75 seconds. Multi-agent is a tool for managing complexity and parallelism — not a default for every task.

## Choosing the Right Pattern

| Situation | Pattern | Reason |
|-----------|---------|--------|
| Stages with distinct expertise | Sequential Pipeline | Each stage gets specialized context and tools |
| N independent identical tasks | Fan-Out / Fan-In | Maximum parallelism, simple merging |
| Complex task requiring judgment about next steps | Supervisor | Central decision-making, flexible routing |
| Debate or multi-perspective analysis | Peer-to-Peer | Agents represent distinct viewpoints |
| Mix of parallel and sequential work | Supervisor + Fan-Out | Supervisor decides when to parallelize |

Start with the simplest pattern that works. A single agent with good tool use handles 80% of tasks. When you hit the limits described in [Why Multi-Agent?](#why-multi-agent), reach for the lightest orchestration pattern that solves the specific bottleneck. The [Sub-Agent](sub-agent.md) article covers the simplest delegation pattern — start there before building a full orchestration layer.

## Further Reading

- [Sub-Agent](sub-agent.md) — The foundational delegation pattern for single leader, multiple workers
- [Agentic Loop](agentic-loop.md) — The core execution cycle that each agent runs internally
- [Context Engineering](context-engineering.md) — Managing what goes into each agent's context window
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Patterns for multi-agent coordination
- [OpenAI: Agents SDK — Multi-Agent](https://openai.github.io/openai-agents-python/) — Handoff and orchestration primitives
- [Microsoft AutoGen](https://microsoft.github.io/autogen/) — Framework for multi-agent conversation patterns
