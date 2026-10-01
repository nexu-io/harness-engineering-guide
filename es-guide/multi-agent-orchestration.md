---
author: Nexu
---

# Orquestación multiagente

> **Idea clave:** Un solo agente choca con límites duros — el tamaño de la ventana de contexto, la especialización por dominio y la ejecución en serie. La orquestación multiagente reparte el trabajo entre varios agentes, cada uno con su propio contexto y sus propias herramientas, coordinados mediante patrones tomados de los sistemas distribuidos.

El artículo [Subagentes](sub-agent.md) cubre el caso más simple: un líder que lanza trabajadores para tareas en paralelo. Este artículo va más allá — patrones de orquestación para sistemas en los que varios agentes colaboran, se especializan y escalan.

## ¿Por qué multiagente?

Un solo agente que ejecuta un solo bucle agéntico es la opción por defecto. Funciona bien para la mayoría de las tareas. Pero, tarde o temprano, tres muros te obligan a ir más allá:

### 1. Límites de la ventana de contexto

Incluso con ventanas de 200K tokens, un proyecto complejo puede agotar el contexto disponible. Una refactorización que toca 80 archivos, una tarea de investigación que consume 40 documentos fuente, un pipeline de varios pasos que acumula salidas de herramientas — cualquiera de ellos puede desbordar una sola ventana. Cuando el contexto se llena, el modelo empieza a olvidar instrucciones anteriores y a perder coherencia.

El enfoque multiagente divide el trabajo. Cada agente recibe una ventana de contexto nueva dedicada a su parte del problema.

### 2. Especialización

Un agente generalista que escribe código, revisa PR, genera textos de marketing y hace análisis de datos es mediocre en todo ello. Los agentes rinden mejor cuando su prompt de sistema, sus herramientas y su contexto están ajustados a un dominio específico. Un "agente de revisión de código" con herramientas de linting y guías de estilo cargadas produce mejores revisiones que un agente de propósito general que, casualmente, también tiene acceso a un linter.

### 3. Paralelismo

Un solo agente es secuencial. Llama a una herramienta, espera el resultado, razona y llama a otra herramienta. Cuando tienes cinco tareas independientes — escribir tests para cinco módulos, investigar a cinco competidores, traducir a cinco idiomas —, un solo agente las procesa una por una. Cinco agentes las procesan simultáneamente.

## Patrones de orquestación

Cuatro patrones cubren la mayoría de las arquitecturas multiagente. No son mutuamente excluyentes — los sistemas en producción a menudo los combinan.

### Pipeline secuencial

El agente A completa su trabajo y pasa la salida al agente B, que a su vez pasa su salida al agente C. Cada agente transforma o enriquece el resultado.

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Ingest  │────►│ Analyze │────►│  Draft  │────►│ Review  │
│  Agent  │     │  Agent  │     │  Agent  │     │  Agent  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

**Cuándo usarlo:** Tareas con etapas naturales en las que cada etapa requiere conocimientos o herramientas distintos. Ejemplo: extraer datos (scraping) → limpiar y analizar → generar un informe → corregir y verificar los hechos.

**Propiedad clave:** Cada agente ve solo la salida de la etapa anterior, no todo el contexto acumulado. Esto es una ventaja — obliga a definir interfaces claras entre etapas y evita que el contexto se infle.

### Fan-Out / Fan-In

Un coordinador despacha las mismas tareas (o tareas relacionadas) a N agentes en paralelo y luego recopila y fusiona todos los resultados.

```
                    ┌───────────┐
               ┌───►│ Worker A  │───┐
               │    └───────────┘   │
┌──────────┐   │    ┌───────────┐   │    ┌──────────┐
│Dispatcher│───┼───►│ Worker B  │───┼───►│  Merger  │
└──────────┘   │    └───────────┘   │    └──────────┘
               │    ┌───────────┐   │
               └───►│ Worker C  │───┘
                    └───────────┘
```

**Cuándo usarlo:** Tareas que se descomponen en subtareas independientes y paralelizables. Ejemplo: traducir un documento a 8 idiomas, escribir tests unitarios para 10 módulos, investigar 5 productos de la competencia.

