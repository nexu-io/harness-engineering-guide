---
author: Nexu
---

# Sistema de herramientas

> **Idea clave:** Las herramientas son las manos del agente. El modelo razona; las herramientas actúan. Pero el diseño del sistema de herramientas (cómo se registran, describen, despachan y gestionan) tiene más impacto en la calidad del agente que el propio modelo.

## ¿Qué es una herramienta?

Una herramienta es una función que el modelo puede invocar por su nombre con argumentos estructurados. El modelo ve un **esquema** (nombre, descripción, tipos de parámetros); el harness se encarga de la **ejecución** (llamar realmente a la función y devolver el resultado).

```python
# What the model sees (tool schema)
{
    "name": "read_file",
    "description": "Read the contents of a file at the given path",
    "parameters": {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "File path to read"}
        },
        "required": ["path"]
    }
}

# What the harness executes (tool implementation)
def read_file(path: str) -> str:
    with open(path, 'r') as f:
        return f.read()
```

El modelo nunca ve ni ejecuta la implementación. Solo conoce el esquema. Esta separación es fundamental: significa que puedes cambiar cómo funciona una herramienta sin cambiar el comportamiento del modelo, y que puedes restringir lo que hace la herramienta sin que el modelo lo sepa.

## Registro de herramientas

El registro de herramientas es el componente del harness que asocia los nombres de las herramientas con sus esquemas e implementaciones:

```python
class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, name: str, schema: dict, handler: Callable):
        self._tools[name] = Tool(name=name, schema=schema, handler=handler)

    def get_schemas(self) -> list[dict]:
        """Return schemas for the LLM API call."""
        return [t.schema for t in self._tools.values()]

    def dispatch(self, name: str, arguments: dict) -> str:
        """Execute a tool call and return the result as a string."""
        tool = self._tools.get(name)
        if not tool:
            return f"Error: Unknown tool '{name}'"
        try:
            result = tool.handler(**arguments)
            return str(result)
        except Exception as e:
            return f"Error: {type(e).__name__}: {e}"
```

Fíjate en que `dispatch` siempre devuelve un string, incluso en caso de error. Es intencionado: el modelo necesita ver los mensajes de error para poder adaptar su enfoque, en lugar de que todo falle en silencio.

## Herramientas estáticas vs. dinámicas

Las **herramientas estáticas** se cargan al arrancar y están siempre disponibles. Esto funciona con conjuntos pequeños de herramientas (5-15), pero se viene abajo a escala: 100 herramientas significan 100 esquemas en cada llamada a la API, lo que consume tokens y confunde al modelo.

Las **herramientas dinámicas** (también llamadas **carga de skills**) resuelven esto presentando al modelo un menú de categorías de herramientas disponibles y cargando herramientas concretas solo cuando se solicitan:

```python
# Instead of loading all 100 tools, show a menu
SKILL_MENU = """
Available skills (use load_skill to activate):
- file_ops: Read, write, search files
- git: Git operations (status, diff, commit, push)
- web: HTTP requests, web search
- database: SQL queries, schema inspection
"""

# The model calls load_skill("git") and then gets git-specific tools
def load_skill(skill_name: str) -> str:
    tools = skill_registry.load(skill_name)
    active_tools.extend(tools)
    return f"Loaded {len(tools)} tools: {[t.name for t in tools]}"
```

El ahorro de tokens es enorme. Un menú de skills puede costar 200 tokens; cargar todas las herramientas de entrada puede costar más de 5000.

## Calidad de las descripciones de herramientas

La capacidad del modelo para usar bien las herramientas depende casi por completo de la calidad de sus descripciones. Una descripción vaga lleva a un mal uso; una precisa guía hacia el comportamiento correcto:

```python
# Bad — the model will guess at behavior
{"name": "search", "description": "Search for things"}

# Good — unambiguous, includes format and constraints
{
    "name": "search_files",
    "description": "Search for files matching a glob pattern in the workspace. "
                   "Returns a list of relative file paths, one per line. "
                   "Max 100 results. Use '**/*.py' for recursive Python file search.",
    "parameters": {
        "type": "object",
        "properties": {
            "pattern": {
                "type": "string",
                "description": "Glob pattern (e.g., '*.md', 'src/**/*.ts')"
            }
        },
        "required": ["pattern"]
    }
}
```

Principios clave para las descripciones de herramientas:
- Explica lo que la herramienta **hace**, no lo que **es**
- Especifica el **formato de salida** (JSON, texto plano, uno por línea)
- Incluye las **restricciones** (máximo de resultados, límites de tamaño de archivo)
- Añade **ejemplos** para los parámetros que no sean obvios

## Patrones de composición de herramientas

Las capacidades complejas de un agente suelen surgir de componer herramientas simples, más que de construir herramientas complejas:

| Patrón | Ejemplo |
|---------|---------|
| **Secuencial** | `read_file` → `edit_file` → `run_tests` |
| **Fan-out** | Leer 5 archivos en paralelo y luego sintetizar |
| **Condicional** | `list_files` → decidir a cuál aplicar `read_file` |
| **Iterativo** | `run_tests` → `edit_file` → `run_tests` (hasta que pasen) |

El harness no necesita implementar estos patrones: el modelo los descubre de forma natural a través del bucle agéntico. Tu trabajo es proporcionar las herramientas atómicas adecuadas y dejar que el modelo las componga.

## MCP: Model Context Protocol

[MCP](https://modelcontextprotocol.io/) es un estándar abierto para exponer herramientas a los agentes a través de una capa de transporte (stdio, HTTP SSE). En lugar de codificar las herramientas directamente en tu harness, MCP te permite conectarte a servidores de herramientas externos:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

MCP es importante porque desacopla la implementación de las herramientas del harness. Una herramienta escrita para un harness funciona en cualquier harness compatible con MCP: Claude Desktop, OpenClaw, Cursor y otros.

## Errores comunes

- **Demasiadas herramientas a la vez** — Más de ~20 herramientas activas degradan el rendimiento del modelo. Usa la carga dinámica.
- **Fallos silenciosos** — Las herramientas que devuelven strings vacíos ante un error dejan al modelo adivinando. Devuelve siempre mensajes de error explícitos.
- **Resultados de herramientas que faltan** — Si olvidas añadir el resultado de una herramienta al historial de mensajes, la llamada a la API fallará. Cada llamada a herramienta debe tener su resultado correspondiente.
- **Tipos de retorno inconsistentes** — Si `read_file` unas veces devuelve el contenido y otras un dict de error, el modelo no puede interpretar la salida de forma fiable. Estandariza el formato de tus resultados.

## Lecturas adicionales

- [Anthropic: Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — Patrones de uso de herramientas en producción
- [Model Context Protocol](https://modelcontextprotocol.io/) — El estándar abierto para las herramientas de los agentes
