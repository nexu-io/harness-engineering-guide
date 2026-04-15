# Multi-Agent Patterns

Multi-agent systems use two or more agents to accomplish tasks that are too complex, too large, or too varied for a single context window. The patterns range from a simple leader that delegates subtasks to fully autonomous agents that discover and claim work independently.

## Why It Matters

A single agent hits three walls: context window limits (can't hold an entire codebase), capability limits (one agent can't be expert at everything), and time limits (serial execution is slow). Multi-agent patterns break through all three by splitting work across parallel, independent contexts — each agent with its own tools, memory, and focus.

## Pattern 1: Leader-Worker

The simplest pattern. A leader agent receives a task, decomposes it, spawns worker agents, and synthesizes their results.

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

## Pattern 2: File-Based Inbox

Agents communicate through files on disk. No network, no message queue — just a shared directory. Simple, debuggable, and works with any agent.

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

The inbox protocol:

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

## Pattern 3: Request-Response Handshake

For tightly coordinated work — one agent needs another's output before continuing.

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

## Pattern 4: Auto-Claim Workers

Workers run continuously, claiming tasks from a shared queue. Scale by adding more workers.

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

Launch multiple workers:

```bash
# Start 3 parallel workers
python worker.py --id worker-1 &
python worker.py --id worker-2 &
python worker.py --id worker-3 &

# Post tasks
python post_tasks.py --task "Fix bug #123" --task "Write tests for auth" --task "Update README"
```

## Pattern 5: Git Worktree Isolation

For coding agents, each worker gets its own git worktree — a separate working directory on a separate branch, so they can't conflict.

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

## Choosing a Pattern

```
Need parallel execution?
│
├── Tasks are independent → Auto-Claim Workers (Pattern 4)
│   (e.g., fix 5 bugs simultaneously)
│
├── Tasks need coordination → Leader-Worker (Pattern 1)
│   (e.g., decompose a feature, then integrate)
│
├── Tasks modify shared files → Git Worktree Isolation (Pattern 5)
│   (e.g., multiple code changes in one repo)
│
├── Agents need to talk → Request-Response (Pattern 3)
│   (e.g., code agent asks review agent for feedback)
│
└── Simple, debuggable → File-Based Inbox (Pattern 2)
    (e.g., any of the above, but you want to inspect state easily)
```

## Common Pitfalls

- **Shared mutable state** — Two agents editing the same file simultaneously guarantees conflicts. Use git worktrees or assign files exclusively.
- **Over-decomposing** — Splitting a 30-minute task into 10 subtasks adds coordination overhead (spawning, synthesizing) that may exceed the time saved. Only parallelize when each subtask takes 2+ minutes.
- **Ignoring failure modes** — What happens when worker 2 of 5 fails? Design for partial failure: retry individual tasks, let the leader work with incomplete results, or have a human review step.

## Further Reading

- [AutoGen: Multi-Agent Conversations](https://microsoft.github.io/autogen/) — Microsoft's multi-agent framework
- [CrewAI](https://docs.crewai.com/) — Role-based multi-agent orchestration
- [Git Worktree Isolation →](git-worktree-isolation.md) — Deep dive on worktree-based parallelism