**Propiedad clave:** Los trabajadores no interactúan en absoluto entre sí. El agente fusionador (o el propio despachador) se encarga de combinar los resultados y resolver los conflictos.

### Supervisor

Un agente supervisor toma todas las decisiones de delegación. Observa el estado actual, decide a qué especialista invocar a continuación, lee el resultado y decide el siguiente paso. A diferencia de un pipeline, el supervisor puede iterar, volver a delegar o invocar al mismo especialista varias veces en función de los resultados intermedios.

```
                 ┌─────────────────┐
                 │   Supervisor    │
                 │ (decides, loops)│
                 └───┬───┬───┬────┘
                     │   │   │
            ┌────────┘   │   └────────┐
            ▼            ▼            ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │ Code     │ │ Research │ │ Review   │
      │ Agent    │ │ Agent    │ │ Agent    │
      └──────────┘ └──────────┘ └──────────┘
```

**Cuándo usarlo:** Tareas en las que el siguiente paso depende del resultado del paso anterior y en las que decidir *a qué* especialista llamar requiere criterio. Ejemplo: un supervisor de programación que delega la implementación a un agente de código, envía el resultado a un agente de revisión y vuelve al agente de código si la revisión encuentra problemas.

**Propiedad clave:** El supervisor mantiene el plan y el estado globales. Los especialistas no tienen estado — reciben una tarea, devuelven un resultado y olvidan. Esto mantiene limpias las ventanas de contexto de los especialistas.

### Peer-to-peer (entre pares)

Los agentes se comunican directamente entre sí, sin un coordinador central. Cada agente tiene su propia bandeja de entrada y puede enviar mensajes a cualquier otro agente.

**Cuándo usarlo:** Simulaciones, razonamiento de tipo debate (el agente A argumenta a favor, el agente B en contra y el agente C juzga) o sistemas en los que los agentes representan a partes interesadas distintas.

**Propiedad clave:** No hay un único punto de coordinación. Esto convierte a peer-to-peer en el patrón más flexible, pero también en el más difícil de depurar. Sin un supervisor, es difícil garantizar la terminación o seguir el progreso.

**Advertencia:** Peer-to-peer rara vez es la elección correcta en sistemas de harness en producción. La falta de control central hace que el manejo de errores, la aplicación de timeouts y la recopilación de resultados sean bastante más difíciles. Prefiere Supervisor o Fan-Out/Fan-In, a menos que tengas una razón concreta para usar comunicación descentralizada.

## Implementación en un harness

Un harness (el programa anfitrión que envuelve un LLM para convertirlo en un agente funcional — consulta [¿Qué es un harness?](what-is-harness.md)) implementa la orquestación multiagente mediante cuatro mecanismos: lanzamiento de subagentes, aislamiento de contexto, comunicación en la que el padre lee los resultados del hijo y gestión de timeouts.

### Lanzamiento de subagentes

La primitiva fundamental es lanzar una sesión de agente aislada. En OpenClaw, es el patrón `sessions_spawn`:

```
Parent Agent
    │
    ├── sessions_spawn(label="research", task="Find competitor pricing")
    │       → creates isolated session with own context, tools, model
    │
    ├── sessions_spawn(label="writer", task="Draft the pricing page")
    │       → another isolated session
    │
    └── waits for both to complete (push-based)
```

Cada sesión lanzada es un agente totalmente independiente, con sus propios elementos:
- Ventana de contexto (no comparte presupuesto de tokens con el padre)
- Prompt de sistema (se puede personalizar por subagente)
- Conjunto de herramientas (se puede restringir o ampliar)
- Modelo (puede usar un modelo más barato para tareas más simples)

El padre especifica una etiqueta, una descripción de la tarea y, opcionalmente, un modelo o un nivel de razonamiento (thinking). El harness se encarga del ciclo de vida del proceso, del timeout y de la entrega del resultado.

### Aislamiento de contexto

El aislamiento de contexto no es una comodidad — es la restricción de diseño central. La ventana de contexto de cada subagente es completamente independiente:

