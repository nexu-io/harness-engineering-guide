---
author: Nexu
---

# Diseño de harness para agentes de larga duración

> **Idea clave:** Los agentes de tareas cortas fallan de forma controlada: o terminan o agotan el tiempo. Los agentes de larga duración fallan de forma insidiosa. Producen un contexto inflado, se degradan en silencio y se convencen de que están haciendo un gran trabajo mientras se desvían del rumbo. Diseñar un harness para agentes de larga duración significa diseñar contra estos modos de fallo.

## Por qué los agentes de larga duración son difíciles

Un agente de "tarea corta" (responder una pregunta, escribir una función, resumir un documento) vive y muere dentro de una única ventana de contexto. O termina, o falla de forma visible.

Un agente de "larga duración" opera durante horas o días: refactorizar una base de código, escribir un informe de 50 páginas, ejecutar un pipeline de varias etapas. Estos agentes se enfrentan a problemas que los agentes de tareas cortas nunca encuentran:

1. **El contexto se acumula.** Cada llamada a herramienta, cada resultado intermedio y cada paso de razonamiento añaden tokens. Una ventana de 200K se llena más rápido de lo que crees.
2. **La calidad se degrada en silencio.** El agente no se bloquea: simplemente empeora. Las respuestas se vuelven más vagas, las instrucciones se olvidan y el contexto anterior queda desplazado.
3. **La autoevaluación miente.** Pregúntale a un agente "¿es bueno tu trabajo?" y te dirá que sí. Siempre. Eso no es un problema en una tarea de 30 segundos que puedes revisar de un vistazo. Es catastrófico en un pipeline de 4 horas que no estás vigilando.

## Modo de fallo n.º 1: ansiedad de contexto

A medida que un agente de larga duración llena su ventana de contexto, ocurre algo contraintuitivo: el modelo empieza a precipitarse. Cierra antes de tiempo, toma atajos y declara que ha "terminado" antes de que el trabajo esté realmente completo.

Esto es la **ansiedad de contexto** (context anxiety): la conciencia implícita del modelo de que se está quedando sin espacio. Se manifiesta así:

- Se salta pasos que normalmente realizaría
- Produce salidas más cortas y menos exhaustivas
- Declara la tarea completa antes de tiempo con un "He cubierto los puntos principales"
- Evita llamadas a herramientas que añadirían más contexto

La ansiedad de contexto es un fenómeno emergente en distintas arquitecturas. El modelo ha aprendido que las conversaciones terminan y, a medida que el espacio se reduce, tiende a ponerles fin.

**Una ventana más grande retrasa el problema; no lo resuelve.** La solución es arquitectónica: gestionar explícitamente el ciclo de vida del contexto.

## Modo de fallo n.º 2: sesgo de autoevaluación

Pídele a un generador que evalúe su propia salida. Se pondrá un 8/10 o más, de forma sistemática, independientemente de la calidad real. Esto es el **sesgo de autoevaluación** (self-evaluation bias), y es el segundo asesino silencioso de los agentes de larga duración.

¿Por qué? El modelo tiene el contexto completo de su propio razonamiento: cada decisión le parece justificada. Admitir un fallo implica contradecir salidas anteriores, algo a lo que los LLM se resisten. Y los datos de entrenamiento premian la confianza por encima de la duda.

En una tarea corta, un humano detecta los problemas. En una tarea de larga duración, el agente funciona de forma autónoma. Si evalúa sus propias salidas y siempre dice "se ve bien", los errores se acumulan sin control.

```
Short task:   Agent produces → Human reviews → Feedback
Long-running: Agent produces → Agent reviews → "Looks great!" → Errors compound
```

La lección del diseño de redes adversarias se aplica aquí: **nunca dejes que el generador corrija su propio examen.**

## Gestión del contexto: reinicio vs. compactación

Cuando el contexto se llena, tienes dos opciones. Cada una tiene contrapartidas reales.

### Reinicio de contexto

Borra la conversación y empieza de cero. Pasa un resumen del trabajo previo al nuevo contexto a modo de "informe de situación".

```
Turn 1-50:  [full conversation history]
            ↓ context 80% full
Turn 51:    [system prompt + summary of turns 1-50 + current task]
            ↓ fresh start, ~10% context used
Turn 51-100: [continues from summary]
```

**Ventajas:** borrón y cuenta nueva, presupuesto de tokens predecible y desaparece la ansiedad de contexto en el nuevo segmento.

**Inconvenientes:** se pierde información; los resúmenes omiten matices y enfoques fallidos. El "resumen de un resumen" se degrada tras varios reinicios. El agente puede volver a meterse en callejones sin salida.

### Compactación de contexto

Comprime selectivamente los turnos antiguos y mantén intactos los recientes. Condensa el razonamiento de varios turnos en resúmenes y descarta las salidas de herramientas demasiado extensas.

```
Turn 1-20:  [compressed: 3-line summary of early exploration]
Turn 21-40: [compressed: key decisions and outcomes]
Turn 41-50: [full detail: recent work in progress]
```

