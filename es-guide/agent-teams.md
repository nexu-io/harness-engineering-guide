---
title: "Agent Teams: Claudes en paralelo construyendo software real"
author: Nexu
date: "2026-04-19"
description: "Cómo una flota de 16 agentes Claude en paralelo construyó un compilador de C en Rust de 100K líneas — y lo que nos enseña sobre el diseño de harness."
tags: [agents, harness, parallelism, orchestration, case-study]
---

# Agent Teams: Claudes en paralelo construyendo software real

La mayoría de las demos de agentes parecen impresionantes y no hacen nada útil. Una app de lista de tareas. Un scraper de tareas pendientes. Un "asistente personal de investigación" que resume tres páginas web.

Y entonces alguien conecta dieciséis Claudes a un bucle y construyen un compilador de C capaz de compilar el kernel de Linux.

Este artículo trata de eso segundo — y, en concreto, de cómo era el harness que lo sostenía. Recorreremos la arquitectura del proyecto de Nicholas Carlini *"Building a C compiler with a team of parallel Claudes"* ([Anthropic Engineering](https://www.anthropic.com/engineering/building-c-compiler), [GitHub](https://github.com/anthropics/claudes-c-compiler)), extraeremos los principios de diseño que realmente importaron y los traduciremos en patrones que puedes reutilizar en tu propio harness.

---

## La idea clave

> **16 instancias de Claude, ejecutándose en paralelo durante unas dos semanas, produjeron un compilador de C de 100,000 líneas escrito en Rust. Compila Linux 6.9 en x86, ARM y RISC-V. Supera el 99% de la suite de torture tests de GCC. Compila QEMU, FFmpeg, SQLite, Postgres y Redis.**

Vuelve a leerlo. Y luego léelo una vez más.

Esto no es un juguete. Es un compilador real, de calidad de producción, escrito por un equipo de LLM bajo restricciones mucho más estrictas de las que toleraría un equipo humano: sin acceso a internet, sin crates de compiladores existentes, sin copiar de LLVM ni de tcc — solo la biblioteca estándar de Rust y lo que Claude pudiera deducir de la especificación de C y de su entrenamiento. Una implementación clean-room (en sala limpia) hecha por agentes.

La pregunta interesante no es "¿puede un LLM escribir un compilador?". Ya sabíamos que podía escribir *partes* de uno. La pregunta interesante es:

**¿Qué harness convierte 16 llamadas a un LLM, sin estado y olvidadizas, en un equipo de ingeniería coherente que entrega 100,000 líneas de código?**

---

## Ficha del proyecto

Antes de entrar en la arquitectura, este es el balance:

```
┌─────────────────────────────────────────────────────────────┐
│  Parallel Claudes:     16                                   │
│  Total sessions:       2,000+                               │
│  Wall-clock time:      ~2 weeks                             │
│  API cost:             ~$20,000                             │
│  Human code written:   ~0 lines (harness + prompts only)    │
│  Lines of Rust:        ~100,000                             │
│                                                             │
│  Torture-test pass:    99% (GCC torture suite)              │
│  Self-hosts Linux:     ✅ 6.9 on x86 / ARM / RISC-V         │
│  Also compiles:        QEMU, FFmpeg, SQLite, Postgres,      │
│                        Redis                                │
│                                                             │
│  Net-access for agent: ❌ none                              │
│  External crates:      ❌ std lib only                      │
└─────────────────────────────────────────────────────────────┘
```

Pagar $20K por un compilador de C es caro para un aficionado y ridículamente barato para un equipo de compiladores. Una startup de compiladores de dos personas quema $20K en tres días laborables.

---

## La arquitectura del Ralph loop

El corazón del harness es vergonzosamente simple. Cada agente es un bucle de bash:

```bash
#!/usr/bin/env bash
# agent.sh — run inside a Docker container
while true; do
  claude --dangerously-skip-permissions -p AGENT_PROMPT.md
done
```

Eso es todo. Ese es el agente completo.

Sin orquestador. Sin daemon de cola de tareas. Sin planificador. Sin bus de mensajes. Cuando una sesión de Claude termina — con éxito, con un fallo o por colapso de la ventana de contexto —, el bucle arranca un Claude nuevo con el mismo archivo de prompt. El prompt le dice al nuevo Claude que mire el repo, averigüe qué hay que hacer a continuación y lo haga.

Este estilo a veces se llama "Ralph loop" (en honor al "¡Estoy ayudando!" de Ralph Wiggum): un bucle exterior tonto sigue empujando a un proceso interior inteligente hasta que el trabajo está hecho.

La única intervención a nivel de supervisor es:

```bash
# kill the fleet
pkill -9 bash
```

Ese es todo el protocolo de apagado. No hay un drenado ordenado ni un "por favor, termina tu tarea actual". Envías SIGKILL a los bucles de bash y los agentes mueren a mitad de un pensamiento. La próxima vez que los arranques, retoman el trabajo desde donde los haya dejado `git pull`.

### Por qué funciona

Un Ralph loop es la forma adecuada para el trabajo de agentes por tres razones:

1. **De todos modos, los LLM no tienen estado entre sesiones.** Fingir que son procesos de larga duración solo esconde el colapso de la ventana de contexto detrás de trucos cada vez más desesperados.
2. **Reiniciar es gratis.** Un Claude nuevo que lee el repo sale más barato que un Claude viciado que ha llenado su contexto con 3 horas de experimentos fallidos.
3. **El aislamiento de fallos viene gratis.** Si una sesión se descarrila, la siguiente no hereda los escombros — hereda el estado de git, que es la única fuente de verdad.

---

## Coordinación basada en git (sin orquestador)

Esta es la parte que sorprende a la mayoría: **no hay un orquestador central.** Nada reparte tareas. Nada sabe quién está haciendo qué. No hay ningún dashboard que diga "agent-7 está trabajando ahora en struct-packing".

En su lugar, la flota se coordina mediante dos primitivas:

1. Un **repo git bare** al que cada contenedor hace push y del que hace pull.
2. Un directorio llamado `current_tasks/` que contiene **archivos de bloqueo** — uno por cada tarea en curso, escritos como `current_tasks/<task-name>.txt`.

El prompt de cada agente le dice, en esencia:

> "Mira los TODO abiertos, los tests que fallan y los archivos de progreso. Elige la siguiente cosa más obvia en la que nadie esté trabajando ahora mismo. Deja un archivo de bloqueo para ella. Haz el trabajo. Haz commit. Elimina el bloqueo. Sal."

Este es el ciclo de vida de cada sesión:

```
 ┌──────────────────────────────────────────────────────────────┐
 │  1. git clone / pull                                         │
 │  2. scan repo → pick task T                                  │
 │  3. git add current_tasks/T.txt   ← claim the lock           │
 │  4. git push                      ← publishes the claim      │
 │  5. work on T (write code, run tests, commit)                │
 │  6. git pull --rebase             ← grab peers' changes      │
 │  7. resolve merges / re-run tests                            │
 │  8. git push                      ← ship it                  │
 │  9. git rm current_tasks/T.txt    ← release lock             │
 │ 10. git push                                                 │
 │ 11. exit → Ralph loop spawns a new Claude in a new container │
 └──────────────────────────────────────────────────────────────┘
```

### La condición de carrera, y por qué gana git

Dos agentes se despiertan al mismo tiempo. Ambos miran las tareas abiertas. Ambos deciden que lo más obvio es "arreglar el segfault en codegen/x86.rs". Ambos escriben `current_tasks/fix-segfault-x86.txt`. Ambos hacen `git push`.

Un push gana. El otro push es rechazado — `non-fast-forward`. Ese agente hace `git pull --rebase`, ve que el bloqueo ya existe, se da cuenta de que llegó tarde a la fiesta y se va a elegir otra tarea.

Esta es la jugada: **el modelo de concurrencia de git es también el modelo de concurrencia del equipo de agentes.** Los bloqueos, los merges y la resolución de conflictos salen gratis porque git ya los resuelve. No construyes un paper de sistemas distribuidos encima de tus LLM; heredas uno de 2005.

---

## Principio de diseño 1: escribe tests para Claude, no para ti

Esta es la lección que tatuaría en la frente de cualquiera que construya harness de agentes.

Cuando un humano lee un test que falla, obtiene mucho gratis: puede echar un vistazo a 500 líneas de salida, notar un patrón sospechoso, sostener una hipótesis en la cabeza y ponerse a depurar. Un LLM en un bucle no puede hacer bien ninguna de esas cosas. Tu harness de tests tiene que estar diseñado para sus limitaciones, no para las tuyas.

### Contaminación de la ventana de contexto

El comportamiento por defecto de la mayoría de los test runners es "volcarlo todo a stdout". Eso está bien para un humano que hace scroll en una terminal; es catastrófico para Claude. Mil líneas de salida de tests se comen la ventana de contexto y, para cuando Claude está razonando sobre el bug, ya ha olvidado el prompt.

**Solución**: haz que el harness de tests sea extremadamente escueto por defecto y envía la verbosidad a archivos.

```python
def run_test(name: str) -> TestResult:
    result = execute(name)
    # Human-visible (and LLM-visible) output: one line.
    if result.ok:
        print(f"PASS {name}")
    else:
        print(f"ERROR {name}  see logs/{name}.log")
    # Everything else goes to disk.
    write(f"logs/{name}.log", result.full_output)
    return result
```

Ahora Claude ve:

```
PASS  tests/struct_layout_01
PASS  tests/struct_layout_02
ERROR tests/struct_layout_03  see logs/struct_layout_03.log
PASS  tests/struct_layout_04
```

Claude puede hacer `grep ERROR` sobre toda la ejecución, elegir un fallo y luego hacer `cat` solo del log relevante. El contexto se mantiene pequeño. La atención se mantiene enfocada.

### El marcador `ERROR`

Fíjate en ese literal `ERROR`. Es deliberado. Un marcador consistente y fácil de buscar con grep es una de las convenciones con mayor retorno de inversión en cualquier harness de agentes. Significa que Claude puede recorrer miles de resultados de tests con un solo `grep -l ERROR logs/`. No escribas "failed" en un sitio, "FAIL" en otro y "❌" en un tercero. Elige uno. Ponlo en todas partes.

### Ceguera temporal

Claude no tiene reloj. No puede distinguir entre "este test es lento" y "este test se ha colgado". Si dejas que un agente ejecute la suite de tests completa en cada sesión, la mitad de tus agentes se quedarán ahí sentados 40 minutos, decidirán que no está pasando nada, matarán la suite y probarán algún refactor descabellado.

**Solución**: añade un modo de submuestreo `--fast` que ejecute el 1–10% de los tests, elegidos de forma determinista por agente:

```python
def select_tests(all_tests: list[str], agent_id: str, fraction=0.05):
    # Same agent → same subsample within a session.
    # Different agents → different subsamples, so the fleet covers
    # more ground than any single agent does.
    rng = seeded_random(agent_id)
    k = max(1, int(len(all_tests) * fraction))
    return rng.sample(all_tests, k)
```

Aquí importan dos propiedades:

- **Determinista por agente**: el mismo agente que ejecuta el mismo comando dos veces ve los mismos resultados. Si no, Claude no puede razonar sobre si su cambio arregló algo.
- **Distinto en toda la flota**: cada agente explora un rincón distinto de la suite de tests, y la unión de su cobertura es mucho mayor que la de cualquier agente individual.

### Archivos de progreso y README

La única pieza de memoria de larga duración es el sistema de archivos. Los agentes de Carlini mantienen:

- `README.md` en la raíz de cada módulo: *qué hace, qué funciona, qué no*.
- `PROGRESS.md` y archivos de progreso por área: *qué se ha intentado, qué falló, cuál es la teoría actual*.

No son para humanos. Son para el próximo Claude que se despierte. Cuando tratas los archivos de progreso como **mensajes para tu yo del futuro**, se convierten en el artefacto más valioso del repo.

---

## Principio de diseño 2: descomposición de tareas apta para el paralelismo

El paralelismo no es una propiedad de tu equipo. Es una propiedad de tu *trabajo*.

### Modo fácil: muchos fallos independientes

El caso ideal para un equipo de agentes es una suite de tests con muchos tests independientes que fallan. 200 tests que fallan, 16 agentes: cada agente toma uno, lo arregla, hace commit y sigue con otro. Conflictos mínimos. Escalado lineal. Todos se van a casa contentos.

```
┌───────────────────────┐
│  200 failing tests    │
├───────────────────────┤
│  agent-1 → test 47    │
│  agent-2 → test 113   │
│  agent-3 → test 2     │
│  agent-4 → test 88    │
│   ...                 │
└───────────────────────┘
```

### Modo difícil: un único build monolítico

Ahora imagina que el objetivo es: *compilar el kernel de Linux*. Hay una sola tarea. Un solo build. Un solo artefacto que falla. Los 16 agentes empiezan a leer el código fuente del kernel y a proponer arreglos. Se sobrescriben unos a otros. No se ponen de acuerdo sobre si arreglar el bug en el parser o en el codegen. El repo se convierte en un derbi de demolición.

Ahora, más agentes es *peor*. Lanzar más Claudes contra un único problema indivisible es la forma de quemar $20K en una tarde sin nada que mostrar.

La solución no es "añadir un orquestador". La solución es **descomponer el monolito en fallos independientes**. Lo que nos lleva a la idea más ingeniosa de todo el proyecto.

---

## GCC como oráculo: bisección del kernel

Cuando el equipo intentó compilar el kernel de Linux con su nuevo compilador, las cosas se rompieron de formas espectaculares y enmarañadas. Cientos de archivos contribuían a una única imagen rota. Nadie — ni Claude ni un humano — podía mirar "el kernel no arrancó" y decirte cuál de los 20,000 archivos C había expuesto el bug.

La jugada: **usar GCC como oráculo que se sabe correcto y dejar que Claude compile solo un subconjunto**.

```
┌────────────────────────────────────────────────────────────┐
│  For each kernel .c file:                                  │
│    flip a coin biased toward GCC (say 95/5)                │
│    → if GCC: compile with GCC (trusted)                    │
│    → if Claude: compile with Claude's compiler             │
│                                                            │
│  Link everything into a kernel image. Boot it.             │
│                                                            │
│  If it boots: great. Try a larger Claude subset.           │
│  If it breaks: Claude's subset contains the bug.           │
│                 → bisect the subset, narrow down,          │
│                   identify the specific failing file,      │
│                   file a focused bug report,               │
│                   add it as an isolated failing test.      │
└────────────────────────────────────────────────────────────┘
```

Pseudocódigo:

```python
def locate_bad_file(c_files: list[str]) -> str:
    # Standard bisection against a known-good oracle.
    lo, hi = 0, len(c_files)
    while hi - lo > 1:
        mid = (lo + hi) // 2
        subset = c_files[lo:mid]
        image = build_kernel(subset, compiler="claude",
                             rest_compiler="gcc")
        if boots(image):
            lo = mid       # bug is in the upper half
        else:
            hi = mid       # bug is in the lower half
    return c_files[lo]
```

Una vez que has localizado el bug en un solo archivo, has dado el paso crítico: has convertido un fallo monolítico en un **caso de prueba independiente y reproducible**. Ahora vuelves al modo fácil — un test concreto que falla y del que un Claude puede hacerse cargo.

La forma general de este patrón:

> **Cuando una tarea es demasiado grande para paralelizarla, encuentra un oráculo de confianza, pasa la mayor parte de la carga de trabajo por el oráculo y deja que tus agentes vayan desgastando un subconjunto cada vez más pequeño hasta que cada fallo restante sea local.**

Este es un patrón de diseño de harness, no un patrón de compiladores. Se aplica a cualquier caso en el que tengas un sistema monolítico con una referencia de confianza — pipelines de datos, subcomponentes de entrenamiento de modelos, generación de configuración, incluso el renderizado de UI.

---

## Especialización de roles de los agentes

Los 16 agentes son el mismo binario de Claude, pero sus prompts les asignan *trabajos* distintos. Parece algo menor; no lo es. Dar a cada agente un rol diferenciado reduce drásticamente la patología de "todos se amontonan alrededor del mismo fallo".

Cinco roles del proyecto, parafraseados:

```
┌──────────────────────────┬──────────────────────────────────┐
│ Role                     │ Prompt flavor                    │
├──────────────────────────┼──────────────────────────────────┤
│ duplicate-code-cleaner   │ Find repeated patterns, extract  │
│                          │ helpers, reduce LOC without      │
│                          │ changing behavior.               │
├──────────────────────────┼──────────────────────────────────┤
│ performance-tuner        │ Profile, find hot paths, apply   │
│                          │ local optimizations. Do not      │
│                          │ change semantics.                │
├──────────────────────────┼──────────────────────────────────┤
│ codegen-optimizer        │ Focus on the backend. Improve    │
│                          │ emitted assembly quality.        │
├──────────────────────────┼──────────────────────────────────┤
│ design-critic            │ Do not write code. Read the repo │
│                          │ and file TODOs for design smell, │
│                          │ dead code, inconsistency.        │
├──────────────────────────┼──────────────────────────────────┤
│ doc-maintainer           │ Keep README / PROGRESS files     │
│                          │ honest and current.              │
└──────────────────────────┴──────────────────────────────────┘
```

La separación de roles importa porque **cambia qué tareas considera un agente "las más obvias".** Un `design-critic` que mira el repo ve un "siguiente trabajo" distinto al que ve un `performance-tuner` que mira el mismo repo. La flota cubre más superficie de trabajo sin que ningún planificador central decida quién hace qué.

Para tu propio harness, la regla general es: **si dos agentes chocan una y otra vez, suele ser porque sus prompts no diferencian cómo es el "siguiente paso obvio".**

---

## Cuándo no construir un equipo de agentes

La parte honesta del artículo. Los equipos de agentes son caros, incómodos y, de vez en cuando, mágicos. No son la herramienta adecuada para la mayor parte del trabajo. *No* construyas uno si se cumple cualquiera de estas condiciones:

- **El proyecto es pequeño.** Si una sola sesión de Claude enfocada puede terminar la tarea de una pasada, una flota de 16 va a producir sobrecarga de coordinación, conflictos de merge y una factura de $500 por un trabajo de $5. Un cuchillo afilado vale más que dieciséis romos.
- **El trabajo requiere una coordinación estrecha.** Los diseños con muchas decisiones transversales — esquemas de API, invariantes de protocolo, modelos de datos compartidos — quedan destrozados por los agentes en paralelo. Los agentes son buenos en "ve a arreglar este test que falla". Son malos en "pongámonos de acuerdo sobre cómo debería ser la jerarquía de tipos de error".
- **No tienes un buen oráculo de tests.** Un compilador tiene la suite de torture tests de GCC y un kernel que arranca o no arranca. La mayor parte del software no tiene una señal de "¿funcionó?" fiable, automatizable y determinista. Sin ella, tus agentes optimizan para lo que comprueba el verificador, no para lo que realmente quieres — y, como el verificador es imperfecto, optimizan para lo que no es.
- **No puedes reiniciar a bajo costo.** Los Ralph loops asumen que reiniciar es gratis. Si tus agentes necesitan 30 minutos de calentamiento antes de hacer trabajo útil, el bucle se amortiza mal y la flota rinde menos que un único proceso de larga duración.

Si se cumple alguna de estas condiciones, usa un solo Claude con un buen prompt y no vayas más allá.

---

## Lo que esto enseña a quienes construyen harness

Si nos alejamos del proyecto concreto, hay cinco ideas que se trasladan limpiamente:

1. **Git es la primitiva de coordinación de agentes.** No construyas una cola de tareas, un servicio de bloqueos ni un bus de mensajes. Usa git. Bloqueos, merges, resolución de conflictos, historial, rollback — lo obtienes todo gratis, y lo diseñó gente que ya había pensado a fondo en la concurrencia.
2. **La calidad de la suite de tests es el techo de la capacidad del agente.** Claude solo puede ser tan bueno como la señal que le das. Invierte de forma desproporcionada en tests, oráculos y verificadores. Un agente mediocre con una gran suite de tests supera a un gran agente con una suite de tests mediocre todas y cada una de las veces.
3. **Diseña el harness para Claude, no para ti.** Salida escueta por defecto. Marcadores `ERROR`. Logs completos en archivos. Submuestreo determinista. Archivos de progreso como cartas a futuras sesiones. Cada una de estas cosas existe porque el agente es distinto de ti — más olvidadizo, más fácil de distraer, ciego al tiempo.
4. **Descompón los monolitos con oráculos que se saben correctos.** Cuando un problema se resiste al paralelismo, no añadas más agentes; añade una referencia de confianza, pasa el grueso del trabajo por ella y deja que los agentes ataquen un residuo cada vez menor. GCC como oráculo es un patrón general.
5. **Especializa mediante prompts.** El mismo modelo, trabajos distintos. La forma más barata y que mejor escala de lograr que 16 agentes no se pisen entre sí es darles definiciones distintas de "siguiente paso obvio".

La factura de $20,000 pagó un compilador. El bonus gratuito fue un plano de cómo funcionan los equipos de agentes cuando funcionan.

---

## Lecturas adicionales

Dentro de esta guía:

- [multi-agent-orchestration.md](./multi-agent-orchestration.md) — patrones para coordinar flotas de agentes más allá de los Ralph loops.
- [sandbox.md](./sandbox.md) — aislamiento por agente con Docker y repos git bare.
- [sub-agent.md](./sub-agent.md) — cuándo lanzar un subagente en lugar de añadir otro agente del mismo nivel a la flota.

Recursos externos:

- Nicholas Carlini / Anthropic Engineering — [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler)
- [anthropics/claudes-c-compiler](https://github.com/anthropics/claudes-c-compiler) — el repo real, con harness y todo. Lee los prompts. Son el producto.
