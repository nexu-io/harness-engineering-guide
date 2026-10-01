---
author: Nexu
---

# ¿Qué es un harness?

> **Idea clave:** Los modelos se están convirtiendo en commodities: GPT, Claude y Gemini convergen en capacidades. El harness es la verdadera ventaja competitiva: cómo orquestas el contexto, la memoria, las herramientas y el ciclo de vida del agente determina si lanzas un chatbot o un agente de producción.

## Definición

Un **harness** es la capa de runtime que envuelve un modelo de lenguaje desnudo y lo convierte en un **agente**: un sistema autónomo capaz de percibir su entorno, tomar decisiones y ejecutar acciones a lo largo de varios pasos para alcanzar sus objetivos.

Es importante distinguir aquí "agente" de su uso anterior. En 2023-2024, "agente" solía significar *un modelo más herramientas*: le dabas a GPT una herramienta de búsqueda web y lo llamabas agente. Los agentes a los que apunta la ingeniería de harness son fundamentalmente más complejos:

| Componente | "Agente" de 2023 | Agente de la era del harness |
|-----------|-------------|-------------------|
| Modelo | ✅ LLM | ✅ LLM |
| Herramientas | ✅ Llamada a funciones | ✅ Sistema de herramientas dinámico |
| Memoria | ❌ Sin estado | ✅ Memoria persistente entre sesiones |
| Gestión de contexto | ❌ Ingenua | ✅ Ensamblaje de contexto basado en prioridades |
| Orquestación | ❌ Un solo turno | ✅ Bucle agéntico con recuperación de errores |
| Entorno de ejecución | ❌ Proceso del host | ✅ Runtime aislado en sandbox |
| Guardrails | ❌ Mínimos | ✅ Modelo de permisos + límites de confianza |

El harness es la capa de ingeniería que aporta todo esto. Sin él, tienes un chatbot que puede llamar a funciones. Con él, tienes un agente capaz de navegar por una base de código, corregir bugs en varios archivos y hacer commit del resultado, todo de forma autónoma.

## Anatomía de un harness

Todo harness, sin importar su implementación, tiene cuatro subsistemas:

```
┌──────────────────────────────────────────────┐
│                   HARNESS                     │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Agentic  │  │   Tool   │  │  Memory &  │  │
│  │   Loop   │  │  System  │  │  Context   │  │
│  └──────────┘  └──────────┘  └────────────┘  │
│                                               │
│  ┌────────────────────────────────────────┐   │
│  │            Guardrails                  │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

1. **Bucle agéntico** (Agentic Loop) — El ciclo pensar → actuar → observar que impulsa todo el comportamiento del agente. El modelo razona, invoca una herramienta, observa el resultado y repite el ciclo hasta completar la tarea.

2. **Sistema de herramientas** (Tool System) — El registro de capacidades disponibles para el agente: E/S de archivos, ejecución en shell, búsqueda web, llamadas a API. Las herramientas pueden ser estáticas (cargadas al inicio) o dinámicas (cargadas bajo demanda mediante menús de skills).

3. **Memoria y contexto** (Memory & Context) — El sistema que decide lo que el modelo puede *ver*. Abarca tres aspectos distintos:
   - **Contexto** — lo que entra en la llamada a la API actual (prompt de sistema, herramientas, archivos, historial de conversación)
   - **Memoria** — lo que persiste entre sesiones (MEMORY.md, registros diarios, preferencias aprendidas)
   - **Sesión** — el límite de una sola ejecución del agente (historial de mensajes, resultados de herramientas, estado temporal)

4. **Guardrails** — Límites de permisos, aplicación del sandbox y restricciones de seguridad. Qué puede y qué no puede hacer el agente, y cómo evitar que la inyección de prompts eluda esos límites.

Estos cuatro subsistemas se exploran en profundidad en la sección [Conceptos clave](/es/guide/agentic-loop).

## Un ejemplo mínimo

El harness más simple es un bucle. Este no está listo para producción, pero es estructuralmente correcto:

```python
import openai

client = openai.OpenAI()
tools = [{"type": "function", "function": {"name": "read_file", ...}}]

messages = [{"role": "system", "content": "You are a coding agent."}]
messages.append({"role": "user", "content": user_input})

# The agentic loop
while True:
    response = client.chat.completions.create(
        model="gpt-4o", messages=messages, tools=tools
    )
    msg = response.choices[0].message
    messages.append(msg)

    if not msg.tool_calls:
        print(msg.content)  # Done — model has no more actions
        break

    for call in msg.tool_calls:
        result = execute_tool(call.function.name, call.function.arguments)
        messages.append({
            "role": "tool",
            "tool_call_id": call.id,
            "content": result
        })
    # Loop back — model sees the tool results and decides next action
```

Todo harness, desde un script de 50 líneas hasta Claude Code, es una variación de este bucle. La complejidad viene de lo que construyes *a su alrededor*: ensamblaje de contexto, persistencia de la memoria, orquestación de skills, recuperación de errores y aislamiento en sandbox.

## Harness vs. framework vs. runtime

Estos tres términos se confunden a menudo. Son capas distintas:

| Término | Función | Ejemplos |
|------|------|----------|
| **Harness** | El código de orquestación que envuelve un modelo para convertirlo en un agente | Claude Code, Codex CLI, OpenClaw |
| **Framework** | Una biblioteca que proporciona los bloques de construcción para crear harness | LangChain, CrewAI, AutoGen |
| **Runtime** | El proceso persistente que mantiene un harness en ejecución, gestiona su ciclo de vida y lo conecta con el mundo exterior | Runtime de OpenClaw, contenedor Docker, servicio systemd |

Un framework te ayuda a *construir* un harness. Un runtime *aloja* un harness: lo mantiene vivo, gestiona la reconexión, programa los heartbeats y le enruta los mensajes. El harness en sí es la lógica de orquestación: cómo se ensambla el contexto, qué herramientas se cargan y cómo se comporta el bucle agéntico.

## Errores comunes

- **Culpar al modelo de los problemas del harness** — Cuando un agente falla, normalmente se trata de un problema de contexto (se cargaron los archivos equivocados, faltan instrucciones) o de herramientas (esquema incorrecto, errores silenciosos), no de un problema de capacidad del modelo.
- **Sobreingeniería desde el primer día** — Empieza con el bucle mínimo de arriba. Añade memoria cuando necesites estado entre sesiones. Añade skills cuando tengas demasiadas herramientas. Añade guardrails cuando pases a producción.
- **Tratar la ventana de contexto como si fuera ilimitada** — El modelo solo puede razonar sobre lo que hay en su contexto. Si la información crítica no se ensambla en el prompt, a efectos prácticos no existe.

## Lecturas adicionales

- [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/) — La entrada de blog que le dio nombre a la disciplina
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Los patrones de Anthropic para agentes en producción
