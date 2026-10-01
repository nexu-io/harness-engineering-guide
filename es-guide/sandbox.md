---
author: Nexu
---

# Sandbox

> **Idea clave:** Un agente con acceso a la shell puede ejecutar `rm -rf /`. Un sandbox es la diferencia entre un asistente de programación útil y un riesgo. El modelo debería sentirse sin restricciones; el entorno de ejecución debería estar de todo menos libre de ellas.

## ¿Por qué un sandbox?

Cuando un agente ejecuta código, instala paquetes o lanza comandos de shell, opera con privilegios reales del sistema. Sin aislamiento, un solo `curl ... | bash` alucinado puede exfiltrar datos, instalar malware o destruir el host. El aislamiento en sandbox limita el radio de impacto: aunque el agente haga algo peligroso, el daño queda contenido.

Los tres vectores de amenaza:
1. **Exfiltración de datos**: el agente lee secretos y los envía a un servidor externo
2. **Operaciones destructivas**: el agente borra archivos, corrompe bases de datos o modifica la configuración del sistema
3. **Escalada de privilegios**: el agente escapa de su sandbox para acceder al host

Un sandbox de producción aborda los tres a la vez.

## Configuración de un sandbox con Docker

Docker es el sandbox más habitual para despliegues de agentes de un solo inquilino (single-tenant). La clave es ejecutarlo con valores por defecto restrictivos y relajar únicamente lo que sea explícitamente necesario:

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

La invocación de `docker run` importa más que el Dockerfile: es ahí donde se aplican las restricciones reales:

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

Los flags críticos:
- `--read-only` hace inmutable el sistema de archivos raíz. El agente no puede modificar los binarios del sistema ni instalar puertas traseras persistentes.
- `--network none` impide todo acceso a la red. El agente no puede exfiltrar datos ni descargar payloads maliciosos.
- `--cap-drop ALL` elimina las capabilities de Linux. Sin `ptrace`, sin `mount`, sin `chown`.
- `--tmpfs` proporciona un espacio de trabajo temporal con escritura que desaparece cuando el contenedor termina.

## MicroVMs de Firecracker para entornos multiinquilino

Docker proporciona aislamiento a nivel de proceso, lo cual es suficiente para un uso de un solo inquilino. Un entorno multiinquilino (varios usuarios no confiables compartiendo un host) exige garantías más fuertes: un escape del contenedor afecta a todos los inquilinos. Las microVMs de Firecracker resuelven esto:

```
┌──────────────────────────────────────┐
│  Host Machine                        │
│  ┌────────────┐  ┌────────────┐     │
│  │ MicroVM    │  │ MicroVM    │     │
│  │ (User A)   │  │ (User B)   │     │
│  │ ┌────────┐ │  │ ┌────────┐ │     │
│  │ │ Agent  │ │  │ │ Agent  │ │     │
│  │ └────────┘ │  │ └────────┘ │     │
│  └────────────┘  └────────────┘     │
│  Firecracker VMM                     │
│  KVM hypervisor boundary             │
└──────────────────────────────────────┘
```

Cada microVM arranca en ~125 ms con un kernel de Linux mínimo. La frontera del hipervisor implica que un exploit del kernel dentro de la VM no puede alcanzar el host ni otras VMs:

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

## Aplicación de permisos a nivel del sistema operativo

Además del aislamiento del contenedor, aplica permisos dentro del sandbox mediante módulos de seguridad de Linux:

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

Aplícalo con `--security-opt seccomp=sandbox-seccomp.json` en tu comando Docker run. El agente puede leer, escribir y ejecutar, pero no montar sistemas de archivos, cargar módulos del kernel ni crear sockets raw.

## Aislamiento de red

`--network none` bloquea todo el tráfico, pero algunos agentes necesitan un acceso a la red *limitado* (p. ej., `pip install` o llamadas a APIs). Usa una política de red para permitir solo destinos concretos:

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

## Restricciones del sistema de archivos

Superpón varios controles sobre el sistema de archivos:

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

El flag `noexec` en `/tmp` impide que el agente escriba scripts en el directorio temporal y los ejecute, una técnica de escape habitual.

## Juntándolo todo

Un ejecutor de sandbox de producción combina todas las capas:

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

## Errores comunes

- **Ejecutar como root**: el error más habitual en un sandbox. Incluso dentro de Docker, root puede modificar el sistema de archivos del contenedor, instalar paquetes y, potencialmente, explotar vulnerabilidades del kernel. Usa siempre un usuario sin privilegios de root.
- **Olvidar `--network none`**: sin una denegación explícita de red, el contenedor hereda la red del host. Un agente puede enviar secretos con `curl` a cualquier servidor.
- **Contenedores persistentes**: si el contenedor del sandbox persiste entre llamadas, el agente puede acumular estado, instalar puertas traseras o configurar tareas de cron. Usa contenedores efímeros (`--rm`) por defecto.
- **Confiar en la salida del agente**: un `cat /etc/passwd` dentro del sandbox sigue devolviendo datos reales si el archivo está montado. Monta solo lo necesario y hazlo en modo de solo lectura.

## Lecturas adicionales

- [Firecracker: Lightweight Virtualization](https://firecracker-microvm.github.io/): el motor de microVMs que impulsa AWS Lambda y Fly.io
- [Docker Security Best Practices](https://docs.docker.com/engine/security/): capabilities, seccomp y perfiles de AppArmor
- [E2B: Open Source Sandbox](https://e2b.dev/): servicio de sandbox en la nube diseñado específicamente para agentes de IA
