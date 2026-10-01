---
author: Nexu
---

# Memoria y contexto

> **Idea clave:** El modelo solo sabe lo que está en su ventana de contexto. La memoria es la forma de cerrar la brecha entre lo que el modelo *necesita saber* y lo que *puede ver* en una sola llamada a la API. Resolver esto bien es el problema de mayor impacto en la ingeniería de harness.

## Tres conceptos distintos

Estos términos suelen confundirse, pero cumplen funciones diferentes:

| Concepto | Alcance | Persistencia | Ejemplo |
|---------|-------|-------------|---------|
| **Contexto** | Una sola llamada a la API | Ninguna — se reconstruye en cada turno | Prompt de sistema + herramientas + mensajes recientes + archivos relevantes |
| **Sesión** | Una sola conversación o tarea | En memoria del proceso, se pierde al reiniciar | Historial de mensajes, resultados de llamadas a herramientas, estado de trabajo |
| **Memoria** | Entre sesiones, indefinida | Se escribe en disco | MEMORY.md, registros diarios, preferencias aprendidas |

El **contexto** es la "memoria de trabajo" del modelo: todo lo que se ensambla en un único prompt. La **sesión** es el estado de una interacción en curso. La **memoria** es lo que sobrevive cuando la sesión termina.

## Ensamblaje de contexto

Cada turno del bucle agéntico empieza ensamblando el contexto. Es un problema de empaquetado con prioridades: tienes un presupuesto fijo de tokens y debes decidir qué entra:

```
Context Window (e.g., 128K tokens)
┌─────────────────────────────────┐
│  System Prompt        (~500)    │  ← Always included, highest priority
│  Tool Schemas         (~2000)   │  ← Active tools only
│  Memory Summary       (~1000)   │  ← Compressed long-term memory
│  Relevant Files       (~5000)   │  ← Task-specific context
│  Conversation History (~varies) │  ← Grows over time, needs pruning
│  [Remaining Budget]             │  ← Available for new content
└─────────────────────────────────┘
```

Un sistema de prioridades determina qué se incluye cuando falta espacio:

```python
class ContextAssembler:
    def __init__(self, max_tokens: int = 128_000):
        self.max_tokens = max_tokens
        self.sections = []  # (priority, name, content)

    def add(self, priority: int, name: str, content: str):
        self.sections.append((priority, name, content))

    def build(self) -> list[dict]:
        # Sort by priority (lower = higher priority)
        self.sections.sort(key=lambda x: x[0])
        messages = []
        used_tokens = 0
        for priority, name, content in self.sections:
            token_count = estimate_tokens(content)
            if used_tokens + token_count > self.max_tokens:
                break  # Budget exceeded — skip lower-priority content
            messages.append({"role": "system", "content": f"[{name}]\n{content}"})
            used_tokens += token_count
        return messages
```

## Gestión de sesiones

Una sesión es el límite de una sola ejecución del agente. Contiene:

- **Historial de mensajes** — la conversación completa, incluidas las llamadas a herramientas y sus resultados
- **Estado de trabajo** — qué archivos están abiertos, qué skills están cargadas, el progreso de la tarea actual
- **Espacio temporal** — datos provisionales que el agente generó pero todavía no ha consolidado

La decisión clave en el diseño de sesiones es **cuándo limpiarla**. Algunas opciones:

| Estrategia | Comportamiento | Caso de uso |
|----------|----------|----------|
| **Por tarea** | Nueva sesión por cada solicitud del usuario | Asistente sin estado |
| **Por conversación** | La sesión persiste entre turnos dentro de un chat | Programación interactiva |
| **Persistente** | La sesión sobrevive al reinicio del proceso | Agente en segundo plano de larga duración |

Las sesiones persistentes requieren serialización: escribir el estado de la sesión en disco para poder restaurarlo. Aquí es donde sesión y memoria se solapan: todo lo que valga la pena conservar entre reinicios debería escribirse en un archivo de memoria en lugar de mantenerse en el estado de la sesión.

