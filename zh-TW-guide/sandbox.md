---
author: Nexu
---

# Sandbox

> **核心洞察：** 一個有 Shell 權限的 Agent 可以執行 `rm -rf /`。Sandbox 是"好用的編碼助手"和"一顆定時炸彈"之間的區別。模型應該感覺不受限制；執行環境則恰恰相反。

## 為什麼需要 Sandbox？

當 Agent 執行程式碼、安裝包或執行 Shell 命令時，它在使用真實的系統權限。沒有隔離的話，一個幻覺出來的 `curl ... | bash` 就能洩露資料、安裝惡意軟體或搞壞宿主機。Sandbox 限制了爆炸半徑——即使 Agent 做了危險操作，損害也是可控的。

三個威脅向量：
1. **資料洩露** —— Agent 讀取金鑰後傳送到外部伺服器
2. **破壞性操作** —— Agent 刪除檔案、損壞資料庫、修改系統配置
3. **權限提升** —— Agent 逃逸 Sandbox 訪問宿主機

生產級 Sandbox 需要同時應對這三個威脅。

## Docker Sandbox 配置

Docker 是單租戶 Agent 部署中最常見的 Sandbox。關鍵是預設限制從嚴，只放開明確需要的：

```dockerfile
# Dockerfile.sandbox
FROM python:3.12-slim

# Non-root user — never run agents as root
RUN useradd -m -s /bin/bash agent
WORKDIR /workspace

# Install common tools (locked versions, no auto-update)
RUN pip install --no-cache-dir \
    ruff==0.4.4 \
    pytest==8.2.0 \
    httpx==0.27.0

# Drop all capabilities, agent gets only what's listed
USER agent
```

`docker run` 的呼叫引數比 Dockerfile 更重要——真正的限制在這裡執行：

```python
import subprocess
import tempfile
import json
from pathlib import Path

class DockerSandbox:
    """Execute agent commands inside a restricted Docker container."""

    def __init__(
        self,
        image: str = "agent-sandbox:latest",
        workspace: str | None = None,
        timeout: int = 30,
        memory_limit: str = "512m",
        network: bool = False,
    ):
        self.image = image
        self.workspace = workspace or tempfile.mkdtemp(prefix="agent-")
        self.timeout = timeout
        self.memory_limit = memory_limit
        self.network = network

    def execute(self, command: str) -> dict:
        """Run a command in the sandbox and return stdout/stderr/exit code."""
        docker_cmd = [
            "docker", "run",
            "--rm",                              # Auto-cleanup
            "--user", "1000:1000",               # Non-root
            "--memory", self.memory_limit,       # OOM protection
            "--cpus", "1.0",                     # CPU limit
            "--pids-limit", "100",               # Fork bomb protection
            "--read-only",                       # Read-only root filesystem
            "--tmpfs", "/tmp:size=100m",         # Writable temp space
            "--tmpfs", "/workspace:size=200m",   # Writable workspace
            "--security-opt", "no-new-privileges",
            "--cap-drop", "ALL",                 # Drop all Linux capabilities
        ]

        # Mount workspace files as read-only input
        if Path(self.workspace).exists():
            docker_cmd.extend([
                "-v", f"{self.workspace}:/input:ro"
            ])

        # Network isolation (default: no network)
        if not self.network:
            docker_cmd.extend(["--network", "none"])

        docker_cmd.extend([self.image, "bash", "-c", command])

        try:
            result = subprocess.run(
                docker_cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
            return {
                "stdout": result.stdout[-10_000:],  # Truncate large output
                "stderr": result.stderr[-5_000:],
                "exit_code": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                "stdout": "",
                "stderr": f"Command timed out after {self.timeout}s",
                "exit_code": -1,
            }
```

