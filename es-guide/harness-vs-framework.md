---
author: Nexu
---

# Harness vs. framework

> **Idea clave:** Un framework añade cientos de dependencias y capas de abstracción para una tarea que quizá solo necesite 50 líneas de Python. Pero programar a mano una orquestación multiagente desde cero cuando CrewAI ya la resuelve te hace perder semanas. La clave es ajustar la herramienta al problema, no recurrir por defecto a la opción más popular.

Un harness es código que escribes desde cero para envolver un modelo con herramientas, memoria y contexto. Un **framework** es una biblioteca que proporciona abstracciones para construir agentes: LangChain, CrewAI, AutoGen y otros. Elegir entre ambos no consiste en saber cuál es "mejor", sino en saber cuándo compensa cada uno.

## Árbol de decisión

```
Need an agent? 
│
├── Is it a single-model loop with < 5 tools?
│   └── YES → Write a raw harness (50-200 lines)
│
├── Do you need multi-agent orchestration out of the box?
│   └── YES → Consider CrewAI or AutoGen
│
├── Do you need complex RAG pipelines with vector stores?
│   └── YES → Consider LangChain
│
├── Is this a production product where you need full control?
│   └── YES → Write a raw harness (own every line)
│
├── Are you prototyping / exploring quickly?
│   └── YES → Framework is fine, expect to rewrite later
│
└── Do you need to understand what's actually happening?
    └── YES → Write a raw harness first, then decide
```

## La misma tarea, de tres maneras

**Tarea**: Leer un archivo CSV, analizarlo y escribir un resumen en un archivo Markdown.

### Harness puro (~60 líneas)

```python
import json, csv, io
from openai import OpenAI

client = OpenAI()

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file's contents",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"}
                },
                "required": ["path", "content"]
            }
        }
    }
]

def execute(name, args):
    if name == "read_file":
        return open(args["path"]).read()
    elif name == "write_file":
        open(args["path"], "w").write(args["content"])
        return f"Written to {args['path']}"

def run(task):
    messages = [
        {"role": "system", "content": "You analyze data files and write reports."},
        {"role": "user", "content": task}
    ]
    for _ in range(10):
        resp = client.chat.completions.create(
            model="gpt-4o-mini", messages=messages, tools=TOOLS
        )
        msg = resp.choices[0].message
        messages.append(msg)
        if not msg.tool_calls:
            return msg.content
        for tc in msg.tool_calls:
            result = execute(tc.function.name, json.loads(tc.function.arguments))
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
    return "Done"

run("Read data.csv, analyze the trends, and write a summary to report.md")
```

**Dependencias**: `openai` (1 paquete)
**Líneas de código**: ~60
**Tú controlas**: todo

### LangChain (~40 líneas, pero...)

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.tools import tool

@tool
def read_file(path: str) -> str:
    """Read a file's contents"""
    return open(path).read()

@tool
def write_file(path: str, content: str) -> str:
    """Write content to a file"""
    open(path, "w").write(content)
    return f"Written to {path}"

llm = ChatOpenAI(model="gpt-4o-mini")
prompt = ChatPromptTemplate.from_messages([
    ("system", "You analyze data files and write reports."),
    ("human", "{input}"),
    MessagesPlaceholder("agent_scratchpad"),
])

agent = create_openai_tools_agent(llm, [read_file, write_file], prompt)
executor = AgentExecutor(agent=agent, tools=[read_file, write_file], verbose=True)

executor.invoke({"input": "Read data.csv, analyze trends, write summary to report.md"})
```

**Dependencias**: `langchain`, `langchain-openai`, `langchain-core`, más sus dependencias transitivas (~50+ paquetes)
**Líneas de código**: ~40 (pero las capas de abstracción que hay debajo suman miles)
**Tú controlas**: las definiciones de herramientas y la plantilla del prompt. Todo lo demás es de LangChain.

### CrewAI (~35 líneas)

```python
from crewai import Agent, Task, Crew
from crewai_tools import FileReadTool, FileWriterTool

analyst = Agent(
    role="Data Analyst",
    goal="Analyze CSV data and produce insightful reports",
    backstory="You are an expert data analyst.",
    tools=[FileReadTool(), FileWriterTool()],
    verbose=True
)

task = Task(
    description="Read data.csv, analyze the trends, write a summary to report.md",
    expected_output="A markdown report with key findings",
    agent=analyst
)