```
┌──────────────────────┐    ┌──────────────────────┐
│   Parent Context     │    │  Sub-Agent Context    │
│                      │    │                       │
│ [system prompt]      │    │ [system prompt]       │
│ [user conversation]  │    │ [task instruction]    │
│ [tool results A,B,C] │    │ [tool results X,Y]   │
│ [128K tokens used]   │    │ [12K tokens used]     │
│                      │    │                       │
│  Cannot see ────────►│ X  │◄──── Cannot see       │
│  sub-agent context   │    │  parent context       │
└──────────────────────┘    └──────────────────────┘
```

**Por qué importa:** Un agente padre con 128K tokens de conversación acumulada puede lanzar un subagente que empieza con un presupuesto limpio de 200K tokens. El subagente no carga con un historial irrelevante — solo ve su instrucción de tarea y el contexto que el padre le pase explícitamente.

El corolario: los subagentes no pueden leer las variables, los resultados de herramientas ni el historial de conversación del padre. Toda transferencia de información es explícita — el padre incluye el contexto relevante en la cadena de instrucción de la tarea.

### Comunicación: el padre lee los resultados del hijo

La comunicación multiagente en un harness sigue un patrón estricto: **el padre lee los resultados de los hijos; los hijos no escriben en la memoria del padre.**

```
1. Parent spawns child with task instruction (one-way write)
2. Child executes independently
3. Child completes → Harness delivers result to parent (push-based)
4. Parent reads the result in its next Agentic Loop iteration
```

No hay memoria compartida, ni bus de mensajes, ni mecanismo de callback mediante el cual un hijo modifique el estado del padre. Esta restricción simplifica drásticamente el razonamiento sobre el sistema — el padre es siempre la única fuente de verdad sobre el progreso global.

En OpenClaw, la finalización es **basada en push**: cuando un subagente termina, el resultado se anuncia automáticamente en la sesión del padre. El padre no necesita hacer polling. Esto elimina el bug multiagente más común: bucles de polling intensivos que desperdician tokens preguntando "¿ya terminó?".

### Timeouts y manejo de errores

Los subagentes pueden colgarse, fallar o producir basura. Un harness de producción debe manejar los tres casos:

```python
@dataclass
class SubAgentConfig:
    task: str
    label: str
    timeout_seconds: int = 300       # Kill after 5 minutes
    max_retries: int = 1             # Retry once on failure
    fallback: str | None = None      # Alternative task on repeated failure

class SubAgentManager:
    def spawn_with_safeguards(self, config: SubAgentConfig) -> str:
        for attempt in range(config.max_retries + 1):
            try:
                result = self.spawn(
                    task=config.task,
                    label=config.label,
                    timeout=config.timeout_seconds,
                )
                if self.validate_result(result):
                    return result
                # Invalid result — retry with clarified instructions
                config.task += "\n\nPrevious attempt produced invalid output. Be precise."
            except TimeoutError:
                if attempt == config.max_retries and config.fallback:
                    return self.spawn(task=config.fallback, label=f"{config.label}-fallback")
                continue
            except Exception as e:
                log.error(f"Sub-agent {config.label} failed: {e}")
                if attempt == config.max_retries:
                    return f"[FAILED] {config.label}: {e}"
        return f"[FAILED] {config.label}: max retries exceeded"
```

**Principios clave:**
- **Establece siempre timeouts.** Un subagente sin timeout es una fuga de recursos a punto de producirse.
- **Valida los resultados.** Un subagente que "termina" con una salida vacía o con un mensaje de error no es un éxito.
- **Degrada de forma elegante.** Cuando un subagente falla, el padre debería continuar con resultados parciales en lugar de abortar por completo — a menos que la tarea fallida sea crítica.
- **Limita la profundidad.** Que los subagentes lancen sus propios subagentes genera una complejidad exponencial. Limita la recursión a 1–2 niveles.

## Ejemplos reales

Tres proyectos open source muestran la orquestación multiagente a distintas escalas.

### Multica (14K+ estrellas)

**Patrón:** Supervisor + Fan-Out / Fan-In