**Ventajas:** preserva la continuidad. Es gradual: los turnos recientes conservan el detalle y los antiguos se comprimen. El agente sigue sabiendo qué ha intentado.

**Inconvenientes:** la calidad de la compresión varía. Es más complejo de implementar. El contexto compactado puede confundir al modelo si los resúmenes contradicen el estado reciente.

### ¿Cuál elegir?

| Escenario | Preferir |
|----------|--------|
| Tareas con fases claras (investigar → escribir → revisar) | Reinicio entre fases |
| Iteración continua sobre un único artefacto | Compactación |
| El agente revisita con frecuencia decisiones anteriores | Compactación (preserva el historial de decisiones) |
| El contexto ha acumulado muchas salidas de herramientas | Reinicio (las salidas de herramientas se comprimen mal) |

En la práctica, muchos harness usan un enfoque híbrido: compactación dentro de cada fase y reinicio entre fases.

## Arquitectura generador-evaluador

Toma prestada la idea de las GAN: el generador crea y el discriminador juzga; son redes separadas con objetivos opuestos. Aplica el mismo principio a los agentes:

```
┌─────────────┐         ┌──────────────┐
│  Generator  │────────►│  Evaluator   │
│  (Agent A)  │         │  (Agent B)   │
│             │◄────────│              │
│  Produces   │ feedback│  Judges      │
│  output     │         │  output      │
└─────────────┘         └──────────────┘
        │                       │
        │    Separate context   │
        │    Separate prompt    │
        │    Separate criteria  │
```

**Reglas clave de diseño:**

1. **Contextos separados.** El evaluador solo ve la salida, no el razonamiento del generador. Así se evita el sesgo de simpatía.
2. **Rúbrica explícita.** Evalúa con una lista de verificación, no por intuición. "¿Maneja el código el caso límite X?" es mejor que "¿Es bueno el código?".
3. **Feedback accionable.** Devuelve problemas concretos, no puntuaciones. "La función `parse_input` no maneja cadenas vacías" es útil. "7/10" no lo es.
4. **Presupuesto de iteraciones.** Pon un límite al bucle. Sin límite, evaluador perfeccionista + generador entusiasta = ciclo infinito.

```python
def generator_evaluator_loop(task, max_iterations=3):
    output = None
    for i in range(max_iterations):
        # Generator: produce or revise
        if output is None:
            output = generator.run(task)
        else:
            output = generator.revise(task, output, feedback)

        # Evaluator: judge with fresh eyes
        evaluation = evaluator.judge(task, output)  # no generator context!

        if evaluation.passes:
            return output

        feedback = evaluation.issues

    return output  # best effort after max iterations
```

## Arquitectura de tres agentes: planificador → generador → evaluador

Para tareas complejas de larga duración, añade un **planificador** (Planner) para cubrir descomposición, ejecución y control de calidad.

```
                    ┌─────────────┐
                    │   Planner   │
                    │             │
                    │ Decomposes  │
                    │ task into   │
                    │ subtasks    │
                    └──────┬──────┘
                           │
                           ▼
              ┌─── subtask list ───┐
              │                    │
              ▼                    ▼
     ┌─────────────┐      ┌─────────────┐
     │  Generator  │      │  Generator  │   (parallel or sequential)
     │  subtask 1  │      │  subtask 2  │
     └──────┬──────┘      └──────┬──────┘
            │                    │
            ▼                    ▼
     ┌─────────────┐      ┌─────────────┐
     │  Evaluator  │      │  Evaluator  │
     │  subtask 1  │      │  subtask 2  │
     └──────┬──────┘      └──────┬──────┘
            │                    │
            └────────┬───────────┘
                     ▼
              ┌─────────────┐
              │   Planner   │
              │  (reviews   │
              │   results,  │
              │   re-plans  │
              │   if needed)│
              └─────────────┘
```

**Planificador**: descompone el objetivo en subtareas con criterios de éxito. Vuelve a planificar cuando los evaluadores señalan problemas. Mantiene la visión de conjunto, pero no ejecuta.

**Generador**: ejecuta una subtarea cada vez, con un contexto nuevo. Dispone de herramientas, archivos y entornos de ejecución. No evalúa su propio trabajo.

**Evaluador**: solo ve la salida del generador (no su razonamiento). Evalúa según los criterios del planificador. Devuelve aprobado/suspenso junto con problemas concretos.

La propiedad crítica: **cada agente opera en su propia ventana de contexto.** El generador puede llenar su ventana de 200K explorando código y aun así producir una salida limpia. El evaluador empieza de cero. El planificador mantiene una visión de alto nivel sin detalles de implementación.

```python
def three_agent_pipeline(goal, max_replans=2):
    plan = planner.decompose(goal)

    for replan in range(max_replans + 1):
        results = {}
        for subtask in plan.subtasks:
            # Generator: fresh context per subtask
            output = generator.execute(subtask)

            # Evaluator: fresh context, only sees output + criteria
            evaluation = evaluator.judge(
                subtask=subtask,
                output=output,
                criteria=subtask.success_criteria
            )

            results[subtask.id] = {
                "output": output,
                "evaluation": evaluation
            }

        # Check if all subtasks pass
        failures = [r for r in results.values() if not r["evaluation"].passes]
        if not failures:
            return assemble_results(results)

        # Re-plan: planner sees which subtasks failed and why
        plan = planner.replan(goal, results)

    return assemble_results(results)  # best effort
```