關鍵引數：
- `--read-only` 使根檔案系統不可變。Agent 無法修改系統二進位制檔案或植入持久後門。
- `--network none` 阻止所有網路訪問。Agent 無法洩露資料或下載惡意載荷。
- `--cap-drop ALL` 移除所有 Linux capabilities。沒有 `ptrace`、沒有 `mount`、沒有 `chown`。
- `--tmpfs` 提供臨時可寫空間，容器退出後消失。

## Firecracker 微虛擬機器用於多租戶

Docker 提供程序級隔離，對單租戶夠用。多租戶（多個不可信使用者共享宿主機）需要更強的保障——一次容器逃逸會影響所有租戶。Firecracker 微虛擬機器解決了這個問題：

```
┌──────────────────────────────────────┐
│  宿主機                              │
│  ┌────────────┐  ┌────────────┐     │
│  │ 微虛擬機器   │  │ 微虛擬機器   │     │
│  │ (使用者 A)   │  │ (使用者 B)   │     │
│  │ ┌────────┐ │  │ ┌────────┐ │     │
│  │ │ Agent  │ │  │ │ Agent  │ │     │
│  │ └────────┘ │  │ └────────┘ │     │
│  └────────────┘  └────────────┘     │
│  Firecracker VMM                     │
│  KVM 虛擬化邊界                       │
└──────────────────────────────────────┘
```

每個微虛擬機器在約 125ms 內啟動，使用最小化 Linux 核心。虛擬化邊界意味著虛擬機器內部的核心漏洞利用無法觸及宿主機或其他虛擬機器：

```python
import json
import socket

class FirecrackerSandbox:
    """Manage a Firecracker microVM for agent execution."""

    def __init__(self, socket_path: str, kernel: str, rootfs: str):
        self.socket_path = socket_path
        self.kernel = kernel
        self.rootfs = rootfs

    def configure(self, vcpus: int = 1, mem_mb: int = 256):
        """Configure the microVM resources."""
        self._api_call("PUT", "/machine-config", {
            "vcpu_count": vcpus,
            "mem_size_mib": mem_mb,
        })
        self._api_call("PUT", "/boot-source", {
            "kernel_image_path": self.kernel,
            "boot_args": "console=ttyS0 reboot=k panic=1 pci=off",
        })
        self._api_call("PUT", "/drives/rootfs", {
            "drive_id": "rootfs",
            "path_on_host": self.rootfs,
            "is_root_device": True,
            "is_read_only": False,
        })

    def start(self):
        """Boot the microVM."""
        self._api_call("PUT", "/actions", {"action_type": "InstanceStart"})

    def stop(self):
        """Shut down the microVM."""
        self._api_call("PUT", "/actions", {"action_type": "SendCtrlAltDel"})

    def _api_call(self, method: str, path: str, body: dict):
        """Make an API call to the Firecracker socket."""
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.connect(self.socket_path)
        payload = json.dumps(body)
        request = (
            f"{method} {path} HTTP/1.1\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {len(payload)}\r\n"
            f"\r\n{payload}"
        )
        sock.sendall(request.encode())
        response = sock.recv(4096).decode()
        sock.close()
        return response
```

## 作業系統級權限控制

除了容器隔離之外，還可以用 Linux 安全模組在 Sandbox 內部控制權限：

```bash
# seccomp profile — restrict system calls
# sandbox-seccomp.json
{
    "defaultAction": "SCMP_ACT_ERRNO",
    "syscalls": [
        {
            "names": ["read", "write", "open", "close", "stat", "fstat",
                       "mmap", "mprotect", "munmap", "brk", "execve",
                       "access", "pipe", "dup2", "fork", "wait4", "exit_group"],
            "action": "SCMP_ACT_ALLOW"
        }
    ]
}
```

在 Docker run 命令中通過 `--security-opt seccomp=sandbox-seccomp.json` 應用。Agent 可以讀、寫、執行——但不能掛載檔案系統、載入核心模組或建立原始套接字。

## 網路隔離

`--network none` 阻止所有流量，但有些 Agent 需要*有限的*網路訪問（如 `pip install` 或 API 呼叫）。用網路策略只允許特定目標：