Multica trata a los agentes como compañeros de equipo en un tablero de proyecto. Un humano (o un agente líder) asigna issues de GitHub a agentes trabajadores, cada uno de los cuales se ejecuta de forma independiente. El sistema sigue el progreso en una vista de tablero estilo Kanban que muestra qué agente está trabajando en qué, qué está en revisión y qué se ha fusionado.

Decisiones de diseño clave:
- **Soporte multi-runtime** — los agentes pueden ejecutarse en Claude Code, Codex, OpenClaw u OpenCode. Al orquestador no le importa qué runtime usa un trabajador, solo que produzca la salida esperada.
- **Skills compuestas** — los agentes pueden combinar varias skills (por ejemplo, un agente "fix-and-test" carga tanto la skill de programación como la de testing).
- **Delegación basada en issues** — el trabajo se organiza en torno a issues de GitHub, no a "tareas" abstractas. Esto da a cada agente una unidad de trabajo concreta y rastreable, con criterios de aceptación claros.

### Paseo (3.6K+ estrellas)

**Patrón:** Supervisor con ejecución multidispositivo

Paseo ofrece una única interfaz unificada para interactuar con varios agentes. Emites un comando y Paseo lo enruta al agente adecuado — o lo distribuye (fan-out) entre varios agentes para ejecutarlo en paralelo.

Decisiones de diseño clave:
- **Una interfaz, muchos agentes** — el usuario no necesita saber qué agente se encarga de cada tarea. La capa de enrutamiento de Paseo lo decide.
- **Multidispositivo** — la misma orquestación funciona desde un teléfono, una app de escritorio o la CLI. Los agentes se ejecutan en el servidor; la interfaz es solo un cliente ligero.
- **Paralelo por defecto** — cuando las tareas son independientes, Paseo las paraleliza automáticamente entre los agentes disponibles en lugar de ponerlas en cola.

### OpenClaw

**Patrón:** Lanzamiento nativo de subagentes con finalización basada en push

OpenClaw implementa la orquestación multiagente como una primitiva de primera clase del harness mediante `sessions_spawn`. El agente padre lanza subagentes con una sola llamada a herramienta, especificando una etiqueta, una tarea y, opcionalmente, una configuración de modelo/razonamiento.

Decisiones de diseño clave:
- **Finalización basada en push** — cuando un subagente termina, su resultado se anuncia automáticamente en la sesión del padre. No hace falta hacer polling. Esto está documentado explícitamente: *"La finalización es basada en push: se anunciará automáticamente cuando termine."*
- **Seguimiento por etiquetas** — cada subagente recibe una etiqueta legible por humanos (p. ej., `article-research`, `code-review`). El padre puede listar, redirigir o matar subagentes por su etiqueta.
- **Limitación de profundidad** — los subagentes se pueden configurar con una profundidad máxima para evitar un lanzamiento recursivo descontrolado.
- **Inyección de contexto** — el padre puede inyectar contexto específico (archivos, instrucciones, restricciones) en la sesión del subagente sin compartir todo su historial de conversación.

## Cuándo NO usar multiagente

La orquestación multiagente tiene costos reales: mayor latencia (sobrecarga de lanzamiento), mayor consumo de tokens (prompts de sistema y contexto duplicados entre agentes) y más complejidad a la hora de depurar. Evítala cuando:

### La tarea cabe en una sola ventana de contexto

Si una tarea necesita 10K tokens de contexto y 5 llamadas a herramientas, un solo agente la resuelve más rápido y de forma más fiable que lanzando trabajadores. La sobrecarga de la coordinación multiagente (lanzar, pasar contexto, fusionar resultados) supera el beneficio.

### El costo de coordinación supera el beneficio

Una tarea que requiere un ida y vuelta constante entre dos agentes — en la que el agente A necesita el resultado del agente B antes de dar su siguiente paso, y viceversa — la resuelve mejor un solo agente que hace llamadas a herramientas secuenciales. El enfoque multiagente brilla cuando el trabajo es *independiente*; sufre cuando el trabajo está profundamente entrelazado.

### Se requiere un orden estricto

