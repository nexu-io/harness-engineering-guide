---
author: Nexu
---

# Bucle agéntico

> **Idea clave:** Todo agente es un bucle: pensar, actuar, observar, repetir. El bucle en sí es trivial. Lo que lo hace apto para producción es cómo gestionas los casos límite: cuándo parar, qué hacer cuando fallan las herramientas y cómo evitar ciclos infinitos.

## El patrón

El bucle agéntico (también llamado patrón ReAct: Reason + Act, es decir, razonar + actuar) es el ciclo de ejecución fundamental de cualquier agente de IA. El modelo genera una respuesta, opcionalmente invoca una o más herramientas, observa los resultados y repite el ciclo hasta terminar la tarea.

```
┌─────────────┐
│   Reason    │◄──────────────────┐
│  (LLM call) │                   │
└──────┬──────┘                   │
       │                          │
       ▼                          │
  ┌─────────┐    No tools    ┌────┴─────┐
  │  Tools? ├───────────────►│  Output  │
  └────┬────┘                └──────────┘
       │ Yes
       ▼
  ┌─────────┐
  │ Execute │
  │  tools  │
  └────┬────┘
       │
       ▼
  ┌─────────┐
  │ Observe │
  │ results ├─────────────────────┘
  └─────────┘
```

Esto es distinto de una simple API de llamada a herramientas. Una única llamada a herramienta es de un solo disparo: el modelo dice "llama a esta función" y tú devuelves el resultado. Un **bucle agéntico** ejecuta ese proceso repetidamente: el modelo ve el resultado, decide que necesita más información, llama a otra herramienta, ve *ese* resultado y continúa hasta tener suficiente contexto para producir una respuesta final.

## Implementación

Un bucle agéntico mínimo en Python:

```python
def agentic_loop(messages: list, tools: list, max_turns: int = 25) -> str:
    """Run the agentic loop until the model produces a final text response."""
    for turn in range(max_turns):
        response = llm.chat(messages=messages, tools=tools)
        assistant_msg = response.choices[0].message
        messages.append(assistant_msg)

        # Exit condition: no tool calls means the model is done
        if not assistant_msg.tool_calls:
            return assistant_msg.content

        # Execute each tool call and append results
        for tool_call in assistant_msg.tool_calls:
            result = dispatch_tool(tool_call)
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": str(result)
            })

    raise AgentLoopError(f"Agent did not complete within {max_turns} turns")
```

El parámetro `max_turns` es crítico. Sin él, un modelo confundido entrará en un bucle infinito: llamará a la misma herramienta una y otra vez, obtendrá el mismo error y quemará tokens. Es el guardrail más simple y siempre debería estar presente.

## Llamadas a herramientas en paralelo

Las API modernas admiten **llamadas a herramientas en paralelo**: el modelo puede solicitar varias herramientas en una sola respuesta. No es solo una optimización; cambia el comportamiento del agente. Un modelo que necesita leer tres archivos solicitará los tres a la vez, en lugar de uno tras otro:

```python
# A single assistant message might contain:
# tool_calls = [read_file("a.py"), read_file("b.py"), read_file("c.py")]

for tool_call in assistant_msg.tool_calls:
    result = dispatch_tool(tool_call)
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": str(result)
    })
# All three results are appended, then the model sees them all at once
```

## Presupuesto de turnos y condiciones de salida

El bucle necesita condiciones de salida claras más allá de `max_turns`:

| Condición | Acción |
|-----------|--------|
| No hay llamadas a herramientas en la respuesta | Devolver el texto: el agente ha terminado |
| Se alcanzó el máximo de turnos | Lanzar un error o forzar un resumen |
| Se superó el presupuesto de tokens | Activar la compresión de contexto y luego continuar |
| Llamadas a herramientas idénticas consecutivas | Probablemente está atascado: escalar o abortar |
| Señal de interrupción humana | Pausar el bucle y mostrar el estado actual |

```python
def detect_loop(messages: list, window: int = 3) -> bool:
    """Detect if the agent is stuck calling the same tool repeatedly."""
    recent_calls = []
    for msg in messages[-window * 2:]:
        if hasattr(msg, 'tool_calls') and msg.tool_calls:
            recent_calls.extend(
                (tc.function.name, tc.function.arguments) for tc in msg.tool_calls
            )
    if len(recent_calls) >= window:
        return len(set(recent_calls[-window:])) == 1
    return False
```

## Streaming en el bucle

Los harness de producción hacen streaming de la salida del modelo token a token mientras se ejecuta el bucle. Esto es importante para la experiencia de usuario: la persona ve al agente "pensando" en tiempo real, en lugar de quedarse mirando una pantalla en blanco:

```python
for turn in range(max_turns):
    stream = llm.chat(messages=messages, tools=tools, stream=True)

    tool_calls = []
    text_chunks = []

    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            text_chunks.append(delta.content)
            emit_to_user(delta.content)  # Real-time streaming
        if delta.tool_calls:
            accumulate_tool_calls(tool_calls, delta.tool_calls)

    if not tool_calls:
        return "".join(text_chunks)

    # Execute tools and continue loop
    ...
```

## Errores comunes

- **No poner límite de turnos** — El bug de harness más común con diferencia. Establece siempre un máximo.
- **Ocultar los errores de las herramientas** — Si una herramienta falla en silencio, el modelo reintentará o alucinará un éxito. Devuelve siempre los mensajes de error como resultados de herramienta para que el modelo pueda adaptarse.
- **Añadir los resultados en bruto** — Las salidas grandes de las herramientas (archivos completos, respuestas de API) inflan la ventana de contexto. Trúncalas o resúmelas antes de añadirlas.
- **Ignorar las llamadas en paralelo** — Si tu bucle procesa las llamadas a herramientas de forma secuencial pero el modelo las emitió en paralelo, puedes crear dependencias de orden que no existen.

## Lecturas adicionales

- [Yao et al., "ReAct: Synergizing Reasoning and Acting"](https://arxiv.org/abs/2210.03629) — El artículo original que formalizó el patrón Reason + Act
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Patrones prácticos para bucles en producción
