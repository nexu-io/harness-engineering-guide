---
author: Nexu
---

# Subagentes

> **Idea clave:** Un solo agente tiene una sola ventana de contexto. Cuando una tarea supera esa ventana —o cuando varias tareas independientes podrían ejecutarse en paralelo— necesitas subagentes. El patrón es sencillo: un líder delega el trabajo en trabajadores, cada uno ejecutándose en su propio contexto aislado, y luego combina los resultados.

## Cuándo usar subagentes

No toda tarea necesita orquestación multiagente. Los subagentes añaden complejidad: lanzar procesos, gestionar la comunicación, combinar resultados. Úsalos cuando:

| Señal | Ejemplo |
|--------|---------|
| **La tarea supera un solo contexto** | "Refactoriza los 50 archivos de servicio para usar el nuevo patrón de manejo de errores" |
| **Trabajo paralelo independiente** | "Escribe tests para los módulos A, B y C": no hay dependencias entre ellos |
| **Aislamiento de dominio** | "Investiga a la competencia y luego escribe el texto de marketing": skills distintas, contexto distinto |
| **Trabajo en segundo plano de larga duración** | "Monitoriza este pipeline de CI y corrige los fallos a medida que aparezcan" |

**No** uses subagentes para tareas que requieren una coordinación estrecha sobre estado compartido. Dos agentes editando el mismo archivo a la vez producirán conflictos. Las llamadas a herramientas secuenciales dentro de un mismo contexto son más simples y más fiables.

## Patrón líder-trabajador (Leader-Worker)

El patrón multiagente más práctico tiene tres fases:

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

El líder:
1. Analiza la tarea y la divide en subtareas independientes
2. Lanza un trabajador por cada subtarea con una instrucción clara y autocontenida
3. Espera a que todos los trabajadores terminen
4. Revisa y combina los resultados
5. Informa al usuario

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

## Comunicación mediante archivos

Los subagentes no pueden compartir memoria: se ejecutan en procesos aislados, cada uno con su propia ventana de contexto. La comunicación se produce a través del sistema de archivos:

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

El patrón del archivo de reclamación (claim file) es importante: cuando varios trabajadores podrían tomar la misma tarea, la creación atómica de un archivo funciona como un lock distribuido sin necesidad de una base de datos.

## Aislamiento de sesión

Cada subagente obtiene una ventana de contexto completamente independiente. Esto significa:

- **Sin memoria compartida**: los resultados de las herramientas de un agente son invisibles para los demás
- **Estado de herramientas independiente**: cada agente carga sus propias skills
- **Presupuestos de tokens separados**: un subagente puede usar su ventana completa de 128K para su tarea específica

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

El diccionario de contexto compartido transmite solo lo que el subagente necesita: convenciones del proyecto, ubicación de los archivos, restricciones. No le pases toda la conversación del líder; eso anula el propósito del aislamiento.

## Git worktrees para cambios de código en paralelo

Cuando los subagentes necesitan modificar código al mismo tiempo, los git worktrees evitan conflictos entre ramas:

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

Cada subagente obtiene su propio worktree (una copia de trabajo completa en una rama única). Pueden editar archivos libremente sin pisarse unos a otros. Después, el líder fusiona las ramas.

## Errores comunes

- **Descomposición excesiva**: dividir una tarea de 5 minutos entre 3 subagentes añade más sobrecarga de la que ahorra. Usa subagentes para tareas que lleven más de 10 minutos o que realmente se beneficien de la ejecución en paralelo.
- **Estado mutable compartido**: dos subagentes editando el mismo archivo garantizan conflictos. Diseña las tareas para que cada agente trabaje en archivos distintos o en secciones distintas.
- **Lanzamiento sin límites**: un líder que lanza subagentes que a su vez lanzan sus propios subagentes crea un árbol incontrolable. Limita la profundidad a 1–2 niveles como máximo.
- **Sin timeout en los trabajadores**: un subagente bloqueado dejará colgado todo el pipeline. Configura siempre timeouts y gestiona el caso en que un trabajador falle o agote su tiempo.
- **Pasar demasiado contexto**: volcar la conversación completa del líder en cada subagente desperdicia tokens y confunde al trabajador. Dale a cada subagente solo lo que necesita para su tarea específica.

## Lecturas adicionales

- [Anthropic: Building Effective Agents — Multi-Agent](https://www.anthropic.com/research/building-effective-agents) — Patrones de orquestación para sistemas multiagente en producción
- [OpenAI: Agents SDK — Handoffs](https://openai.github.io/openai-agents-python/) — Patrones de delegación y traspaso (handoff) entre agentes
- [Documentación de Git Worktrees](https://git-scm.com/docs/git-worktree) — Directorios de trabajo paralelos para el desarrollo concurrente