Si los pasos deben ejecutarse en un orden exacto con traspasos precisos y no hay oportunidad de paralelismo, un solo agente con un plan paso a paso es más simple y más determinista. Un pipeline secuencial de agentes añade latencia en cada frontera entre etapas sin ninguna ganancia de paralelismo — úsalo solo cuando las etapas se beneficien realmente del aislamiento de contexto o de la especialización.

## Antipatrones

### Estado mutable compartido

Dos agentes que escriben simultáneamente en el mismo archivo, la misma fila de base de datos o la misma variable. Esto produce condiciones de carrera, trabajo sobrescrito y resultados no deterministas. La solución: asigna a cada agente la propiedad de recursos distintos. Si dos agentes deben contribuir al mismo artefacto, usa el patrón Fan-Out/Fan-In, en el que un agente fusionador combina sus salidas de forma secuencial.

### Fan-out sin límite

Lanzar agentes en proporción al tamaño de la entrada sin un tope. "Traduce este documento a los 50 idiomas soportados" lanza 50 agentes simultáneos y satura el sistema. La solución: establece un límite `max_workers` y procesa por lotes.

```python
# Bad: unbounded
for lang in all_50_languages:
    spawn_agent(task=f"Translate to {lang}")

# Good: bounded batches
BATCH_SIZE = 8
for batch in chunked(all_50_languages, BATCH_SIZE):
    results = fan_out_fan_in(
        [f"Translate to {lang}" for lang in batch],
        merge_prompt="Collect all translations.",
    )
```

### Sin timeout ni circuit breaker

Un subagente que se cuelga — esperando a una API con límite de tasa, atascado en un bucle infinito o simplemente ejecutando una tarea compleja — bloquea toda la orquestación si no hay timeout. Todo lanzamiento de subagente debe incluir:
- Un **timeout** que mate al agente tras una duración máxima
- Un **circuit breaker** que deje de reintentar después de N fallos
- Una **ruta de fallback** que permita al padre continuar con resultados parciales

### Descomposición excesiva

Dividir una tarea de 30 segundos en 5 subagentes, cada uno con 15 segundos de sobrecarga para lanzarse y devolver resultados. El tiempo total de reloj pasa de 30 segundos a 75 segundos. El enfoque multiagente es una herramienta para gestionar la complejidad y el paralelismo — no la opción por defecto para cada tarea.

## Cómo elegir el patrón adecuado

| Situación | Patrón | Motivo |
|-----------|---------|--------|
| Etapas que requieren conocimientos distintos | Pipeline secuencial | Cada etapa recibe contexto y herramientas especializados |
| N tareas idénticas e independientes | Fan-Out / Fan-In | Máximo paralelismo, fusión sencilla |
| Tarea compleja que requiere criterio sobre los siguientes pasos | Supervisor | Toma de decisiones centralizada, enrutamiento flexible |
| Debate o análisis desde múltiples perspectivas | Peer-to-peer | Los agentes representan puntos de vista distintos |
| Combinación de trabajo paralelo y secuencial | Supervisor + Fan-Out | El supervisor decide cuándo paralelizar |

Empieza por el patrón más simple que funcione. Un solo agente con un buen uso de herramientas resuelve el 80% de las tareas. Cuando choques con los límites descritos en [¿Por qué multiagente?](#por-qué-multiagente), recurre al patrón de orquestación más ligero que resuelva el cuello de botella concreto. El artículo [Subagentes](sub-agent.md) cubre el patrón de delegación más simple — empieza por ahí antes de construir una capa de orquestación completa.

## Lecturas adicionales

- [Subagentes](sub-agent.md) — El patrón de delegación fundamental para un solo líder con varios trabajadores
- [Bucle agéntico](agentic-loop.md) — El ciclo de ejecución central que cada agente ejecuta internamente
- [Ingeniería de contexto](context-engineering.md) — Cómo gestionar lo que entra en la ventana de contexto de cada agente
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Patrones para la coordinación multiagente
- [OpenAI: Agents SDK — Multi-Agent](https://openai.github.io/openai-agents-python/) — Primitivas de traspaso (handoff) y orquestación
- [Microsoft AutoGen](https://microsoft.github.io/autogen/) — Framework para patrones de conversación multiagente
