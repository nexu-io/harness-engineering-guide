# Harness 即服务 (HaaS)

在笔记本上跑 Harness 够开发用。服务 10,000 个用户则需要基础设施。**Harness as a Service** 是将 Agent Harness 部署为托管式多租户云服务的模式。

本指南覆盖架构、会话隔离、资源管理以及一个可运行的 FastAPI 实现。

## 架构

生产级 HaaS 部署有四层：

```
Client (Web/Mobile/CLI)
       │
       ▼
┌─────────────────┐
│  API Gateway     │  ← 认证、限流、路由
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Session Manager  │  ← 创建/恢复/销毁会话
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Harness Worker   │  ← 实际的 Agent 循环
│  ┌────────────┐  │
│  │  Sandbox   │  │  ← 隔离的工具执行环境
│  └────────────┘  │
└──────────────────┘
```

**API Gateway** — 处理认证、限流和请求路由。这是标准基础设施（Kong、AWS API Gateway、Cloudflare Workers）。

**Session Manager** — 维护会话状态：哪个用户、哪个对话、哪些工具激活。将会话 ID 映射到 Harness worker。

**Harness Worker** — 运行 Agent 循环。每个活跃会话分配一个 worker。Worker 在请求之间是无状态的——所有状态存在会话存储中。

**Sandbox** — 工具调用的隔离执行环境。文件操作、代码执行和 shell 命令运行在有资源限制的容器中。

## 会话隔离

多租户意味着多个用户共享同一套基础设施。它们的数据绝不能在会话间泄露。

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

关键隔离边界：
- **记忆** — 每个用户的记忆文件按用户 ID 命名空间隔离。无共享文件系统。
- **Sandbox** — 每个会话有自己的容器。文件操作仅限于该容器的文件系统。
- **上下文** — 对话历史永远不跨会话。即使同一用户的两个会话也是分离的。
- **成本追踪** — 按会话的消费限制，防止失控的 Agent 耗尽你的预算。

## 资源限制

没有限制的话，一个用户的 Agent 可能消耗你所有的计算资源。在每一层设置边界：

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

## 极简 FastAPI 服务

一个可部署的 HaaS 服务器：

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

## 流式响应

生产级 API 需要流式传输——用户不应该在 Agent 思考时盯着空白屏幕：

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

## 部署拓扑

生产环境中，Harness worker 应该是独立的进程（或容器），独立扩缩：

```
            ┌── Worker 1 ─── Sandbox
            │
Gateway ── Session ─┼── Worker 2 ─── Sandbox
  (1)     Manager   │
           (1)      └── Worker N ─── Sandbox

扩展方式：Gateway 和 Session Manager 是单例（或 HA 对）。
         Worker 根据活跃会话数水平扩展。
```

Worker 是无状态的——它们接收会话数据，运行循环，返回结果。这意味着你可以用标准的自动扩缩器（Kubernetes HPA、AWS ECS auto-scaling）根据活跃会话数来扩展它们。

## 常见陷阱

- **没有会话 TTL** — 废弃的会话会泄露内存和 Sandbox 资源。始终设置过期时间。
- **共享文件系统** — 如果两个会话能看到相同的文件，就会有数据泄露。所有内容按命名空间隔离。
- **没有成本限制** — 一个坏的 prompt 可以生成数百次工具调用。设置按会话和按轮次的限制。
- **同步端点** — Agent 循环可能耗时 30 秒以上。使用异步端点和流式传输。

## 延伸阅读

- [错误恢复 →](error-recovery.md) — 在多租户环境中处理故障
- [三维扩展 →](scaling-dimensions.md) — HaaS 如何映射到扩展维度

---

*下一篇：[Meta-Harness →](meta-harness.md)*
