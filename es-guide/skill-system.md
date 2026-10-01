---
author: Nexu
---

# Sistema de skills

> **Idea clave:** Una skill no es una herramienta: es un *paquete* de herramientas, documentación y reglas de comportamiento relacionadas, empaquetado como una única capacidad. El sistema de skills convierte "100 herramientas metidas a presión en cada prompt" en "un menú de capacidades cargadas bajo demanda", lo que ahorra miles de tokens y mejora drásticamente la precisión en la selección de herramientas.

## ¿Qué es una skill?

Una herramienta es una única función que el modelo puede llamar. Una **skill** es una capacidad empaquetada que agrupa:

- **Herramientas**: uno o más esquemas de función y handlers relacionados
- **Documentación**: un archivo SKILL.md que explica cuándo y cómo usar la skill
- **Reglas de comportamiento**: restricciones, patrones y convenciones que el modelo debe seguir

```
skill/
├── SKILL.md          # Documentation: when to use, how to use, constraints
├── tools.py          # Tool implementations
└── schema.json       # Tool schemas (or generated from code)
```

Por ejemplo, una skill `git` no expone una única herramienta `git`: agrupa `git_status`, `git_diff`, `git_commit`, `git_push` y `git_log`, e incluye documentación sobre las convenciones de los mensajes de commit, el nombrado de ramas y cuándo preguntar antes de hacer push.

## Skill vs. herramienta

| | Herramienta | Skill |
|---|------|-------|
| **Alcance** | Una sola función | Paquete de funciones relacionadas |
| **Documentación** | Descripción de parámetros | SKILL.md completo con ejemplos y convenciones |
| **Carga** | Siempre presente o ausente | Se carga bajo demanda desde un menú |
| **Costo de contexto** | ~100–200 tokens por esquema | ~200 tokens por entrada de menú + ~1000 tokens al cargarse |
| **Reglas de comportamiento** | Ninguna | Puede incluir restricciones, flujos de trabajo y patrones |

La distinción importa para la economía de tokens. Un harness con 80 herramientas paga ~12,000 tokens por cada llamada a la API solo en esquemas. Un sistema de skills con 15 skills y un menú de 300 tokens carga solo lo necesario.

## Formato de SKILL.md

El archivo SKILL.md es el manual de instrucciones de la skill. El modelo lo lee cuando se carga la skill:

```markdown
# Git Operations

## When to Use
- User asks to check, commit, or push code changes
- You need to inspect file history or diffs
- Resolving merge conflicts

## Available Tools
- `git_status` — Show working tree status
- `git_diff` — Show changes (staged or unstaged)
- `git_commit` — Commit staged changes with a message
- `git_push` — Push commits to remote
- `git_log` — Show recent commit history

## Conventions
- Always run `git_status` before committing
- Use conventional commit messages (feat:, fix:, docs:)
- Never force-push without explicit user approval
- Commit message should be under 72 characters

## Examples
To commit and push:
1. `git_status` → review what's changed
2. `git_diff` → verify the changes are correct
3. `git_commit("feat: add user auth middleware")`
4. `git_push`
```

Este formato le da al modelo suficiente contexto para usar la skill correctamente sin tener que incrustar todo ese conocimiento en las descripciones de las herramientas.

## El patrón del menú de skills

En lugar de cargar todas las herramientas al arrancar, presenta al modelo un menú compacto de las skills disponibles. El modelo lee el menú, decide qué skill necesita y la carga:

```python
SKILL_MENU = """Available skills (use load_skill to activate):

- file_ops: Read, write, search, and edit files in the workspace
- git: Version control — status, diff, commit, push, log
- web: HTTP requests, web search, URL fetching
- shell: Execute shell commands in a sandbox
- database: SQL queries, schema inspection, migrations
- calendar: Create events, check availability, manage schedules
- email: Read inbox, send emails, search messages
- image: Generate and analyze images
"""
```

El menú cuesta ~150 tokens. Cargar una skill añade su SKILL.md (~500–1000 tokens) y sus esquemas de herramientas (~200–800 tokens). Comparado con cargar todas las herramientas desde el principio:

```
Strategy                    Tokens (8 skills, ~60 tools)
────────────────────────────────────────────────────────
All tools upfront:          ~12,000 tokens (always)
Skill menu + 2 loaded:      ~150 + ~2,400 = ~2,550 tokens
────────────────────────────────────────────────────────
Savings:                    ~9,450 tokens per turn (78%)
```

En una sesión de 30 turnos, eso supone ~280K tokens ahorrados: dinero real con los precios de la API.

## Implementación del registro de skills

