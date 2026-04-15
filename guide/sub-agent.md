---
author: Nexu
---

# Sub-Agent

> **Core Insight:** A single agent has a single context window. When a task outgrows that window — or when multiple independent tasks could run in parallel — you need sub-agents. The pattern is simple: a leader delegates work to workers, each running in their own isolated context, and merges the results.

## When to Use Sub-Agents

Not every task needs multi-agent orchestration. Sub-agents add complexity — spawning processes, managing communication, merging results. Use them when:

| Signal | Example |
|--------|---------|
| **Task exceeds single context** | "Refactor all 50 service files to use the new error handling pattern" |
| **Independent parallel work** | "Write tests for modules A, B, and C" — no dependencies between them |
| **Domain isolation** | "Research competitors, then write marketing copy" — different skills, different context |
| **Long-running background work** | "Monitor this CI pipeline and fix failures as they appear" |

Do **not** use sub-agents for tasks that require tight coordination on shared state. Two agents editing the same file simultaneously will produce conflicts. Sequential tool calls within one context are simpler and more reliable.

## Leader-Worker Pattern

The most practical multi-agent pattern has three phases:

```
Phase 1: Plan            Phase 2: Execute           Phase 3: Merge
┌────────────┐           ┌──────────┐               ┌────────────┐
│   Leader   │──spawn──► │ Worker A │──result──┐    │   Leader   │
│  (plans,   │           └──────────┘          │    │  (reviews, │
│  delegates)│──spawn──► ┌──────────┐          ├──► │   merges,  │
│            │           │ Worker B │──result──┘    │   reports) │
│            │──spawn──► ┌──────────┐          │    │            │
│            │           │ Worker C │──result──┘    └────────────┘
└────────────┘           └──────────┘
```

The leader:
1. Analyzes the task and breaks it into independent sub-tasks
2. Spawns a worker for each sub-task with a clear, self-contained instruction
3. Waits for all workers to complete
4. Reviews and merges the results
5. Reports back to the user

```python
import subprocess
import json
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass


@dataclass
class SubTask:
    name: str
    instruction: str
    working_dir: str | None = None


@dataclass
class SubResult:
    name: str
    success: bool
    output: str
    artifacts: list[str]  # Paths to files produced


class SubAgentSpawner:
    """Spawn and manage sub-agents as isolated processes."""

    def __init__(
        self,
        agent_command: str = "python -m agent",
        max_workers: int = 4,
        timeout: int = 300,
    ):
        self.agent_command = agent_command
        self.max_workers = max_workers
        self.timeout = timeout

    def spawn(self, tasks: list[SubTask]) -> list[SubResult]:
        """Spawn sub-agents for each task and collect results."""
        results = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futures = {
                pool.submit(self._run_agent, task): task
                for task in tasks
            }
            for future in as_completed(futures):
                task = futures[future]
                try:
                    result = future.result(timeout=self.timeout)
                    results.append(result)
                except Exception as e:
                    results.append(SubResult(
                        name=task.name,
                        success=False,
                        output=f"Agent failed: {type(e).__name__}: {e}",
                        artifacts=[],
                    ))
        return results

    def _run_agent(self, task: SubTask) -> SubResult:
        """Run a single sub-agent in an isolated process."""
        # Each sub-agent gets its own working directory
        work_dir = task.working_dir or tempfile.mkdtemp(prefix=f"agent-{task.name}-")

        # Write the task instruction to a file the sub-agent reads
        task_file = os.path.join(work_dir, "TASK.md")
        with open(task_file, "w") as f:
            f.write(task.instruction)

        # Write a result file path for the sub-agent to populate
        result_file = os.path.join(work_dir, "RESULT.json")

        env = os.environ.copy()
        env["AGENT_TASK_FILE"] = task_file
        env["AGENT_RESULT_FILE"] = result_file
        env["AGENT_WORK_DIR"] = work_dir

        proc = subprocess.run(
            self.agent_command.split(),
            cwd=work_dir,
            env=env,
            capture_output=True,
            text=True,
            timeout=self.timeout,
        )

        # Read the result file if it exists
        if os.path.exists(result_file):
            with open(result_file) as f:
                result_data = json.load(f)
            return SubResult(
                name=task.name,
                success=result_data.get("success", True),
                output=result_data.get("output", ""),
                artifacts=result_data.get("artifacts", []),
            )

        return SubResult(
            name=task.name,
            success=proc.returncode == 0,
            output=proc.stdout[-5000:] or proc.stderr[-5000:],
            artifacts=[],
        )
```

## File-Based Communication

Sub-agents can't share memory — they run in isolated processes with their own context windows. Communication happens through the filesystem:

