---
author: Nexu
---

# Sandbox

> **核心洞察：** 一个有 Shell 权限的 Agent 可以执行 `rm -rf /`。Sandbox 是"好用的编码助手"和"一颗定时炸弹"之间的区别。模型应该感觉不受限制；执行环境则恰恰相反。

## 为什么需要 Sandbox？

当 Agent 运行代码、安装包或执行 Shell 命令时，它在使用真实的系统权限。没有隔离的话，一个幻觉出来的 `curl ... | bash` 就能泄露数据、安装恶意软件或搞坏宿主机。Sandbox 限制了爆炸半径——即使 Agent 做了危险操作，损害也是可控的。

三个威胁向量：
1. **数据泄露** —— Agent 读取密钥后发送到外部服务器
2. **破坏性操作** —— Agent 删除文件、损坏数据库、修改系统配置
3. **权限提升** —— Agent 逃逸 Sandbox 访问宿主机

生产级 Sandbox 需要同时应对这三个威胁。

## Docker Sandbox 配置

Docker 是单租户 Agent 部署中最常见的 Sandbox。关键是默认限制从严，只放开明确需要的：

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

`docker run` 的调用参数比 Dockerfile 更重要——真正的限制在这里执行：

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

关键参数：
- `--read-only` 使根文件系统不可变。Agent 无法修改系统二进制文件或植入持久后门。
- `--network none` 阻止所有网络访问。Agent 无法泄露数据或下载恶意载荷。
- `--cap-drop ALL` 移除所有 Linux capabilities。没有 `ptrace`、没有 `mount`、没有 `chown`。
- `--tmpfs` 提供临时可写空间，容器退出后消失。

## Firecracker 微虚拟机用于多租户

Docker 提供进程级隔离，对单租户够用。多租户（多个不可信用户共享宿主机）需要更强的保障——一次容器逃逸会影响所有租户。Firecracker 微虚拟机解决了这个问题：

```
┌──────────────────────────────────────┐
│  宿主机                              │
│  ┌────────────┐  ┌────────────┐     │
│  │ 微虚拟机   │  │ 微虚拟机   │     │
│  │ (用户 A)   │  │ (用户 B)   │     │
│  │ ┌────────┐ │  │ ┌────────┐ │     │
│  │ │ Agent  │ │  │ │ Agent  │ │     │
│  │ └────────┘ │  │ └────────┘ │     │
│  └────────────┘  └────────────┘     │
│  Firecracker VMM                     │
│  KVM 虚拟化边界                       │
└──────────────────────────────────────┘
```

每个微虚拟机在约 125ms 内启动，使用最小化 Linux 内核。虚拟化边界意味着虚拟机内部的内核漏洞利用无法触及宿主机或其他虚拟机：

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

## 操作系统级权限控制

除了容器隔离之外，还可以用 Linux 安全模块在 Sandbox 内部控制权限：

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

在 Docker run 命令中通过 `--security-opt seccomp=sandbox-seccomp.json` 应用。Agent 可以读、写、执行——但不能挂载文件系统、加载内核模块或创建原始套接字。

## 网络隔离

`--network none` 阻止所有流量，但有些 Agent 需要*有限的*网络访问（如 `pip install` 或 API 调用）。用网络策略只允许特定目标：

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

## 文件系统限制

叠加多层文件系统控制：

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

`/tmp` 上的 `noexec` 标志阻止 Agent 将脚本写入临时目录后执行——这是常见的逃逸手法。

## 组合到一起

生产级 Sandbox 执行器组合了所有层：

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

## 常见陷阱

- **以 root 运行** —— 最常见的 Sandbox 错误。即使在 Docker 内，root 也可以修改容器文件系统、安装包，甚至可能利用内核漏洞。始终使用非 root 用户。
- **忘了 `--network none`** —— 不显式禁止网络的话，容器会继承宿主机的网络。Agent 可以 `curl` 把密钥发到任何服务器。
- **持久化容器** —— 如果 Sandbox 容器在调用之间持久存在，Agent 可以积累状态、安装后门或设置 cron 任务。默认使用临时容器（`--rm`）。
- **信任 Agent 的输出** —— 一个被 Sandbox 化的 `cat /etc/passwd` 如果文件被挂载了，仍然会返回真实数据。只挂载需要的，且以只读挂载。

## 延伸阅读

- [Firecracker: Lightweight Virtualization](https://firecracker-microvm.github.io/) — 驱动 AWS Lambda 和 Fly.io 的微虚拟机引擎
- [Docker Security Best Practices](https://docs.docker.com/engine/security/) — Capabilities、seccomp 和 AppArmor 配置
- [E2B: Open Source Sandbox](https://e2b.dev/) — 专为 AI Agent 构建的云 Sandbox 服务