```python
import json
from pathlib import Path
from dataclasses import dataclass, field

@dataclass
class Skill:
    name: str
    description: str
    doc: str                           # Contents of SKILL.md
    tools: list[dict] = field(default_factory=list)        # Tool schemas
    handlers: dict = field(default_factory=dict)            # name → callable

class SkillRegistry:
    """Registry with on-demand skill loading."""

    def __init__(self, skills_dir: str):
        self.skills_dir = Path(skills_dir)
        self._catalog: dict[str, Skill] = {}
        self._active: dict[str, Skill] = {}
        self._scan()

    def _scan(self):
        """Scan the skills directory and build the catalog."""
        for skill_dir in self.skills_dir.iterdir():
            if not skill_dir.is_dir():
                continue
            skill_md = skill_dir / "SKILL.md"
            schema_file = skill_dir / "schema.json"
            if not skill_md.exists():
                continue

            doc = skill_md.read_text()
            # Extract first line after "# " as description
            first_heading = ""
            for line in doc.splitlines():
                if line.startswith("# "):
                    first_heading = line[2:].strip()
                    break

            schemas = []
            if schema_file.exists():
                schemas = json.loads(schema_file.read_text())

            self._catalog[skill_dir.name] = Skill(
                name=skill_dir.name,
                description=first_heading,
                doc=doc,
                tools=schemas,
            )

    def get_menu(self) -> str:
        """Generate the skill menu for the model."""
        lines = ["Available skills (use load_skill to activate):\n"]
        for name, skill in self._catalog.items():
            status = " [loaded]" if name in self._active else ""
            lines.append(f"- {name}: {skill.description}{status}")
        return "\n".join(lines)

    def load_skill(self, name: str) -> str:
        """Load a skill, making its tools available."""
        if name not in self._catalog:
            return f"Error: Unknown skill '{name}'. Check the skill menu."
        if name in self._active:
            return f"Skill '{name}' is already loaded."

        skill = self._catalog[name]
        self._active[name] = skill
        tool_names = [t["name"] for t in skill.tools]
        return (
            f"Loaded skill '{name}' with {len(skill.tools)} tools: "
            f"{', '.join(tool_names)}\n\n"
            f"Documentation:\n{skill.doc}"
        )

    def unload_skill(self, name: str) -> str:
        """Unload a skill to free up context space."""
        if name not in self._active:
            return f"Skill '{name}' is not loaded."
        del self._active[name]
        return f"Unloaded skill '{name}'."

    def get_active_schemas(self) -> list[dict]:
        """Return tool schemas for all currently loaded skills."""
        schemas = []
        for skill in self._active.values():
            schemas.extend(skill.tools)
        # Always include the meta-tools
        schemas.append({
            "name": "load_skill",
            "description": "Load a skill by name to activate its tools",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Skill name from the menu"}
                },
                "required": ["name"],
            },
        })
        return schemas

    def dispatch(self, tool_name: str, arguments: dict) -> str:
        """Dispatch a tool call to the appropriate skill handler."""
        if tool_name == "load_skill":
            return self.load_skill(arguments["name"])

        for skill in self._active.values():
            if tool_name in skill.handlers:
                try:
                    return str(skill.handlers[tool_name](**arguments))
                except Exception as e:
                    return f"Error: {type(e).__name__}: {e}"

        return f"Error: Tool '{tool_name}' not found. Is the skill loaded?"
```

## Harness ligero + skills densas

El principio de arquitectura: el harness debe ser ligero; solo el bucle agéntico, el ensamblaje de contexto y el registro de skills. Toda la inteligencia específica del dominio vive en las skills:

```
┌─────────────────────────────────────────────────┐
│  Harness (thin)                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Agentic  │  │  Context   │  │    Skill     │ │
│  │  Loop    │  │ Assembler  │  │  Registry    │ │
│  └──────────┘  └───────────┘  └──────────────┘ │
└─────────────────────┬───────────────────────────┘
                      │ loads on demand
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
┌─────────┐    ┌───────────┐    ┌───────────┐
│  git    │    │  file_ops  │    │  web      │
│  skill  │    │  skill     │    │  skill    │
└─────────┘    └───────────┘    └───────────┘
```

Esta separación tiene ventajas prácticas:
- **Las skills son portables**: una skill escrita para un harness funciona en otro
- **Las skills se pueden testear**: prueba las herramientas y los esquemas de forma aislada
- **Las skills son componibles**: el modelo descubre por sí mismo cómo combinar las skills cargadas
- **El harness sigue siendo simple**: añades capacidades agregando skills, no modificando el núcleo

## Errores comunes

- **Cargar todas las skills al arrancar**: anula el propósito del sistema de skills. Usa el patrón del menú y carga bajo demanda.
- **Skills monolíticas**: una skill "para todo" con 30 herramientas no es más que el problema de cargar todas las herramientas desde el principio, disfrazado. Mantén las skills enfocadas: de 3 a 8 herramientas cada una.
- **Falta el SKILL.md**: las herramientas sin documentación obligan al modelo a adivinar las convenciones. El SKILL.md no es opcional; es el cerebro de la skill.
- **Sin mecanismo de descarga**: si el modelo carga cinco skills y no puede descargarlas, el contexto se llena rápidamente. Proporciona siempre `unload_skill` junto a `load_skill`.
- **Confundir nombres de skills y de herramientas**: si una skill se llama `git` y contiene una herramienta llamada `git`, el modelo puede intentar llamar al nombre de la skill como si fuera una herramienta. Usa nombres distintos: la skill `git`, las herramientas `git_status`, `git_diff`, etc.

## Lecturas adicionales

- [OpenClaw Skills Architecture](https://docs.openclaw.ai) — Un sistema de skills en producción con menús de skills y carga bajo demanda
- [Anthropic: Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — Buenas prácticas de diseño de herramientas que también se aplican a las skills
- [Model Context Protocol: Tools](https://modelcontextprotocol.io/) — El estándar abierto para la interoperabilidad de herramientas y skills entre distintos harness
