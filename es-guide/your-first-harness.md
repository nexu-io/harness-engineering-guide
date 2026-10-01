---
author: Nexu
---

# Tu primer harness

> **Idea clave:** Un harness no es más que un bucle: llamar al modelo, ejecutar las llamadas a herramientas, devolverle los resultados y repetir. Puedes construir uno funcional en menos de 50 líneas de Python. Entender este bucle desmitifica cualquier framework de agentes que exista.

La mayoría de los tutoriales de agentes empiezan con un framework: LangChain, CrewAI, AutoGen. Pero los frameworks ocultan el mecanismo. Construir un harness desde cero te enseña exactamente lo que ocurre: el bucle agéntico, el ensamblaje de contexto y el proceso de toma de decisiones del modelo. Una vez que lo entiendes, todos los frameworks se vuelven transparentes.

## El harness completo

Aquí tienes un harness totalmente funcional con dos herramientas (leer un archivo y escribir un archivo). Cópialo, pégalo y ejecútalo.

### Requisitos previos

```bash
pip install openai
export OPENAI_API_KEY="sk-your-key-here"
```

### El código

```python
#!/usr/bin/env python3
"""A complete agent harness in ~50 lines. Run: python harness.py"""

import json
import os
from openai import OpenAI

client = OpenAI()
MODEL = "gpt-4o-mini"  # Cheap and fast for learning
MAX_TURNS = 15

# --- System prompt ---
SYSTEM = """You are a helpful file assistant. You can read and write files.
When asked to work with files, use the tools provided.
Always confirm what you did after completing a task."""

# --- Tool definitions ---
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a file at the given path",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"}
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file (creates or overwrites)",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"},
                    "content": {"type": "string", "description": "Content to write"}
                },
                "required": ["path", "content"]
            }
        }
    }
]

# --- Tool execution ---
def execute_tool(name: str, args: dict) -> str:
    try:
        if name == "read_file":
            with open(args["path"], "r") as f:
                return f.read()
        elif name == "write_file":
            os.makedirs(os.path.dirname(args["path"]) or ".", exist_ok=True)
            with open(args["path"], "w") as f:
                f.write(args["content"])
            return f"Wrote {len(args['content'])} chars to {args['path']}"
        else:
            return f"Error: Unknown tool '{name}'"
    except Exception as e:
        return f"Error: {e}"

# --- The tool loop ---
def run(user_message: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user_message}
    ]

    for turn in range(MAX_TURNS):
        response = client.chat.completions.create(
            model=MODEL, messages=messages, tools=TOOLS
        )
        msg = response.choices[0].message
        messages.append(msg)

        # No tool calls → model is done
        if not msg.tool_calls:
            return msg.content

        # Execute each tool call
        for tc in msg.tool_calls:
            args = json.loads(tc.function.arguments)
            print(f"  🔧 {tc.function.name}({args})")
            result = execute_tool(tc.function.name, args)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result
            })

    return "Max turns reached."

# --- Main ---
if __name__ == "__main__":
    print("🤖 File Agent (type 'quit' to exit)")
    while True:
        user_input = input("\nYou: ").strip()
        if user_input.lower() in ("quit", "exit"):
            break
        response = run(user_input)
        print(f"\nAgent: {response}")
```

### Pruébalo

```bash
python harness.py
```

```
🤖 File Agent (type 'quit' to exit)

You: Create a file called hello.txt with a haiku about programming

  🔧 write_file({'path': 'hello.txt', 'content': 'Semicolons fall\nLike rain upon the server\nCompile error: none'})

Agent: I've created hello.txt with a programming haiku!

You: Read it back to me

  🔧 read_file({'path': 'hello.txt'})

Agent: Here's the content of hello.txt:
"Semicolons fall / Like rain upon the server / Compile error: none"
```

## Anatomía del harness

El harness completo se reduce a cuatro componentes:

