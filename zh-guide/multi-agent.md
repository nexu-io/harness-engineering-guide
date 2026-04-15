# 多 Agent 模式

多 Agent 系统使用两个或更多 Agent 来完成单个 Context Window 难以胜任的复杂、大规模或多样化任务。模式从简单的 Leader 委派子任务，到完全自主的 Agent 自行发现和认领工作，覆盖范围很广。

## 为什么重要

单个 Agent 会撞上三面墙：Context Window 限制（装不下整个代码库）、能力限制（一个 Agent 不可能精通所有领域）、时间限制（串行执行太慢）。多 Agent 模式通过将工作拆分到并行、独立的上下文中来突破这三重限制——每个 Agent 拥有自己的工具、记忆和关注点。

## 模式 1：Leader-Worker

最简单的模式。一个 Leader Agent 接收任务，分解任务，生成 Worker Agent，最后汇总结果。

```python
import json
import subprocess
import tempfile
from openai import OpenAI

client = OpenAI()

def leader_worker(task: str, num_workers: int = 3) -> str:
    """Leader decomposes task, workers execute in parallel."""

    # Step 1: Leader decomposes
    decompose = client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": f"""Decompose this task into {num_workers} independent subtasks.
Return JSON: [{{"id": 1, "task": "...", "files": ["..."]}}]

Task: {task}"""
        }],
        response_format={"type": "json_object"}
    )
    subtasks = json.loads(decompose.choices[0].message.content)["subtasks"]

    # Step 2: Spawn workers (parallel processes)
    workers = []
    for st in subtasks:
        # Each worker runs as a separate process with its own context
        proc = subprocess.Popen(
            ["python", "worker.py", json.dumps(st)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        workers.append((st, proc))

    # Step 3: Collect results
    results = []
    for st, proc in workers:
        stdout, _ = proc.communicate(timeout=120)
        results.append({"task": st["task"], "result": stdout.decode()})

    # Step 4: Leader synthesizes
    synthesis = client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": f"Synthesize these results into a coherent response:\n{json.dumps(results, indent=2)}"
        }]
    )
    return synthesis.choices[0].message.content
```

## 模式 2：基于文件的收件箱

Agent 之间通过磁盘上的文件通信。不需要网络，不需要消息队列——只要一个共享目录就够了。简单、可调试，兼容任何 Agent。

```
work/
├── inbox/
│   ├── task-001.json    # Pending task
│   ├── task-002.json    # Pending task
│   └── task-003.json    # Pending task
├── active/
│   └── task-001.json    # Being worked on (moved from inbox)
├── done/
│   └── task-000.json    # Completed
└── results/
    └── task-000.md      # Output from completed task
```

收件箱协议：

```python
import json, os, shutil, time, fcntl

INBOX = "work/inbox"
ACTIVE = "work/active"
DONE = "work/done"
RESULTS = "work/results"

def post_task(task_id: str, task: dict):
    """Leader posts a task to the inbox."""
    path = os.path.join(INBOX, f"{task_id}.json")
    with open(path, "w") as f:
        json.dump({"id": task_id, "status": "pending", **task}, f, indent=2)

def claim_task() -> dict | None:
    """Worker claims the next available task (atomic move)."""
    for fname in sorted(os.listdir(INBOX)):
        src = os.path.join(INBOX, fname)
        dst = os.path.join(ACTIVE, fname)
        try:
            os.rename(src, dst)  # Atomic on same filesystem
            with open(dst) as f:
                return json.load(f)
        except FileNotFoundError:
            continue  # Another worker claimed it
    return None

def complete_task(task_id: str, result: str):
    """Worker marks task as done and writes result."""
    # Move from active to done
    src = os.path.join(ACTIVE, f"{task_id}.json")
    dst = os.path.join(DONE, f"{task_id}.json")
    with open(src) as f:
        task = json.load(f)
    task["status"] = "done"
    with open(dst, "w") as f:
        json.dump(task, f, indent=2)
    os.remove(src)

    # Write result
    with open(os.path.join(RESULTS, f"{task_id}.md"), "w") as f:
        f.write(result)
```

## 模式 3：请求-响应握手

适用于紧耦合协作——一个 Agent 需要等待另一个 Agent 的输出才能继续。

