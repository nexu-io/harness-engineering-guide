# Harness as a Service (HaaS)

Running a harness on your laptop works for development. Running it for 10,000 users requires infrastructure. **Harness as a Service** is the pattern of deploying agent harnesses as managed, multi-tenant cloud services.

This guide covers the architecture, session isolation, resource management, and a working FastAPI implementation.

## Architecture

A production HaaS deployment has four layers:

```
Client (Web/Mobile/CLI)
       │
       ▼
┌─────────────────┐
│  API Gateway     │  ← Auth, rate limiting, routing
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Session Manager  │  ← Create/resume/destroy sessions
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Harness Worker   │  ← The actual agent loop
│  ┌────────────┐  │
│  │  Sandbox   │  │  ← Isolated tool execution
│  └────────────┘  │
└──────────────────┘
```

**API Gateway** — Handles authentication, rate limiting, and request routing. This is standard infrastructure (Kong, AWS API Gateway, Cloudflare Workers).

**Session Manager** — Maintains session state: which user, which conversation, which tools are active. Maps session IDs to harness workers.

**Harness Worker** — Runs the agent loop. Each active session gets a worker. Workers are stateless between requests — all state lives in the session store.

**Sandbox** — Isolated execution environment for tool calls. File operations, code execution, and shell commands run inside containers with resource limits.

## Session Isolation

Multi-tenancy means multiple users share the same infrastructure. Their data must never leak between sessions.

```python
from dataclasses import dataclass, field
import uuid

@dataclass
class Session:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    messages: list = field(default_factory=list)
    active_tools: list = field(default_factory=list)
    memory_path: str = ""
    sandbox_id: str = ""
    created_at: float = 0
    last_active: float = 0
    token_budget: int = 100_000
    cost_limit_usd: float = 1.0
    cost_used_usd: float = 0.0

class SessionStore:
    """Thread-safe session storage with TTL."""

    def __init__(self, ttl_seconds: int = 3600):
        self._sessions: dict[str, Session] = {}
        self._ttl = ttl_seconds

    def create(self, user_id: str, tools: list[str]) -> Session:
        session = Session(
            user_id=user_id,
            active_tools=tools,
            memory_path=f"/sessions/{user_id}/memory.md",
            sandbox_id=f"sandbox-{uuid.uuid4().hex[:8]}",
            created_at=time.time(),
            last_active=time.time(),
        )
        self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> Session | None:
        session = self._sessions.get(session_id)
        if session and (time.time() - session.last_active) > self._ttl:
            self.destroy(session_id)
            return None
        if session:
            session.last_active = time.time()
        return session

    def destroy(self, session_id: str):
        session = self._sessions.pop(session_id, None)
        if session:
            cleanup_sandbox(session.sandbox_id)
```

Key isolation boundaries:
- **Memory** — Each user's memory files are namespaced by user ID. No shared filesystem.
- **Sandbox** — Each session gets its own container. File operations are scoped to that container's filesystem.
- **Context** — Conversation history never crosses sessions. Even the same user's two sessions are separate.
- **Cost tracking** — Per-session spending limits prevent a runaway agent from draining your budget.

## Resource Limits

Without limits, one user's agent could consume all your compute. Set boundaries at every layer:

```python
@dataclass
class ResourceLimits:
    max_tokens_per_request: int = 16_000
    max_tool_calls_per_turn: int = 20
    max_turns_per_session: int = 100
    max_concurrent_sessions: int = 50
    max_cost_per_session_usd: float = 1.0
    sandbox_timeout_seconds: int = 30
    sandbox_memory_mb: int = 512
    sandbox_cpu_cores: float = 0.5

class ResourceGuard:
    def __init__(self, limits: ResourceLimits):
        self.limits = limits
        self.active_sessions = 0

    def check_session_limit(self):
        if self.active_sessions >= self.limits.max_concurrent_sessions:
            raise ResourceExhausted(
                "Too many active sessions. Try again shortly."
            )

    def check_cost(self, session: Session, additional_cost: float):
        projected = session.cost_used_usd + additional_cost
        if projected > self.limits.max_cost_per_session_usd:
            raise CostLimitExceeded(
                f"Session cost ${projected:.2f} would exceed "
                f"${self.limits.max_cost_per_session_usd:.2f} limit"
            )

    def check_tool_calls(self, count: int):
        if count > self.limits.max_tool_calls_per_turn:
            raise TooManyToolCalls(
                f"{count} tool calls exceeds {self.limits.max_tool_calls_per_turn} limit"
            )
```

## A Minimal FastAPI Server

Here's a working HaaS server you can deploy:

