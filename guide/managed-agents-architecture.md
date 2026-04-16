---
author: Nexu
---

# Managed Agents: Decoupling Brain from Hands

> **Core Insight:** A monolithic agent container — where the harness, sandbox, and session state all share one process — is a pet you can't afford to lose. Decoupling the brain (harness + LLM) from the hands (sandbox + tools) and the session (event log) turns each component into replaceable cattle and unlocks independent scaling, fault recovery, and security isolation.

## The Monolithic Problem

The simplest agent architecture puts everything in one box:

```
┌──────────────────────────────────┐
│         Single Container          │
│                                   │
│  ┌─────────┐  ┌──────────────┐   │
│  │ Harness  │  │   Sandbox    │   │
│  │ (brain)  │  │ (code exec)  │   │
│  │          │  │              │   │
│  │ Session  │  │ Credentials  │   │
│  │ state    │  │ User files   │   │
│  └─────────┘  └──────────────┘   │
│                                   │
└──────────────────────────────────┘
```

This works for prototypes. For production, it fails in three predictable ways.

### Failure 1: The Pet Problem

In the [pets-vs-cattle](https://cloudscaling.com/blog/cloud-computing/the-history-of-pets-vs-cattle/) analogy, a pet is a named, hand-tended server you can't afford to lose. Cattle are interchangeable — when one dies, you replace it.

A monolithic agent container is a pet. If the container crashes, the session is lost. If it becomes unresponsive, you have to nurse it back to health. You can't just kill it and start a new one because the session state — the full history of what the agent has done — lives inside.

### Failure 2: The Debugging Blind Spot

When a monolithic container hangs, your only window is the external event stream. But a harness bug, a dropped packet, and a crashed container all look the same from outside. To diagnose the real cause, an engineer needs shell access inside the container — but that container also holds user data and credentials. Debugging becomes a security incident.

### Failure 3: The Security Boundary

Untrusted code that the agent generates runs in the same container as credentials. A prompt injection only needs to convince the agent to read its own environment variables. Once an attacker has those tokens, they can spawn unrestricted sessions. Narrow scoping helps, but it encodes assumptions about what the model can't do with limited tokens — and models keep getting smarter.

## The Three-Layer Architecture

The fix is to decompose the monolith into three independent layers, each with its own lifecycle:

```
┌─────────────────────────────────────────────────────────┐
│                    Orchestration Layer                    │
│                                                          │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │    Brain      │  │ Session  │  │      Hands        │  │
│  │  (Harness +   │  │ (Event   │  │  (Sandbox A)      │  │
│  │   LLM calls)  │  │  Log)    │  │  (Sandbox B)      │  │
│  │              │  │          │  │  (MCP Tools)      │  │
│  │  Stateless   │  │ Durable  │  │  Disposable       │  │
│  └──────┬───────┘  └────┬─────┘  └────────┬──────────┘  │
│         │               │                  │             │
│         │  emitEvent()  │   execute()      │             │
│         ├──────────────►│◄─────────────────┤             │
│         │  getEvents()  │   provision()    │             │
│         ├──────────────►│                  │             │
│         └───────────────┴──────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Brain (Harness)

The harness runs the agentic loop: call the LLM, route tool calls, manage context. Critically, the harness is **stateless**. It holds no session data in memory. Everything durable goes to the session log via `emitEvent()`.

When a harness crashes, a new one boots up, calls `wake(sessionId)`, fetches the event log with `getEvents()`, and resumes from the last event. No data lost. No nursing. The harness became cattle.

### Session (Event Log)

The session is an **append-only log** of everything that happened: LLM calls, tool results, user messages, system events. It lives outside both the harness and the sandbox in durable storage.

Key interfaces:
- `emitEvent(sessionId, event)` — write an event during the agent loop
- `getEvents(sessionId, options)` — read events back (positional slicing, filtering)
- `getSession(sessionId)` — get metadata and status

The session outlives both the harness and the sandbox. If either crashes, the session remains intact.

### Hands (Sandbox)

Sandboxes are execution environments where the agent runs code, edits files, and executes commands. They are created on demand via `provision({resources})` and destroyed when no longer needed.

The harness calls sandboxes the same way it calls any tool: `execute(name, input) → string`. If a sandbox dies, the harness catches the error as a failed tool call and passes it to the LLM. The model can decide to retry on a fresh sandbox.

## Session ≠ Context Window

This distinction is the most subtle and most important part of the architecture.

The **session** is the complete, durable record of everything — potentially millions of tokens spanning hours or days of agent work. The **context window** is the subset of that record that the harness selects for the current LLM call — typically 128K-200K tokens.

```
Session (append-only event log, durable)
┌─────────────────────────────────────────────────────────────┐
│ event_1 │ event_2 │ ... │ event_500 │ ... │ event_2000     │
└─────────────────────────────────────────────────────────────┘
                                    │
                          getEvents(slice)
                                    │
                                    ▼
                    Context Window (selected subset)
                    ┌───────────────────────────┐
                    │ system_prompt             │
                    │ event_1950 ... event_2000 │
                    │ (50 most recent events)   │
                    └───────────────────────────┘
```

This separation has three benefits:

**1. Irreversible decisions become reversible.** Compaction (summarizing old context to free space) permanently destroys information. With a durable session log, the harness can re-read any past event — even ones that were previously compacted out of the context window. If a future turn needs information from event_200, the harness can fetch it.

**2. Context engineering becomes a harness concern.** The harness decides what goes into the context window: recent events, a summary of older events, system prompts, relevant file contents. Different harness implementations can use different strategies without changing the session format. Today's context engineering might be token-level trimming; tomorrow's might be semantic retrieval. The session stays the same.

**3. Multi-brain architectures become possible.** Multiple harnesses can read the same session log simultaneously. A planning brain can review the full history while an execution brain focuses on recent events. Both read from the same durable source.

## Security: Credentials Never Enter the Sandbox

The decoupled architecture creates a natural security boundary. Credentials live in a vault outside the sandbox. The agent never handles tokens directly.

Two patterns:

**Bundled with resource:** For Git, the access token is used during sandbox initialization to clone the repo and configure the local remote. `git push` and `git pull` work from inside the sandbox without the agent ever seeing the token.

**Vault + proxy:** For external APIs (via MCP), OAuth tokens live in a secure vault. The agent calls MCP tools through a proxy. The proxy looks up the session's credentials from the vault and makes the external call. The sandbox never sees the credentials.

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌──────────┐
│  Agent    │────►│  MCP      │────►│  Vault    │────►│ External │
│ (sandbox) │     │  Proxy    │     │ (secrets) │     │ Service  │
│           │     │           │     │           │     │          │
│ No creds  │     │ Session   │     │ OAuth     │     │          │
│ here      │     │ → creds   │     │ tokens    │     │          │
└───────────┘     └───────────┘     └───────────┘     └──────────┘
```

Even if a prompt injection convinces the agent to search its entire environment, there are no credentials to find.

## Performance: TTFT Improvements

In the monolithic design, every session — even ones that never touch the sandbox — paid the full container setup cost: clone the repo, boot the process, fetch events. Inference couldn't start until the container was ready.

With decoupled architecture, the harness starts immediately. Sandbox provisioning happens lazily via a tool call, only if needed. Results from Anthropic's production deployment:

| Metric | Monolithic | Decoupled | Improvement |
|--------|-----------|-----------|-------------|
| TTFT p50 | baseline | ~40% of baseline | **~60% reduction** |
| TTFT p95 | baseline | ~10% of baseline | **~90% reduction** |

The p95 improvement is dramatic because the worst-case container startup (cold pulls, slow disk) is completely removed from the critical path for sessions that don't need a sandbox.

## Many Brains, Many Hands

The architecture extends naturally in both dimensions.

### Scaling Brains

Scaling to many concurrent agent sessions means starting many stateless harnesses. Since each harness holds no state (everything durable is in the session log), scaling is horizontal and trivial. No shared memory, no distributed locks, no state synchronization.

### Scaling Hands

A single brain can connect to multiple sandboxes. In practice, this means the agent reasons about multiple execution environments and decides where to send work:

```
┌──────────┐
│  Brain   │
│ (harness)│
└────┬─────┘
     │
     ├──► Sandbox A (Python environment)
     ├──► Sandbox B (Node.js environment)
     ├──► Sandbox C (Customer VPC)
     └──► MCP Tool Server (external APIs)
```

Earlier models couldn't handle this — reasoning about multiple execution environments simultaneously was too complex. As model capability improved, the single-container assumption became the bottleneck. The decoupled architecture was ready for models to catch up.

### Customer VPC Integration

When everything ran in one container, connecting to a customer's infrastructure meant network peering — the customer's VPC had to be accessible from our container. With decoupled architecture, the sandbox can run inside the customer's VPC while the brain runs in our infrastructure. The brain communicates with the sandbox through the standard `execute()` interface, regardless of where the sandbox physically runs.

## Anti-Patterns

### Storing Session State in the Harness

```python
# ❌ Session state in harness memory
class HarnessWithState:
    def __init__(self):
        self.events = []  # Lost if harness crashes
        self.current_plan = None
    
    def run_turn(self, message):
        result = self.llm.call(self.events + [message])
        self.events.append(result)  # Only in memory
```

If the harness crashes, everything is gone. Always emit events to the durable session log.

```python
# ✅ Session state externalized
class StatelessHarness:
    def run_turn(self, session_id, message):
        events = self.session_store.get_events(session_id)
        result = self.llm.call(events + [message])
        self.session_store.emit(session_id, result)  # Durable
```

### Credentials in the Sandbox

```python
# ❌ Passing API keys into the sandbox environment
sandbox.execute("export GITHUB_TOKEN=ghp_xxx && git push")
```

One prompt injection away from exfiltration. Use the vault + proxy pattern instead.

### Eager Sandbox Provisioning

```python
# ❌ Provision sandbox before knowing if it's needed
sandbox = provision_sandbox(resources=large_config)  # 30s startup
result = llm.call(prompt)  # Might not even need the sandbox
```

Provision lazily. Let the LLM decide via tool call whether it needs a sandbox, and which kind.

## Design Checklist

Before building a managed agent architecture:

1. **Brain statelessness** — can the harness crash and restart without data loss?
2. **Session durability** — is the event log stored outside both brain and hands?
3. **Sandbox disposability** — can any sandbox be killed and replaced?
4. **Credential isolation** — are secrets inaccessible from the sandbox?
5. **Lazy provisioning** — are sandboxes created on demand, not up front?
6. **Interface stability** — are brain↔hands interfaces general enough to outlast current implementations?

## Summary

The monolithic agent container is the natural starting point — everything in one box is simple. But it creates pets that can't be replaced, security boundaries that can't be enforced, and performance bottlenecks that can't be removed.

Decomposing into three layers — stateless brain, durable session, disposable hands — solves all three. The brain becomes cattle (crash and restart). The session becomes the single source of truth (outlives everything else). The hands become on-demand resources (provision only when needed, destroy when done).

This is the same pattern that operating systems discovered decades ago: virtualize the components, make the interfaces stable, and let implementations change freely underneath. The `read()` syscall doesn't care whether it's reading from a 1970s disk pack or a modern SSD. The `execute()` interface doesn't care whether the sandbox runs locally, in a customer's VPC, or on a different continent.

## Further Reading

- [Sub-Agent](sub-agent.md) — Spawning isolated agents with independent lifecycles
- [Multi-Agent Orchestration](multi-agent-orchestration.md) — Patterns for coordinating multiple brains
- [Sandbox](sandbox.md) — Execution environment isolation and security
- [Scheduling & Automation](scheduling-and-automation.md) — Session targeting for long-running periodic work
- [Anthropic: Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents) — Original architecture post
- [Anthropic: Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) — Foundational agent design patterns
