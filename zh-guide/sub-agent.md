---
author: Nexu
---

# Sub-Agent

> **核心洞察：** 一个 Agent 只有一个 Context Window。当任务超出这个窗口——或者多个独立任务可以并行执行时——你就需要 Sub-Agent。模式很简单：一个 leader 把工作分配给 worker，每个 worker 在自己隔离的 Context 中运行，最后合并结果。

## 何时使用 Sub-Agent

不是每个任务都需要多 Agent 编排。Sub-Agent 增加了复杂度——进程管理、通信协调、结果合并。以下场景适用：

| 信号 | 示例 |
|--------|---------|
| **任务超出单个 Context** | "重构所有 50 个服务文件以使用新的错误处理模式" |
| **独立的并行工作** | "为模块 A、B、C 写测试"——它们之间没有依赖 |
| **领域隔离** | "调研竞品，然后写营销文案"——不同的 Skill，不同的 Context |
| **长时间后台任务** | "监控这个 CI 流水线，出现失败就修复" |

**不要**对需要紧密协调共享状态的任务使用 Sub-Agent。两个 Agent 同时编辑同一个文件必然产生冲突。在一个 Context 中顺序调用 Tool 更简单也更可靠。

## Leader-Worker 模式

最实用的多 Agent 模式分三个阶段：

```
阶段 1: 规划             阶段 2: 执行              阶段 3: 合并
┌────────────┐           ┌──────────┐               ┌────────────┐
│   Leader   │──spawn──► │ Worker A │──result──┐    │   Leader   │
│  (规划、   │           └──────────┘          │    │  (审查、   │
│   分配)    │──spawn──► ┌──────────┐          ├──► │   合并、   │
│            │           │ Worker B │──result──┘    │   汇报)    │
│            │──spawn──► ┌──────────┐          │    │            │
│            │           │ Worker C │──result──┘    └────────────┘
└────────────┘           └──────────┘
```

Leader 的工作：
1. 分析任务，拆分为独立的子任务
2. 为每个子任务启动一个 worker，附带清晰、自包含的指令
3. 等待所有 worker 完成
4. 审查和合并结果
5. 向用户汇报

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

## 基于文件的通信

Sub-Agent 之间无法共享内存——它们在隔离的进程中运行，各自有自己的 Context Window。通信通过文件系统进行：

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

Claim 文件模式很重要：当多个 worker 可能领取同一个任务时，原子性的文件创建充当了分布式锁，而不需要数据库。

## Session 隔离

每个 Sub-Agent 获得完全独立的 Context Window。这意味着：

- **无共享 Memory** —— 一个 Agent 的 Tool 结果对其他 Agent 不可见
- **独立的 Tool 状态** —— 每个 Agent 加载自己的 Skill
- **独立的 Token 预算** —— Sub-Agent 可以用完整的 128K 窗口处理其特定任务

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

共享 Context 字典只传递 Sub-Agent 需要的内容——项目规范、文件位置、约束条件。不要传整个 leader 的对话；那就失去了隔离的意义。

## Git Worktree 实现并行代码修改

当 Sub-Agent 需要同时修改代码时，Git Worktree 可以避免分支冲突：

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

每个 Sub-Agent 获得自己的 worktree（一个独立分支上的完整工作副本）。它们可以自由编辑文件而不互相干扰。Leader 最后负责合并分支。

## 常见陷阱

- **过度拆分** —— 把一个 5 分钟的任务拆成 3 个 Sub-Agent，开销比节省的还多。对需要 10 分钟以上或确实能从并行执行中受益的任务才使用 Sub-Agent。
- **共享可变状态** —— 两个 Sub-Agent 编辑同一个文件必然产生冲突。设计任务时让每个 Agent 处理不同的文件或不同的区块。
- **无限制 spawn** —— 一个 leader spawn Sub-Agent，Sub-Agent 又 spawn 自己的 Sub-Agent，会创建不可控的树形结构。最大深度限制在 1–2 层。
- **worker 没有超时** —— 一个卡死的 Sub-Agent 会阻塞整个流水线。始终设置超时，并处理 worker 失败或超时的情况。
- **传递过多 Context** —— 把 leader 的完整对话倾倒给每个 Sub-Agent 浪费 Token 且干扰 worker。只给每个 Sub-Agent 其特定任务所需的内容。

## 延伸阅读

- [Anthropic: Building Effective Agents — Multi-Agent](https://www.anthropic.com/research/building-effective-agents) — 生产级多 Agent 系统的编排模式
- [OpenAI: Agents SDK — Handoffs](https://openai.github.io/openai-agents-python/) — Agent 委托和交接模式
- [Git Worktrees Documentation](https://git-scm.com/docs/git-worktree) — 并发开发的并行工作目录
