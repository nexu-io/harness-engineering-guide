# 沙箱与安全

Sandbox 是 Agent 工具与宿主系统之间的执行边界。它控制 Agent 能读什么、写什么、执行什么、以及访问什么网络资源。没有 Sandbox 的话，一次 prompt injection 或有 bug 的工具就能清空你的磁盘、泄露密钥、或在你的机器上挖矿。

## 为什么重要

Agent 运行的是不可信代码。它们执行 LLM 生成的 shell 命令，读取模型选择的文件，用模型决定的参数调用 API。模型可能被对抗性输入操纵（prompt injection），可能幻觉出危险命令，也可能单纯犯错。Sandbox 限制了爆炸半径：即使 Agent 做了错误操作，损害也被控制在范围内。

## 信任边界示意图

```
┌─────────────────────────────────────────────────┐
│                   HOST SYSTEM                    │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │              SANDBOX BOUNDARY               │ │
│  │                                             │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │ │
│  │  │  Agent   │  │  Tools   │  │  Files   │  │ │
│  │  │  Process │  │ Execution│  │ (scoped) │  │ │
│  │  └──────────┘  └──────────┘  └──────────┘  │ │
│  │                                             │ │
│  │  Allowed:                                   │ │
│  │  ✅ Read/write within /workspace            │ │
│  │  ✅ Run approved commands                   │ │
│  │  ✅ Network to API endpoints only           │ │
│  │                                             │ │
│  │  Blocked:                                   │ │
│  │  ❌ Access host filesystem outside /workspace│ │
│  │  ❌ Run arbitrary system commands            │ │
│  │  ❌ Access host network (127.0.0.1)         │ │
│  │  ❌ Install system packages                  │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  Host resources: filesystem, network, processes  │
└─────────────────────────────────────────────────┘
```

## 架构 1：Docker 容器

最常见的 Sandbox 方案。每个 Agent 会话运行在一个资源受限的容器中。

### Agent Sandbox 的 Dockerfile

```dockerfile
# Dockerfile.agent-sandbox
FROM python:3.12-slim

# Create non-root user
RUN groupadd -r agent && useradd -r -g agent -m -d /home/agent agent

# Install common tools (no package manager in prod)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl jq ripgrep \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Security: remove package managers after setup
RUN apt-get purge -y --auto-remove && rm -rf /var/lib/apt/lists/*

# Set up workspace
WORKDIR /workspace
RUN chown agent:agent /workspace

# Drop to non-root
USER agent

# No CMD — orchestrator runs specific commands
```

### 启动脚本

```bash
#!/bin/bash
# run-sandboxed-agent.sh

TASK="$1"
WORKSPACE="$(pwd)/workspace"

docker run --rm \
  --name "agent-$(date +%s)" \
  --user agent \
  --memory 2g \
  --cpus 1 \
  --pids-limit 100 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=500m \
  --volume "$WORKSPACE:/workspace:rw" \
  --network none \
  --security-opt no-new-privileges \
  --security-opt seccomp=sandbox-profile.json \
  -e "OPENAI_API_KEY=$OPENAI_API_KEY" \
  agent-sandbox \
  python /workspace/agent.py --task "$TASK"
```

关键参数：
- `--memory 2g` — 防止 OOM 影响宿主机
- `--cpus 1` — 限制 CPU 使用
- `--pids-limit 100` — 防止 fork bomb
- `--read-only` — 根文件系统不可变
- `--network none` — 无网络访问（通过环境变量传入 API key 供模型调用）
- `--no-new-privileges` — 不能提权

### Seccomp 配置

```json
{
    "defaultAction": "SCMP_ACT_ERRNO",
    "syscalls": [
        {
            "names": [
                "read", "write", "open", "close", "stat", "fstat",
                "lstat", "poll", "lseek", "mmap", "mprotect", "munmap",
                "brk", "access", "pipe", "clone", "execve", "wait4",
                "kill", "getpid", "getppid", "getcwd", "chdir",
                "rename", "mkdir", "rmdir", "unlink", "openat",
                "readlink", "fstatat", "futex", "getdents64"
            ],
            "action": "SCMP_ACT_ALLOW"
        }
    ]
}
```

## 架构 2：Firecracker 微虚拟机

比 Docker 更强的隔离方案。Firecracker VM 启动时间约 125ms，提供硬件级隔离。

```python
# Firecracker VM configuration (JSON API)
vm_config = {
    "boot-source": {
        "kernel_image_path": "/opt/kernels/vmlinux",
        "boot_args": "console=ttyS0 reboot=k panic=1 pci=off"
    },
    "drives": [{
        "drive_id": "rootfs",
        "path_on_host": "/opt/rootfs/agent-rootfs.ext4",
        "is_root_device": True,
        "is_read_only": True
    }],
    "machine-config": {
        "vcpu_count": 1,
        "mem_size_mib": 512
    },
    "network-interfaces": []  # No network
}

# Launch via Firecracker API
import requests
requests.put("http://localhost/vm", json=vm_config)
requests.put("http://localhost/actions", json={"action_type": "InstanceStart"})
```