crew = Crew(agents=[analyst], tasks=[task], verbose=True)
crew.kickoff()
```

**Dependencias**: `crewai`, `crewai-tools`, más sus dependencias (~80+ paquetes)
**Líneas de código**: ~35
**Tú controlas**: los roles de los agentes y las descripciones de las tareas. El flujo de ejecución es de CrewAI.

## La matriz de compromisos

| Dimensión | Harness puro | LangChain | CrewAI |
|-----------|------------|-----------|--------|
| Líneas de código | Más | Menos | Aún menos |
| Dependencias | 1 | ~50 | ~80 |
| Depuración | Fácil (es tu código) | Difícil (trazas de pila profundas) | Media |
| Flexibilidad | Total | Limitada por las abstracciones | Solo basada en roles |
| Multiagente | Lo construyes tú | Posible, pero complejo | Integrado |
| Curva de aprendizaje | Entender la API del modelo | Aprender los conceptos de LangChain | Aprender los conceptos de CrewAI |
| Ruta de actualización | Cambias lo que quieras | Esperar a las actualizaciones de LangChain | Esperar a las actualizaciones de CrewAI |
| Preparación para producción | Lo decides tú | Depende de la estabilidad de la versión | Más reciente, menos probado en el mundo real |

## El costo oculto de los frameworks

### 1. Depurar cajas negras

Cuando algo falla en un harness puro, revisas tus 60 líneas. Cuando algo falla en LangChain:

```
File "langchain/agents/openai_tools/base.py", line 147, in _plan
File "langchain_core/runnables/base.py", line 534, in invoke
File "langchain/chains/base.py", line 89, in __call__
File "langchain_core/callbacks/manager.py", line 442, in _handle_event
...
```

Estás depurando la arquitectura de otra persona.

### 2. Quedar atrapado en la abstracción

¿Quieres añadir streaming? ¿Memoria personalizada? ¿Un patrón de llamadas a herramientas no estándar? En un harness puro, simplemente lo escribes. En un framework, trabajas dentro de sus puntos de extensión o haces un fork de la biblioteca.

### 3. Cambios constantes de versión

LangChain ha tenido varias reestructuraciones importantes de su API. El código escrito hace 6 meses puede no funcionar hoy. Un harness puro que solo usa el paquete `openai` lleva años siendo estable.

## Cuándo ganan los frameworks

Los frameworks no son malos. Ayudan de verdad cuando:

- **Estás prototipando** — Consigue que algo funcione en una tarde para validar una idea. Reescríbelo después.
- **Orquestación multiagente** — El modelo agente-tarea de CrewAI es realmente bueno para flujos de trabajo complejos con múltiples roles.
- **Pipelines de RAG** — Los cargadores de documentos, los divisores de texto y las integraciones con almacenes vectoriales de LangChain te ahorran trabajo real.
- **No te importa la infraestructura interna** — Si el agente es una pequeña parte de un producto más grande y solo necesitas que funcione.

## El enfoque híbrido

Muchos equipos en producción empiezan con un framework y migran a un harness puro:

```
Week 1:  LangChain prototype → "It works!"
Week 4:  Hit a limitation → "Why can't I do X?"
Week 8:  Fork/override half the framework → "I'm fighting the framework"
Week 12: Rewrite as raw harness → "This is 200 lines and does exactly what I need"
```

Esto está bien. El framework te enseñó lo que necesitas. El harness te da el control.

## Errores comunes

- **Empezar con un framework antes de entender lo básico** — No puedes depurar lo que no entiendes. Construye un harness puro al menos una vez, aunque nunca lo uses en producción.
- **Elegir según las estrellas de GitHub** — Estrellas ≠ encaje. Un framework con 80K estrellas diseñado para pipelines de RAG no te ayudará a construir un agente de programación.
- **Miedo a "reinventar la rueda"** — Aquí la rueda son 50 líneas de Python. No es tanta rueda.

## Lecturas adicionales

- [Documentación de LangChain](https://python.langchain.com/) — El framework más popular
- [Documentación de CrewAI](https://docs.crewai.com/) — Orquestación multiagente
- [AutoGen](https://microsoft.github.io/autogen/) — El framework multiagente de Microsoft
- [Tu primer harness](/es/guide/your-first-harness) — Construye tú mismo la versión pura