## Antipatrones

### Antipatrón n.º 1: el agente monolítico

Meter la planificación, la ejecución, la evaluación y la gestión del contexto en un único agente.

```python
# DON'T DO THIS
response = llm.chat(
    system="""You are a planner, coder, reviewer, and project manager.
    First plan the work, then do the work, then review your own work.
    If the review finds issues, fix them and review again.""",
    messages=conversation  # 150K tokens of accumulated history
)
```

Esto falla por todas las razones anteriores: el contexto se llena, la autoevaluación no es fiable y no hay separación de responsabilidades. Funciona para tareas simples y se desmorona en las complejas.

### Antipatrón n.º 2: evaluación sin rúbrica

```python
# DON'T DO THIS
evaluation = evaluator.judge(
    prompt=f"Is this output good? Rate 1-10.\n\n{output}"
)
# Result: always 8/10. Always.
```

Un evaluador sin criterios no es más que un generador con síndrome del impostor. Proporciona siempre una rúbrica:

```python
# DO THIS
evaluation = evaluator.judge(
    prompt=f"""Evaluate the following output against these criteria:
    1. Does every function have error handling for edge cases?
    2. Are all API calls wrapped in retry logic?
    3. Does the code match the spec in {spec_file}?
    4. Are there any hardcoded values that should be config?

    Output to evaluate:
    {output}

    For each criterion, answer PASS or FAIL with a one-line explanation."""
)
```

### Antipatrón n.º 3: replanificación infinita

```python
# DON'T DO THIS
while not all_subtasks_pass:
    plan = planner.replan(goal, results)  # loops forever
    results = execute_plan(plan)
```

Limita siempre las iteraciones. Tres replanificaciones fallidas indican un problema de especificación, no de ejecución. Escálalo a un humano.

## Todo junto: una implementación mínima

```python
class LongRunningHarness:
    """Planner → Generator → Evaluator harness for long-running tasks."""

    def __init__(self, planner_model, generator_model, evaluator_model):
        self.planner = Agent(model=planner_model, role="planner")
        self.generator = Agent(model=generator_model, role="generator")
        self.evaluator = Agent(model=evaluator_model, role="evaluator")

    def run(self, goal, max_replans=2, max_gen_iterations=3):
        plan = self.planner.decompose(goal)

        for _ in range(max_replans + 1):
            results = {}

            for subtask in plan.subtasks:
                output = self._generate_with_eval(
                    subtask, max_iterations=max_gen_iterations
                )
                results[subtask.id] = output

            failures = {k: v for k, v in results.items() if not v["passed"]}
            if not failures:
                return self._assemble(results)

            plan = self.planner.replan(goal, plan, failures)

        return self._assemble(results, partial=True)  # best effort

    def _generate_with_eval(self, subtask, max_iterations):
        output = None
        for i in range(max_iterations):
            output = self.generator.execute(
                subtask=subtask,
                prior_feedback=output.get("feedback") if output else None
            )

            evaluation = self.evaluator.judge(
                output=output["result"],
                criteria=subtask.success_criteria
            )

            if evaluation["passes"]:
                return {"result": output["result"], "passed": True}

            output["feedback"] = evaluation["issues"]

        return {"result": output["result"], "passed": False,
                "feedback": evaluation["issues"]}

    def _assemble(self, results, partial=False):
        assembled = "\n\n".join(r["result"] for r in results.values())
        if partial:
            failed = [k for k, v in results.items() if not v["passed"]]
            assembled += f"\n\n⚠️ Incomplete subtasks: {failed}"
        return assembled
```

## Conclusiones clave

1. **Larga duración ≠ corta duración con más tiempo.** Los modos de fallo son cualitativamente distintos.
2. **La ansiedad de contexto es real.** Gestiona el ciclo de vida del contexto con reinicios, compactación o ambos.
3. **Nunca dejes que el generador corrija su propio examen.** Agentes separados, contextos separados, rúbricas explícitas.
4. **Ponle límite a todo.** Máximo de turnos, máximo de replanificaciones, máximo de iteraciones. Los bucles sin límite queman tokens.
5. **Descompón primero.** Los bloques de trabajo que caben en una ventana de contexto evitan la mayoría de los problemas de contexto antes de que surjan.

## Lecturas adicionales

- [Ingeniería de contexto](context-engineering.md) — análisis en profundidad del ensamblaje de contexto, la compresión y la gestión del presupuesto
- [Orquestación multiagente](multi-agent-orchestration.md) — patrones de orquestación más allá de la arquitectura de tres agentes
- [Manejo de errores](error-handling.md) — gestión de fallos, reintentos y degradación elegante en bucles de agentes
- [Anthropic: Building effective agents](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/building-effective-agents) — guía de Anthropic sobre patrones de diseño de agentes