**什么时候用 Firecracker 而不是 Docker：**
- 多租户 SaaS，租户之间互不信任
- 运行用户提供的代码（不仅仅是模型生成的）
- 合规要求硬件级隔离

## 架构 3：WASM Sandbox

WebAssembly sandbox 是最轻量的方案——微秒级启动，开销极小。适合对单个工具执行做沙箱隔离。

```python
# Using wasmtime-py for WASM sandbox
from wasmtime import Engine, Store, Module, Instance, Linker

def run_in_wasm(wasm_path: str, function: str, args: list) -> str:
    """Execute a function in a WASM sandbox."""
    engine = Engine()
    store = Store(engine)

    # WASM modules have no filesystem/network access by default
    module = Module.from_file(engine, wasm_path)
    linker = Linker(engine)

    # Explicitly grant only what's needed
    # linker.define_wasi()  # Only if WASI access is required

    instance = linker.instantiate(store, module)
    result = instance.exports(store)[function](store, *args)
    return str(result)
```

## 权限模型

定义每个工具被允许做什么：

```python
from enum import Flag, auto
from pathlib import Path

class Permission(Flag):
    READ_FILES = auto()      # Read files in workspace
    WRITE_FILES = auto()     # Write files in workspace
    EXECUTE = auto()         # Run shell commands
    NETWORK = auto()         # Make HTTP requests
    SENSITIVE_FILES = auto() # Read .env, credentials
    SYSTEM_COMMANDS = auto() # apt-get, brew, sudo

# Tool permission registry
TOOL_PERMISSIONS = {
    "read_file":    Permission.READ_FILES,
    "write_file":   Permission.WRITE_FILES,
    "run_command":  Permission.EXECUTE,
    "web_search":   Permission.NETWORK,
    "web_fetch":    Permission.NETWORK | Permission.READ_FILES,
}

# Security levels
SECURITY_LEVELS = {
    "strict": Permission.READ_FILES,
    "standard": Permission.READ_FILES | Permission.WRITE_FILES | Permission.EXECUTE,
    "full": Permission.READ_FILES | Permission.WRITE_FILES | Permission.EXECUTE | Permission.NETWORK,
}

class Sandbox:
    def __init__(self, level: str = "standard", workspace: str = "/workspace"):
        self.allowed = SECURITY_LEVELS[level]
        self.workspace = Path(workspace).resolve()

    def check(self, tool_name: str, args: dict) -> bool:
        """Verify a tool call is within permissions."""
        required = TOOL_PERMISSIONS.get(tool_name, Permission(0))

        # Check permission flags
        if not (required & self.allowed) == required:
            raise PermissionError(
                f"Tool '{tool_name}' requires {required}, but level only allows {self.allowed}"
            )

        # Path containment check
        if "path" in args:
            target = Path(args["path"]).resolve()
            if not str(target).startswith(str(self.workspace)):
                raise PermissionError(
                    f"Path '{target}' is outside workspace '{self.workspace}'"
                )

        # Command blocklist
        if tool_name == "run_command":
            cmd = args.get("command", "")
            blocked = ["rm -rf /", "sudo", "curl | sh", "wget | bash", "chmod 777"]
            for pattern in blocked:
                if pattern in cmd:
                    raise PermissionError(f"Blocked command pattern: '{pattern}'")

        return True

# Usage in the tool loop
sandbox = Sandbox(level="standard", workspace="/workspace")

def safe_execute(tool_name: str, args: dict) -> str:
    try:
        sandbox.check(tool_name, args)
        return execute_tool(tool_name, args)
    except PermissionError as e:
        return f"🚫 Permission denied: {e}"
```

## 危险操作的人工审批

```python
DESTRUCTIVE_TOOLS = {"run_command", "write_file", "delete_file", "send_email"}

def execute_with_approval(tool_name: str, args: dict) -> str:
    """Require human approval for destructive actions."""
    if tool_name in DESTRUCTIVE_TOOLS:
        print(f"\n⚠️  Agent wants to: {tool_name}")
        print(f"   Args: {json.dumps(args, indent=2)}")
        approval = input("   Allow? [y/N]: ").strip().lower()
        if approval != "y":
            return "Action denied by user."

    return execute_tool(tool_name, args)
```

## 常见陷阱

- **Docker ≠ 安全边界** — Docker 容器共享宿主内核。内核漏洞可以逃逸。对真正的对抗性代码隔离，使用 Firecracker 或 gVisor。
- **通过环境变量在 Docker 中传递密钥** — `docker inspect` 可以看到它们。使用 Docker secrets 或挂载只读密钥文件，读取后删除。
- **忘记网络隔离** — 有网络访问权限的 Agent 可以泄露数据、下载恶意软件、或调用你不想调用的 API。默认 `--network none`，白名单放行特定端点。

## 延伸阅读

- [Firecracker](https://firecracker-microvm.github.io/) — AWS 的微虚拟机，用于 serverless 隔离
- [gVisor](https://gvisor.dev/) — Google 的用户态内核，用于容器沙箱
- [E2B Sandboxes](https://e2b.dev/) — 为 AI Agent 提供的托管沙箱环境
- [Docker Security Best Practices](https://docs.docker.com/engine/security/) — 官方安全指南