```python
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import asyncio

app = FastAPI(title="Harness as a Service")
security = HTTPBearer()
sessions = SessionStore(ttl_seconds=3600)
guard = ResourceGuard(ResourceLimits())

# --- Models ---

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None

class ChatResponse(BaseModel):
    session_id: str
    response: str
    tool_calls: list[dict]
    usage: dict

# --- Auth ---

async def get_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> str:
    user_id = verify_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user_id

# --- Endpoints ---

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user_id: str = Depends(get_user)):
    # Get or create session
    if request.session_id:
        session = sessions.get(request.session_id)
        if not session:
            raise HTTPException(404, "Session not found or expired")
        if session.user_id != user_id:
            raise HTTPException(403, "Session belongs to another user")
    else:
        guard.check_session_limit()
        session = sessions.create(
            user_id=user_id,
            tools=["read_file", "write_file", "web_search", "exec"]
        )

    # Build context
    session.messages.append({"role": "user", "content": request.message})

    # Run agent loop with resource limits
    try:
        result = await run_agent_loop(session, guard)
    except CostLimitExceeded as e:
        raise HTTPException(429, str(e))
    except ResourceExhausted as e:
        raise HTTPException(503, str(e))

    session.messages.append(
        {"role": "assistant", "content": result.output}
    )

    return ChatResponse(
        session_id=session.id,
        response=result.output,
        tool_calls=result.tool_call_log,
        usage={
            "tokens": result.total_tokens,
            "cost_usd": result.cost_usd,
            "tool_calls": len(result.tool_call_log),
        },
    )

@app.delete("/sessions/{session_id}")
async def end_session(session_id: str, user_id: str = Depends(get_user)):
    session = sessions.get(session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(404, "Session not found")
    sessions.destroy(session_id)
    return {"status": "destroyed"}

@app.get("/sessions")
async def list_sessions(user_id: str = Depends(get_user)):
    user_sessions = [
        {"id": s.id, "created": s.created_at, "last_active": s.last_active}
        for s in sessions._sessions.values()
        if s.user_id == user_id
    ]
    return {"sessions": user_sessions}

# --- Agent Loop ---

async def run_agent_loop(session: Session,
                         guard: ResourceGuard) -> AgentResult:
    """The core agent loop, wrapped with resource guards."""
    messages = list(session.messages)
    tool_log = []
    total_tokens = 0
    total_cost = 0.0

    for turn in range(guard.limits.max_turns_per_session):
        # Check cost before each LLM call
        guard.check_cost(session, estimate_cost(messages))

        response = await llm.chat(
            messages=messages,
            tools=get_tool_schemas(session.active_tools),
            max_tokens=guard.limits.max_tokens_per_request,
        )

        total_tokens += response.usage.total_tokens
        turn_cost = response.usage.cost
        total_cost += turn_cost
        session.cost_used_usd += turn_cost

        if not response.tool_calls:
            return AgentResult(
                output=response.text,
                tool_call_log=tool_log,
                total_tokens=total_tokens,
                cost_usd=total_cost,
            )

        guard.check_tool_calls(len(response.tool_calls))

        for call in response.tool_calls:
            result = await execute_in_sandbox(
                session.sandbox_id, call.name, call.arguments,
                timeout=guard.limits.sandbox_timeout_seconds,
            )
            tool_log.append({
                "tool": call.name,
                "args": call.arguments,
                "result_preview": result[:200],
            })
            messages.append(tool_result(call, result))

    raise ResourceExhausted("Max turns exceeded")
```

## Streaming Responses

Production APIs need streaming — users shouldn't stare at a blank screen while the agent thinks:

```python
from fastapi.responses import StreamingResponse

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest,
                      user_id: str = Depends(get_user)):
    session = sessions.get(request.session_id)
    # ... validation ...

    async def event_stream():
        async for event in run_agent_loop_streaming(session, guard):
            if event.type == "text_delta":
                yield f"data: {json.dumps({'type': 'text', 'content': event.text})}\n\n"
            elif event.type == "tool_call":
                yield f"data: {json.dumps({'type': 'tool', 'name': event.name})}\n\n"
            elif event.type == "done":
                yield f"data: {json.dumps({'type': 'done', 'usage': event.usage})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream"
    )
```

## Deployment Topology

For production, harness workers should be separate processes (or containers) that scale independently:

```
            ┌── Worker 1 ─── Sandbox
            │
Gateway ── Session ─┼── Worker 2 ─── Sandbox
  (1)     Manager   │
           (1)      └── Worker N ─── Sandbox

Scale: Gateway and Session Manager are singletons (or HA pairs).
       Workers scale horizontally based on active sessions.
```

Workers are stateless — they receive a session blob, run the loop, and return results. This means you can scale them with standard autoscalers (Kubernetes HPA, AWS ECS auto-scaling) based on active session count.

## Common Pitfalls

- **No session TTL** — Abandoned sessions leak memory and sandbox resources. Always expire them.
- **Shared filesystem** — If two sessions can see the same files, you have a data leak. Namespace everything.
- **No cost limits** — One bad prompt can generate hundreds of tool calls. Set per-session and per-turn limits.
- **Synchronous endpoints** — Agent loops can take 30+ seconds. Use async endpoints and streaming.

## Further Reading

- [Error Recovery →](error-recovery.md) — Handle failures in multi-tenant environments
- [Scaling Dimensions →](scaling-dimensions.md) — How HaaS maps to scaling axes
