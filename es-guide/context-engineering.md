---
author: Nexu
---

# Ingeniería de contexto

> **Idea clave:** El modelo no sabe lo que no le dices. La ingeniería de contexto es la disciplina de decidir qué entra en la ventana de contexto, en qué orden y qué se recorta cuando se acaba el espacio. Es el trabajo de mayor impacto en la ingeniería de harness: influye más que la elección del modelo, el ajuste del prompt o el diseño de herramientas.

## El problema

Una ventana de contexto de 128K tokens parece enorme hasta que empiezas a llenarla. Un solo archivo grande puede consumir 10K tokens. Veinte esquemas de herramientas se comen 3K. El historial de la conversación crece linealmente con cada turno. En apenas una docena de turnos de una tarea de programación compleja, ya estás tomando decisiones difíciles sobre qué conservar y qué descartar.

La ingeniería de contexto es el arte de tomar esas decisiones. Se apoya en tres pilares: el **ensamblaje** (qué entra), la **compresión** (qué se reduce) y el **presupuesto** (cómo repartes la capacidad).

## Sistema de prioridades para el ensamblaje de contexto

No todo el contexto vale lo mismo. Un sistema de prioridades garantiza que la información más crítica sobreviva cuando el espacio escasea:

| Prioridad | Categoría | Tokens típicos | Notas |
|----------|----------|---------------|-------|
| 0 (máxima) | Prompt de sistema | 300–800 | Identidad, reglas de comportamiento, restricciones de seguridad |
| 1 | Esquemas de herramientas activas | 1000–3000 | Solo las skills cargadas, no todas las herramientas |
| 2 | Instrucción de la tarea | 200–1000 | Solicitud actual del usuario + cualquier objetivo fijado |
| 3 | Resumen de memoria | 500–2000 | MEMORY.md comprimido + registro diario de hoy |
| 4 | Archivos inyectados | 2000–20,000 | AGENTS.md, SKILL.md, archivos de código fuente relevantes |
| 5 | Conversación reciente | 5000–50,000 | Últimos N turnos de mensajes + resultados de herramientas |
| 6 (mínima) | Conversación antigua | el resto | Turnos anteriores, los primeros en comprimirse o descartarse |

El ensamblador recorre esta lista de arriba abajo e incorpora contenido hasta agotar el presupuesto. El contenido de menor prioridad se trunca o se excluye por completo.

```python
import tiktoken

encoder = tiktoken.encoding_for_model("gpt-4o")

def estimate_tokens(text: str) -> int:
    """Fast token estimation using tiktoken."""
    return len(encoder.encode(text))

class ContextAssembler:
    """Assemble context with priority-based token budgeting."""

    def __init__(self, max_tokens: int = 128_000, reserve: int = 4_096):
        self.max_tokens = max_tokens
        self.reserve = reserve  # Leave room for the model's response
        self.budget = max_tokens - reserve
        self.sections: list[tuple[int, str, str]] = []

    def add(self, priority: int, name: str, content: str):
        """Add a section. Lower priority number = higher importance."""
        self.sections.append((priority, name, content))

    def build(self) -> list[dict]:
        """Pack sections into messages within the token budget."""
        self.sections.sort(key=lambda s: s[0])
        messages = []
        used = 0

        for priority, name, content in self.sections:
            tokens = estimate_tokens(content)
            if used + tokens <= self.budget:
                messages.append({
                    "role": "system",
                    "content": f"[{name}]\n{content}",
                })
                used += tokens
            elif priority <= 2:
                # Critical sections get truncated rather than dropped
                remaining = self.budget - used
                truncated = self._truncate_to_tokens(content, remaining)
                if truncated:
                    messages.append({
                        "role": "system",
                        "content": f"[{name} (truncated)]\n{truncated}",
                    })
                    used += estimate_tokens(truncated)
            # Priority > 2: silently dropped when over budget

        return messages

    def _truncate_to_tokens(self, text: str, max_tokens: int) -> str:
        """Truncate text to fit within a token limit."""
        tokens = encoder.encode(text)
        if len(tokens) <= max_tokens:
            return text
        return encoder.decode(tokens[:max_tokens]) + "\n[...truncated]"
```