```python
import json
import time
from pathlib import Path


class FileInbox:
    """File-based message passing between agents."""

    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def send(self, recipient: str, message: dict):
        """Write a message to a recipient's inbox."""
        inbox = self.base_dir / recipient / "inbox"
        inbox.mkdir(parents=True, exist_ok=True)
        msg_file = inbox / f"{int(time.time() * 1000)}.json"
        msg_file.write_text(json.dumps(message, indent=2))

    def receive(self, agent_id: str) -> list[dict]:
        """Read and consume messages from this agent's inbox."""
        inbox = self.base_dir / agent_id / "inbox"
        if not inbox.exists():
            return []
        messages = []
        for msg_file in sorted(inbox.glob("*.json")):
            messages.append(json.loads(msg_file.read_text()))
            msg_file.unlink()  # Consume after reading
        return messages

    def claim(self, agent_id: str, task_id: str) -> bool:
        """Atomic claim — prevents two agents from working the same task."""
        claim_file = self.base_dir / "claims" / f"{task_id}.claimed"
        claim_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            # O_CREAT | O_EXCL = atomic create-if-not-exists
            fd = os.open(str(claim_file), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, agent_id.encode())
            os.close(fd)
            return True
        except FileExistsError:
            return False  # Another agent already claimed this task
```

The claim file pattern is important: when multiple workers might pick up the same task, an atomic file creation serves as a distributed lock without needing a database.

## Session Isolation

Each sub-agent gets a completely independent context window. This means:

- **No shared memory** — one agent's tool results are invisible to others
- **Independent tool state** — each agent loads its own skills
- **Separate token budgets** — a sub-agent can use its full 128K window for its specific task

```python
def prepare_sub_agent_context(task: SubTask, shared_context: dict) -> list[dict]:
    """Build an isolated context for a sub-agent."""
    return [
        {
            "role": "system",
            "content": (
                "You are a sub-agent executing a specific task. "
                "Complete the task and write results to RESULT.json.\n\n"
                f"Task: {task.instruction}"
            ),
        },
        {
            "role": "system",
            "content": f"[Shared context]\n{json.dumps(shared_context)}",
        },
    ]
```

The shared context dict passes only what the sub-agent needs — project conventions, file locations, constraints. Don't pass the entire leader conversation; that defeats the purpose of isolation.

## Git Worktrees for Parallel Code Changes

When sub-agents need to modify code simultaneously, git worktrees prevent branch conflicts:

```python
import subprocess


def create_worktree(repo_path: str, branch_name: str) -> str:
    """Create a git worktree for a sub-agent to work in."""
    worktree_path = f"/tmp/worktrees/{branch_name}"
    subprocess.run(
        ["git", "worktree", "add", "-b", branch_name, worktree_path],
        cwd=repo_path,
        check=True,
    )
    return worktree_path


def merge_worktrees(repo_path: str, branches: list[str], target: str = "main"):
    """Merge all sub-agent branches back into the target branch."""
    subprocess.run(["git", "checkout", target], cwd=repo_path, check=True)
    for branch in branches:
        result = subprocess.run(
            ["git", "merge", "--no-ff", branch, "-m", f"Merge {branch}"],
            cwd=repo_path,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"Conflict merging {branch}: {result.stderr}")
            subprocess.run(["git", "merge", "--abort"], cwd=repo_path)


def cleanup_worktrees(repo_path: str, branches: list[str]):
    """Remove worktrees and branches after merge."""
    for branch in branches:
        worktree_path = f"/tmp/worktrees/{branch}"
        subprocess.run(
            ["git", "worktree", "remove", worktree_path],
            cwd=repo_path,
            check=True,
        )
        subprocess.run(
            ["git", "branch", "-d", branch],
            cwd=repo_path,
            check=True,
        )
```

Each sub-agent gets its own worktree (a full working copy on a unique branch). They can edit files freely without stepping on each other. The leader merges branches afterward.

## Common Pitfalls

- **Over-decomposition** — Splitting a 5-minute task into 3 sub-agents adds more overhead than it saves. Use sub-agents for tasks that take 10+ minutes or genuinely benefit from parallel execution.
- **Shared mutable state** — Two sub-agents editing the same file guarantees conflicts. Design tasks so each agent works on distinct files or distinct sections.
- **Unbounded spawning** — A leader that spawns sub-agents which spawn their own sub-agents creates an uncontrollable tree. Limit depth to 1–2 levels max.
- **No timeout on workers** — A stuck sub-agent will hang the entire pipeline. Always set timeouts, and handle the case where a worker fails or times out.
- **Passing too much context** — Dumping the leader's full conversation into each sub-agent wastes tokens and confuses the worker. Give each sub-agent only what it needs for its specific task.

## Further Reading

- [Anthropic: Building Effective Agents — Multi-Agent](https://www.anthropic.com/research/building-effective-agents) — Orchestration patterns for production multi-agent systems
- [OpenAI: Agents SDK — Handoffs](https://openai.github.io/openai-agents-python/) — Agent delegation and handoff patterns
- [Git Worktrees Documentation](https://git-scm.com/docs/git-worktree) — Parallel working directories for concurrent development