```python
NETWORK_ALLOWLIST = [
    "pypi.org:443",
    "files.pythonhosted.org:443",
    "api.openai.com:443",
]

def create_sandbox_network():
    """Create a Docker network with egress restrictions via iptables."""
    subprocess.run([
        "docker", "network", "create",
        "--driver", "bridge",
        "--opt", "com.docker.network.bridge.enable_icc=false",
        "agent-sandbox-net",
    ], check=True)

    # Allow only specific destinations
    for target in NETWORK_ALLOWLIST:
        host, port = target.split(":")
        subprocess.run([
            "iptables", "-A", "DOCKER-USER",
            "-d", host,
            "-p", "tcp", "--dport", port,
            "-j", "ACCEPT",
        ], check=True)

    # Drop everything else
    subprocess.run([
        "iptables", "-A", "DOCKER-USER", "-j", "DROP",
    ], check=True)
```

## 檔案系統限制

疊加多層檔案系統控制：

```python
def build_volume_mounts(workspace: str, readonly_dirs: list[str]) -> list[str]:
    """Construct Docker volume mount arguments."""
    mounts = [
        # Agent workspace — read-write, but scoped
        f"-v {workspace}:/workspace:rw",
        # Temp space — in-memory, size-limited
        "--tmpfs /tmp:size=100m,noexec",
    ]
    # Read-only reference directories
    for d in readonly_dirs:
        mounts.append(f"-v {d}:{d}:ro")
    return mounts

# Example: agent can read source code but only write to /workspace
mounts = build_volume_mounts(
    workspace="/tmp/agent-work-abc123",
    readonly_dirs=["/opt/project/src", "/opt/project/tests"],
)
```

`/tmp` 上的 `noexec` 標誌阻止 Agent 將指令碼寫入臨時目錄後執行——這是常見的逃逸手法。

## 組合到一起

生產級 Sandbox 執行器組合了所有層：

```python
class ProductionSandbox:
    """Full-featured sandbox with layered security."""

    def __init__(self, config: dict):
        self.docker = DockerSandbox(
            image=config["image"],
            timeout=config.get("timeout", 30),
            memory_limit=config.get("memory", "512m"),
            network=config.get("network", False),
        )

    def run_tool(self, tool_name: str, command: str) -> str:
        """Execute a tool command in the sandbox."""
        # Log every execution for audit
        log_entry = {"tool": tool_name, "command": command}
        audit_log.append(log_entry)

        result = self.docker.execute(command)

        if result["exit_code"] != 0:
            return f"Error (exit {result['exit_code']}):\n{result['stderr']}"
        return result["stdout"]
```

## 常見陷阱

- **以 root 執行** —— 最常見的 Sandbox 錯誤。即使在 Docker 內，root 也可以修改容器檔案系統、安裝包，甚至可能利用核心漏洞。始終使用非 root 使用者。
- **忘了 `--network none`** —— 不顯式禁止網路的話，容器會繼承宿主機的網路。Agent 可以 `curl` 把金鑰發到任何伺服器。
- **持久化容器** —— 如果 Sandbox 容器在呼叫之間持久存在，Agent 可以積累狀態、安裝後門或設定 cron 任務。預設使用臨時容器（`--rm`）。
- **信任 Agent 的輸出** —— 一個被 Sandbox 化的 `cat /etc/passwd` 如果檔案被掛載了，仍然會返回真實資料。只掛載需要的，且以只讀掛載。

## 延伸閱讀

- [Firecracker: Lightweight Virtualization](https://firecracker-microvm.github.io/) — 驅動 AWS Lambda 和 Fly.io 的微虛擬機器引擎
- [Docker Security Best Practices](https://docs.docker.com/engine/security/) — Capabilities、seccomp 和 AppArmor 配置
- [E2B: Open Source Sandbox](https://e2b.dev/) — 專為 AI Agent 構建的雲 Sandbox 服務