El parámetro `reserve` es fácil de pasar por alto, pero es crítico: necesitas dejar margen para la respuesta del modelo. Si llenas el contexto al 100%, el modelo no tiene espacio para responder.

## Compresión de contexto: tres líneas de defensa

A medida que avanza una sesión, el historial bruto de la conversación crece sin límite. Tres técnicas evitan que consuma toda la ventana de contexto:

### Línea 1: decaimiento automático

Los mensajes más antiguos pierden relevancia de forma natural. Una estrategia de decaimiento sencilla descarta los mensajes que quedan fuera de una ventana fija y conserva solo los N turnos más recientes:

```python
def apply_decay(messages: list[dict], max_turns: int = 20) -> list[dict]:
    """Keep the system prompt and the last max_turns exchanges."""
    system = [m for m in messages if m["role"] == "system"]
    conversation = [m for m in messages if m["role"] != "system"]
    # Each "turn" is roughly a user + assistant + tool cycle
    if len(conversation) > max_turns * 3:
        conversation = conversation[-(max_turns * 3):]
    return system + conversation
```

### Línea 2: compresión por umbral

Cuando el total de tokens supera un umbral (por ejemplo, el 70% del presupuesto), comprime los turnos más antiguos de la conversación en un resumen y conserva literalmente los turnos recientes:

```python
def threshold_compress(
    messages: list[dict],
    budget: int,
    threshold: float = 0.7,
    keep_recent: int = 10,
) -> list[dict]:
    """Compress older messages when token usage exceeds threshold."""
    total = sum(estimate_tokens(m["content"]) for m in messages)
    if total < budget * threshold:
        return messages  # Under threshold, no compression needed

    system = [m for m in messages if m["role"] == "system"]
    conversation = [m for m in messages if m["role"] != "system"]

    old = conversation[:-keep_recent]
    recent = conversation[-keep_recent:]

    summary = summarize_with_llm(old)  # Use a fast, cheap model
    compressed = system + [{
        "role": "system",
        "content": f"[Conversation summary]\n{summary}",
    }] + recent

    return compressed
```

### Línea 3: resumen activo

Para tareas de duración extremadamente larga, extrae periódicamente los hechos y las decisiones clave en un documento de resumen continuo. Esto no es automático: el harness le pide explícitamente al modelo que genere un checkpoint:

```python
SUMMARIZE_PROMPT = """Summarize the key decisions, findings, and current state 
from this conversation. Include: files modified, tests run, errors encountered, 
and the current plan. Be concise — under 500 words."""

def active_summarize(messages: list[dict]) -> str:
    """Ask the model to produce a checkpoint summary."""
    response = llm.chat(
        messages=messages + [{"role": "user", "content": SUMMARIZE_PROMPT}],
        max_tokens=1024,
    )
    return response.choices[0].message.content
```

## Presupuesto de tokens en la práctica

Aritmética real de tokens para una ventana de contexto de 128K:

```
Total capacity:              128,000 tokens
Response reserve:             -4,096
System prompt:                  -500
Tool schemas (12 tools):      -2,400
MEMORY.md:                    -1,200
AGENTS.md:                      -800
─────────────────────────────────────
Available for conversation:  119,004 tokens

At ~3 tokens/word, that's ~39,600 words of conversation.
A 50-turn coding session with tool results: ~60,000 tokens.
→ You'll hit the budget around turn 35 without compression.
```

La conclusión: la compresión no es opcional en ninguna sesión que no sea trivial.

## Patrones de inyección de contexto

El contexto no solo proviene del historial de la conversación. Hay cinco patrones de inyección habituales:

