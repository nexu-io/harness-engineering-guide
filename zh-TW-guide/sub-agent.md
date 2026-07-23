---
author: Nexu
---

# Sub-Agent

> **核心洞察：** 一個 Agent 只有一個 Context Window。當任務超出這個視窗——或者多個獨立任務可以並行執行時——你就需要 Sub-Agent。模式很簡單：一個 leader 把工作分配給 worker，每個 worker 在自己隔離的 Context 中執行，最後合併結果。

## 何時使用 Sub-Agent

不是每個任務都需要多 Agent 編排。Sub-Agent 增加了複雜度——程序管理、通訊協調、結果合併。以下場景適用：

| 訊號 | 示例 |
|--------|---------|
| **任務超出單個 Context** | "重構所有 50 個服務檔案以使用新的錯誤處理模式" |
| **獨立的並行工作** | "為模組 A、B、C 寫測試"——它們之間沒有依賴 |
| **領域隔離** | "調研競品，然後寫營銷文案"——不同的 Skill，不同的 Context |
| **長時間後臺任務** | "監控這個 CI 流水線，出現失敗就修復" |

**不要**對需要緊密協調共享狀態的任務使用 Sub-Agent。兩個 Agent 同時編輯同一個檔案必然產生衝突。在一個 Context 中順序呼叫 Tool 更簡單也更可靠。

## Leader-Worker 模式

最實用的多 Agent 模式分三個階段：

```
階段 1: 規劃             階段 2: 執行              階段 3: 合併
┌────────────┐           ┌──────────┐               ┌────────────┐
│   Leader   │──spawn──► │ Worker A │──result──┐    │   Leader   │
│  (規劃、   │           └──────────┘          │    │  (審查、   │
│   分配)    │──spawn──► ┌──────────┐          ├──► │   合併、   │
│            │           │ Worker B │──result──┘    │   彙報)    │
│            │──spawn──► ┌──────────┐          │    │            │
│            │           │ Worker C │──result──┘    └────────────┘
└────────────┘           └──────────┘
```

Leader 的工作：
1. 分析任務，拆分為獨立的子任務
2. 為每個子任務啟動一個 worker，附帶清晰、自包含的指令
3. 等待所有 worker 完成
4. 審查和合並結果
5. 向用戶彙報

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

## 基於檔案的通訊

Sub-Agent 之間無法共享記憶體——它們在隔離的程序中執行，各自有自己的 Context Window。通訊通過檔案系統進行：

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

Claim 檔案模式很重要：當多個 worker 可能領取同一個任務時，原子性的檔案建立充當了分散式鎖，而不需要資料庫。

## Session 隔離

每個 Sub-Agent 獲得完全獨立的 Context Window。這意味著：

- **無共享 Memory** —— 一個 Agent 的 Tool 結果對其他 Agent 不可見
- **獨立的 Tool 狀態** —— 每個 Agent 載入自己的 Skill
- **獨立的 Token 預算** —— Sub-Agent 可以用完整的 128K 視窗處理其特定任務

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

共享 Context 字典只傳遞 Sub-Agent 需要的內容——專案規範、檔案位置、約束條件。不要傳整個 leader 的對話；那就失去了隔離的意義。

## Git Worktree 實現並行程式碼修改

當 Sub-Agent 需要同時修改程式碼時，Git Worktree 可以避免分支衝突：

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

每個 Sub-Agent 獲得自己的 worktree（一個獨立分支上的完整工作副本）。它們可以自由編輯檔案而不互相干擾。Leader 最後負責合併分支。

## 常見陷阱

- **過度拆分** —— 把一個 5 分鐘的任務拆成 3 個 Sub-Agent，開銷比節省的還多。對需要 10 分鐘以上或確實能從並行執行中受益的任務才使用 Sub-Agent。
- **共享可變狀態** —— 兩個 Sub-Agent 編輯同一個檔案必然產生衝突。設計任務時讓每個 Agent 處理不同的檔案或不同的區塊。
- **無限制 spawn** —— 一個 leader spawn Sub-Agent，Sub-Agent 又 spawn 自己的 Sub-Agent，會建立不可控的樹形結構。最大深度限制在 1–2 層。
- **worker 沒有超時** —— 一個卡死的 Sub-Agent 會阻塞整個流水線。始終設定超時，並處理 worker 失敗或超時的情況。
- **傳遞過多 Context** —— 把 leader 的完整對話傾倒給每個 Sub-Agent 浪費 Token 且干擾 worker。只給每個 Sub-Agent 其特定任務所需的內容。

## 延伸閱讀

- [Anthropic: Building Effective Agents — Multi-Agent](https://www.anthropic.com/research/building-effective-agents) — 生產級多 Agent 系統的編排模式
- [OpenAI: Agents SDK — Handoffs](https://openai.github.io/openai-agents-python/) — Agent 委託和交接模式
- [Git Worktrees Documentation](https://git-scm.com/docs/git-worktree) — 併發開發的並行工作目錄