## Arquitectura de memoria

La arquitectura de memoria probada en la práctica usa dos niveles:

### Nivel 1: registros diarios

Registros brutos y cronológicos de lo que ocurrió. Se escriben durante la sesión, sin curar:

```markdown
<!-- memory/2026-04-15.md -->
# 2026-04-15

## 14:30 — Refactored auth module
- Moved JWT validation from middleware to dedicated service
- Tests passing (23/23)
- User prefers explicit error messages over error codes

## 16:00 — Deploy to staging
- Used blue-green deployment
- Rollback plan: revert commit abc123
```

### Nivel 2: memoria a largo plazo

Conocimiento curado y destilado. Se actualiza periódicamente (no en cada sesión):

```markdown
<!-- MEMORY.md -->
# Long-term Memory

## User Preferences
- Prefers explicit error messages over error codes
- Uses pytest, not unittest
- Deploy strategy: blue-green with rollback plan

## Project Knowledge
- Auth module: JWT validation in /src/services/auth.py
- Database: PostgreSQL 15, migrations in /db/migrations/
- CI: GitHub Actions, ~3min build time

## Lessons Learned
- Always run tests before committing (broke build on 4/10)
- User dislikes verbose output — keep summaries under 5 lines
```

La idea clave: los registros diarios son baratos de escribir (basta con añadir al final). La memoria a largo plazo requiere criterio (¿qué vale la pena conservar?). Los harness de producción escriben los registros diarios automáticamente y curan MEMORY.md periódicamente, ya sea según un calendario o cuando el agente detecta aprendizajes significativos.

## Ciclo de lectura/escritura de memoria

```python
def session_startup(memory_dir: str) -> str:
    """Read memory at session start."""
    sections = []
    # Always read long-term memory
    memory_path = os.path.join(memory_dir, "MEMORY.md")
    if os.path.exists(memory_path):
        sections.append(open(memory_path).read())
    # Read recent daily logs (today + yesterday)
    for days_ago in [0, 1]:
        date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
        daily_path = os.path.join(memory_dir, f"memory/{date}.md")
        if os.path.exists(daily_path):
            sections.append(open(daily_path).read())
    return "\n---\n".join(sections)
```

## El patrón AGENTS.md

Un archivo relacionado pero distinto es AGENTS.md: un archivo de texto plano que define cómo debe *comportarse* un agente (no lo que *recuerda*). Colócalo en cualquier directorio y un harness compatible lo leerá automáticamente:

```markdown
<!-- AGENTS.md -->
# Behavior

- You are a Python backend engineer
- Use pytest for all tests
- Follow Google style docstrings
- Never modify files in /config/ without asking

# Tools

- Prefer `ruff` over `pylint` for linting
- Use `uv` for package management
```

AGENTS.md es **declarativo** (qué hacer), mientras que MEMORY.md es **experiencial** (qué pasó). Ambos se inyectan en el contexto al iniciar la sesión, pero cumplen funciones distintas.

## Errores comunes

- **Tratar el contexto como ilimitado** — Incluso 128K tokens se llenan rápido con esquemas de herramientas, contenido de archivos e historial de conversación. Planifica tu presupuesto de tokens de forma explícita.
- **No podar nunca el historial de la sesión** — Una conversación de 50 turnos acumula contenido redundante. Comprime o resume los turnos más antiguos para recuperar espacio.
- **Escribir en memoria con demasiado entusiasmo** — No todos los turnos producen conocimiento que valga la pena persistir. Escribir de más genera ruido que diluye la información útil.
- **Olvidar leer la memoria al arrancar** — Un agente que no lee su memoria es, en la práctica, amnésico. Este es el error de configuración más común.

## Lecturas adicionales

- [Letta: MemGPT and the Future of Agent Memory](https://www.letta.com/blog/memgpt) — Gestión de memoria para agentes inspirada en los sistemas operativos
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Patrones de memoria en producción