| Patrón | Cuándo | Ejemplo |
|---------|------|---------|
| **Inyección de archivos** | Al iniciar la sesión | Cargar AGENTS.md, MEMORY.md y los archivos de código fuente relevantes |
| **Inyección de memoria** | Al iniciar la sesión | Memoria a largo plazo comprimida + registros diarios recientes |
| **Inyección de resultados de herramientas** | Durante el bucle | Añadir las salidas de las herramientas como mensajes con rol de herramienta (tool) |
| **Inyección de skills** | Bajo demanda | Cargar SKILL.md cuando se activa una skill |
| **Inyección por recuperación** | Por consulta | Resultados de RAG desde un almacén vectorial |

Cada punto de inyección tiene un costo. Un archivo de código fuente de 200 líneas son ~800 tokens. Inyectar diez archivos de forma especulativa cuesta 8K tokens antes de que la conversación siquiera empiece. Sé deliberado: inyecta lo que se necesita, no lo que *podría* necesitarse.

## Implementación de ventana deslizante

Una ventana deslizante mantiene intactos los turnos más recientes y comprime todo lo que queda antes del límite de la ventana. Es la estrategia más práctica para los harness en producción:

```python
class SlidingWindowContext:
    """Maintain a sliding window over conversation history."""

    def __init__(self, window_size: int = 15, max_tokens: int = 128_000):
        self.window_size = window_size
        self.max_tokens = max_tokens
        self.summary = ""
        self.messages: list[dict] = []

    def add(self, message: dict):
        self.messages.append(message)
        conversation = [m for m in self.messages if m["role"] != "system"]
        if len(conversation) > self.window_size * 3:
            self._compress()

    def _compress(self):
        """Move older messages into a rolling summary."""
        conversation = [m for m in self.messages if m["role"] != "system"]
        system = [m for m in self.messages if m["role"] == "system"]

        old = conversation[:-(self.window_size * 3)]
        recent = conversation[-(self.window_size * 3):]

        new_summary = summarize_with_llm(
            [{"role": "system", "content": self.summary}] + old
        )
        self.summary = new_summary
        self.messages = system + recent

    def get_messages(self) -> list[dict]:
        """Return context-ready message list."""
        result = [m for m in self.messages if m["role"] == "system"]
        if self.summary:
            result.append({
                "role": "system",
                "content": f"[Conversation history summary]\n{self.summary}",
            })
        result.extend(m for m in self.messages if m["role"] != "system")
        return result
```

## Errores comunes

- **Tratar todo el contexto con la misma prioridad**: el prompt de sistema y las instrucciones de la tarea deben sobrevivir; la conversación antigua se puede comprimir. Sin prioridades, o desperdicias espacio en mensajes obsoletos o descartas instrucciones críticas.
- **Comprimir de forma demasiado agresiva**: resumir implica pérdida de información. Si comprimes un resultado de herramienta que contenía una ruta de archivo que el modelo necesita más tarde, el modelo alucinará la ruta. Conserva literalmente los turnos recientes.
- **Ignorar el conteo de tokens**: calcular a ojo que "esto parece lo bastante corto" deja de funcionar enseguida. Usa un conteo real de tokens (tiktoken, tokenizadores específicos de cada modelo) para el presupuesto.
- **Ensamblaje de contexto de una sola vez**: construir el contexto una vez al inicio de la sesión y no actualizarlo nunca significa que el modelo trabaja con información obsoleta después de la primera llamada a herramienta. Vuelve a ensamblar el contexto en cada turno.

## Lecturas adicionales

- [Karpathy: "Context Engineering is the New Prompt Engineering"](https://x.com/karpathy/status/1937902263428948034) — Por qué el ensamblaje de contexto importa más que los trucos de prompt
- [Letta: MemGPT and the Future of Agent Memory](https://www.letta.com/blog/memgpt) — Gestión de memoria inspirada en los sistemas operativos, con contexto virtual
- [OpenAI: Managing Tokens](https://platform.openai.com/docs/guides/text-generation#managing-tokens) — Fundamentos del conteo de tokens