```python
import uuid, time

def request_response(requester_client, responder_client, request: str, shared_dir: str) -> str:
    """Synchronous handshake between two agents via files."""
    req_id = str(uuid.uuid4())[:8]

    # Requester writes request
    req_path = os.path.join(shared_dir, f"req-{req_id}.json")
    with open(req_path, "w") as f:
        json.dump({"id": req_id, "request": request, "status": "pending"}, f)

    # Responder polls, processes, writes response
    # (In practice, this runs in the responder's tool loop)
    resp_path = os.path.join(shared_dir, f"resp-{req_id}.json")

    # Requester waits for response (with timeout)
    for _ in range(60):
        if os.path.exists(resp_path):
            with open(resp_path) as f:
                return json.load(f)["response"]
        time.sleep(1)

    raise TimeoutError(f"No response for request {req_id}")
```

## 模式 4：自动认领 Worker

Worker 持续运行，从共享队列中认领任务。需要扩容时只要加 Worker 即可。

```python
# worker.py — runs as a persistent process
import time

def worker_loop(worker_id: str):
    """Continuously claim and process tasks."""
    print(f"Worker {worker_id} started")

    while True:
        task = claim_task()  # From Pattern 2
        if task is None:
            time.sleep(2)    # No work available
            continue

        print(f"Worker {worker_id} claimed: {task['id']}")

        try:
            # Run the agent loop on this task
            result = run_agent(task["description"], task.get("files", []))
            complete_task(task["id"], result)
            print(f"Worker {worker_id} completed: {task['id']}")
        except Exception as e:
            # Move back to inbox for retry
            fail_task(task["id"], str(e))
            print(f"Worker {worker_id} failed: {task['id']} — {e}")
```

启动多个 Worker：

```bash
# Start 3 parallel workers
python worker.py --id worker-1 &
python worker.py --id worker-2 &
python worker.py --id worker-3 &

# Post tasks
python post_tasks.py --task "Fix bug #123" --task "Write tests for auth" --task "Update README"
```

## 模式 5：Git Worktree 隔离

对于编码 Agent，每个 Worker 获得独立的 Git worktree——单独的工作目录和分支，互不冲突。

```bash
# Create isolated worktrees for each worker
git worktree add ../work-agent-1 -b agent/fix-auth
git worktree add ../work-agent-2 -b agent/add-tests
git worktree add ../work-agent-3 -b agent/update-docs
```

```python
import subprocess

def spawn_coding_agent(repo_dir: str, branch: str, task: str) -> str:
    """Spawn an agent in its own worktree."""
    worktree_dir = f"{repo_dir}-{branch.replace('/', '-')}"

    # Create worktree
    subprocess.run(
        ["git", "worktree", "add", worktree_dir, "-b", branch],
        cwd=repo_dir, check=True
    )

    try:
        # Run agent in the isolated worktree
        result = run_agent(task, cwd=worktree_dir)

        # Commit and push
        subprocess.run(["git", "add", "-A"], cwd=worktree_dir, check=True)
        subprocess.run(["git", "commit", "-m", f"agent: {task[:50]}"], cwd=worktree_dir, check=True)
        subprocess.run(["git", "push", "origin", branch], cwd=worktree_dir, check=True)

        return result
    finally:
        # Cleanup worktree
        subprocess.run(["git", "worktree", "remove", worktree_dir], cwd=repo_dir)
```

## 如何选择模式

```
需要并行执行？
│
├── 任务相互独立 → 自动认领 Worker（模式 4）
│   （例：同时修 5 个 bug）
│
├── 任务需要协调 → Leader-Worker（模式 1）
│   （例：分解一个功能，然后集成）
│
├── 任务修改共享文件 → Git Worktree 隔离（模式 5）
│   （例：同一仓库中的多个代码改动）
│
├── Agent 之间需要对话 → 请求-响应（模式 3）
│   （例：编码 Agent 向审查 Agent 请求反馈）
│
└── 追求简单可调试 → 基于文件的收件箱（模式 2）
    （例：以上任一场景，但你想方便地查看状态）
```

## 常见陷阱

- **共享可变状态** — 两个 Agent 同时编辑同一个文件必然产生冲突。使用 Git worktree 或独占分配文件。
- **过度分解** — 把 30 分钟的任务拆成 10 个子任务会带来协调开销（生成、汇总），可能超过节省的时间。只有每个子任务耗时 2 分钟以上时才值得并行化。
- **忽略失败模式** — 5 个 Worker 中第 2 个失败了怎么办？要为部分失败做设计：重试单个任务、让 Leader 用不完整的结果继续工作、或加入人工审查环节。

## 延伸阅读

- [AutoGen: Multi-Agent Conversations](https://microsoft.github.io/autogen/) — 微软的多 Agent 框架
- [CrewAI](https://docs.crewai.com/) — 基于角色的多 Agent 编排
- [Git Worktree 隔离 →](git-worktree-isolation.md) — 基于 worktree 的并行化深入讲解

---

*下一篇：[Git Worktree 隔离 →](git-worktree-isolation.md)*