```
┌────────────────────────────────┐
│         System Prompt          │  ← Who the agent is
├────────────────────────────────┤
│        Tool Definitions        │  ← What it can do (JSON schema)
├────────────────────────────────┤
│        Tool Execution          │  ← How tools actually run
├────────────────────────────────┤
│          Tool Loop             │  ← The cycle: think → act → observe
└────────────────────────────────┘
```

**Prompt de sistema**: Define la personalidad y las restricciones del agente. Es la pieza más barata y de mayor impacto: cambiar una sola frase aquí puede alterar por completo el comportamiento.

**Definiciones de herramientas**: Esquemas JSON que el modelo lee para entender qué herramientas existen. El modelo nunca ve tu código Python, solo las descripciones y los esquemas de parámetros.

**Ejecución de herramientas**: Tu código, que es el que realmente lleva a cabo las acciones. El modelo genera JSON estructurado; tú lo analizas y haces el trabajo real.

**Bucle de herramientas**: El orquestador. Llama al modelo, comprueba si hay llamadas a herramientas, las ejecuta y le devuelve los resultados. Se repite hasta que el modelo responde con texto plano.

## Añadir una tercera herramienta

¿Quieres añadir comandos de shell? Solo tienes que agregar una definición de herramienta y un manejador:

```python
# Add to TOOLS list:
{
    "type": "function",
    "function": {
        "name": "run_shell",
        "description": "Run a shell command and return stdout/stderr",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to run"}
            },
            "required": ["command"]
        }
    }
}

# Add to execute_tool():
elif name == "run_shell":
    import subprocess
    r = subprocess.run(args["command"], shell=True, capture_output=True, text=True, timeout=30)
    return r.stdout + r.stderr
```

El bucle no cambia. El modelo descubre y usa la nueva herramienta automáticamente.

## Cambiar de modelo

El harness es agnóstico respecto al modelo. Puedes pasar a Claude de Anthropic cambiando el cliente:

```python
from anthropic import Anthropic

client = Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    system=SYSTEM,
    messages=messages,
    tools=[{
        "name": t["function"]["name"],
        "description": t["function"]["description"],
        "input_schema": t["function"]["parameters"]
    } for t in TOOLS]
)

# Parse tool calls from response.content blocks
for block in response.content:
    if block.type == "tool_use":
        result = execute_tool(block.name, block.input)
```

El mismo bucle. Las mismas herramientas. Otro modelo.

## Qué falta (y qué viene después)

Este harness funciona, pero los agentes en producción necesitan más:

| Funcionalidad | Este harness | Harness de producción |
|---------|-------------|-------------------|
| Memoria | Ninguna (sin estado) | MEMORY.md + registros diarios |
| Gestión del contexto | Todo el historial | Ventana basada en prioridades |
| Recuperación de errores | try/catch básico | Reintento + escalado |
| Seguridad | Ninguna | Ejecución en sandbox |
| Carga de herramientas | Todas a la vez | Skills bajo demanda |

Cada uno de estos temas se trata en el resto de esta guía.

## Errores comunes

- **Olvidar añadir el mensaje del asistente** — Si no agregas `msg` a `messages` antes de los resultados de las herramientas, el modelo pierde el hilo de lo que pidió. Añade siempre primero la respuesta completa del asistente.
- **Convertir mal a cadena los resultados de las herramientas** — Los resultados de las herramientas deben ser cadenas. Si tu herramienta devuelve un dict, aplícale `json.dumps()`. Devolver un objeto Python sin convertir hará que falle.
- **Sin límite de iteraciones** — Sin `MAX_TURNS`, un modelo confundido puede quedarse en un bucle infinito quemando tokens. Ponle siempre un tope.

## Lecturas adicionales

- [Guía de Function Calling de OpenAI](https://platform.openai.com/docs/guides/function-calling) — Documentación oficial sobre las definiciones de herramientas
- [Guía de uso de herramientas de Anthropic](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — El equivalente para Claude
- [Artículo de ReAct](https://arxiv.org/abs/2210.03629) — La base académica de los bucles de herramientas
