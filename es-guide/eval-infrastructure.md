---
title: "Ruido de infraestructura en las evaluaciones de agentes"
description: "Por qué la configuración de CPU, RAM y timeouts puede mover las puntuaciones de los benchmarks agénticos más que la distancia entre los mejores modelos, y qué hacer al respecto."
author: Nexu
date: 2026-04-16
tags: [evals, infrastructure, agentic-benchmarks, harness-engineering]
---

# Ruido de infraestructura en las evaluaciones de agentes

Actualizas tu modelo. Tu puntuación en SWE-bench sube dos puntos. ¿Lo celebramos?

Quizá. O quizá simplemente le diste un núcleo de CPU extra al contenedor de la eval.

Un trabajo reciente del equipo de ingeniería de Anthropic pone cifras concretas a algo que quienes construyen harness sospechaban desde hace tiempo: **la configuración de la infraestructura puede mover las puntuaciones de los benchmarks agénticos hasta 6 puntos porcentuales**, a menudo más que la distancia que separa a los mejores modelos en las clasificaciones públicas. Este hallazgo debería cambiar la forma en que todo equipo de evaluación piensa en la configuración de su harness.

Esta guía desglosa el problema, recorre los datos y ofrece consejos concretos para configurar entornos de evaluación que midan la capacidad del modelo y no la suerte de la infraestructura.

---

## Por qué las evals agénticas no son benchmarks estáticos

Un benchmark tradicional (MMLU, HumanEval, HellaSwag) es, en esencia, una llamada a función. Envías un prompt, recibes una respuesta y la puntúas. El entorno de cómputo apenas importa. Una VM de 2 núcleos y una estación de trabajo de 64 núcleos producen puntuaciones idénticas, porque la inferencia del modelo la gestiona una API remota y la máquina local solo orquesta la E/S.

Las evaluaciones agénticas rompen por completo esta suposición.

Cuando un agente aborda una tarea de SWE-bench, no se limita a generar un parche. Además:

- **Lanza procesos**: linters, ejecutores de tests, herramientas de compilación, a veces varios en paralelo.
- **Lee y escribe archivos**: navega por repositorios grandes y hace grep sobre miles de líneas.
- **Itera**: ejecuta tests, lee los fallos, edita código y vuelve a ejecutar los tests.
- **Gestiona el tiempo**: decide cuándo abandonar una estrategia y probar otra.

Cada uno de estos pasos depende del entorno de ejecución. Una batería de tests que termina en 8 segundos en una máquina rápida puede tardar 90 segundos en un contenedor limitado. Un agente al que se mata tras 5 minutos de tiempo real resolverá menos problemas que uno con 30 minutos, no porque el modelo sea peor, sino porque se acabó el tiempo.

**El entorno de ejecución forma parte de la prueba.** Esta es la diferencia fundamental. En los benchmarks estáticos, la infraestructura es fontanería de fondo. En las evals agénticas, la infraestructura es una variable experimental.

---

## El impacto oculto de la aplicación de límites de recursos

No todos los límites de recursos son iguales. Dos harness pueden anunciar un "límite de 4 GB de RAM" y producir puntuaciones significativamente distintas según *cómo* se aplique ese límite.

### Asignación garantizada vs. terminación forzosa

Considera dos estrategias de aplicación:

| Estrategia | Qué ocurre al llegar a 4 GB |
|---|---|
| **Asignación garantizada** | El contenedor tiene *garantizados* 4 GB. Ocasionalmente puede superarlos si el host tiene margen. Los procesos se ralentizan bajo presión de memoria, pero siguen ejecutándose. |
| **Umbral de terminación forzosa** | En el momento en que el contenedor toca los 4 GB, salta el OOM killer. El árbol de procesos del agente muere. La tarea falla. |

Mismo límite nominal. Resultados muy diferentes.

Con asignación garantizada, un agente que alcanza brevemente 4,2 GB mientras ejecuta una batería de tests sobrevive: el host absorbe el pico, el test termina y el agente lee la salida y continúa. Con terminación forzosa, ese mismo pico es una tarea fallida. El agente nunca tiene la oportunidad de recuperarse.

### CPU: cuotas vs. fijación de núcleos

Existe una división similar para la CPU:

- **Las cuotas de CPU** (p. ej., `--cpu-shares` de Docker) proporcionan acceso proporcional. Si el host está inactivo, tu contenedor obtiene todos los núcleos que quiera. Si el host está cargado, obtienes tu parte justa. Las puntuaciones pasan a depender de qué *otra cosa* se esté ejecutando en la máquina.
- **La fijación de CPU** (p. ej., `--cpuset-cpus=0-3`) dedica núcleos específicos. Es determinista, pero desperdicia recursos si la carga de trabajo del agente es irregular.

Si tu clúster de evaluación usa cuotas de CPU y ejecuta varias evals en paralelo en el mismo host, has introducido una correlación oculta entre tareas. La puntuación del agente A depende de si el agente B estaba compilando algo en ese mismo momento.

### Límites de tiempo: tiempo real vs. tiempo de CPU

La mayoría de los harness aplican un timeout de tiempo real por tarea. Pero el tiempo real es una función conjunta de la capacidad del modelo *y* de la velocidad de la infraestructura.

Un agente que genera un plan eficiente pero se ejecuta en una máquina lenta puede agotar el tiempo. El mismo agente en un hardware más rápido termina con minutos de sobra. El modelo no cambió. La puntuación sí.

Por eso la configuración de la infraestructura no es una nota al pie. **Es una variable experimental de primer orden.**

---

## Los datos: qué ocurre al escalar los recursos

El equipo de Anthropic llevó a cabo un experimento controlado: tomar el mismo modelo, el mismo scaffold de agente y el mismo conjunto de tareas, y variar solo la asignación de infraestructura. Probaron tres niveles:

- **1x**: una línea base restringida (representativa de configuraciones mínimas de CI).
- **3x**: el triple de CPU y RAM que la línea base.
- **Sin límite**: ningún límite artificial de recursos.

Los resultados se dividen claramente en dos regímenes.

### De 1x a 3x: eliminar los errores de infraestructura

Triplicar los recursos respecto a la línea base **redujo principalmente los fallos provocados por la infraestructura**. La tasa de errores de infraestructura bajó de aproximadamente un 5,8 % a un 2,1 %.

Son tareas en las que el enfoque del agente iba por buen camino, pero el entorno lo mató: OOM, timeout, disco lleno. Con 3x, esos modos de fallo desaparecen casi por completo.

Lo crucial es que el cambio en la puntuación global del benchmark entre 1x y 3x quedó **dentro del rango de la varianza normal entre ejecuciones**. Dicho de otro modo, la diferencia de puntuación era indistinguible del ruido.

¿Qué significa esto? Por debajo de cierto umbral de recursos, las diferencias de puntuación entre configuraciones (o entre ejecuciones) miden sobre todo **con qué frecuencia la infraestructura se interpone**, no lo capaz que es el modelo.

### De 3x a sin límite: los agentes aprovechan los recursos extra

Eliminar por completo los límites de recursos contó otra historia. Las puntuaciones subieron **de forma significativa**, muy por encima del umbral de ruido.

Con recursos ilimitados, los agentes mostraron un comportamiento cualitativamente distinto:

- **Exploración más agresiva.** Los agentes ejecutaron baterías de tests más grandes, probaron más estrategias de corrección en paralelo e iteraron más veces antes de rendirse.
- **Uso de herramientas más intensivo.** Sin preocuparse por la memoria, los agentes podían manejar más contexto: lecturas de archivos más grandes, resultados de grep más extensos, diffs más grandes.
- **Cadenas de razonamiento más largas.** Sin un límite de tiempo real ajustado, los agentes podían permitirse "pensar más": probar una estrategia, fallar, dar marcha atrás y probar otra.

Los recursos extra no solo evitaron fallos. **Ampliaron el conjunto de problemas que el agente podía resolver** al hacer posibles estrategias que eran inviables con presupuestos restringidos.

### La oscilación de 6 puntos

En todo el rango, desde 1x hasta sin límite, la diferencia de puntuación llegó a aproximadamente **6 puntos porcentuales**. Para ponerlo en contexto, en las clasificaciones recientes de SWE-bench, la distancia entre el sistema n.º 1 y el n.º 5 suele ser menor.

Esto significa que una decisión de configuración del harness (algo que podría decidir un ingeniero de DevOps al elegir el tamaño de un contenedor) puede tener más impacto en la puntuación publicada que las mejoras reales del modelo que se están evaluando.

---

## Implicaciones para la ingeniería de harness

Si construyes o mantienes un harness de evaluación, estos datos exigen un cambio en tu forma de pensar sobre la configuración de recursos.

### La configuración de recursos es una decisión de diseño, no un valor por defecto

La mayoría de los equipos tratan la configuración de la infraestructura como un detalle operativo. Alguien elige un tamaño de contenedor que "parece razonable" y nunca se vuelve a revisar. Los hallazgos de Anthropic muestran que esto equivale a elegir el nivel de dificultad de tu prueba sin documentarlo.

Cada parámetro de recursos (número de CPU, techo de RAM, espacio en disco, timeout de tiempo real, ancho de banda de red) es un **eje del espacio de diseño de tu evaluación**. Debería estar:

- **Documentado** en la especificación de la eval.
- **Bajo control de versiones** junto con las definiciones de tareas y la lógica de puntuación.
- **Informado** en cualquier resultado publicado.

### Por debajo de 3x, estás midiendo la infraestructura

Si tu entorno de evaluación tiene recursos limitados (como la mayoría de las configuraciones basadas en CI), una parte significativa de los fallos de las tareas pueden ser artefactos de la infraestructura y no limitaciones del modelo.

Antes de interpretar una caída de puntuación como una regresión del modelo, pregúntate:

- ¿El contenedor sufrió un OOM en alguna tarea?
- ¿Alguna tarea alcanzó el timeout de tiempo real?
- ¿Estás ejecutando varias evals en el mismo host con CPU compartida?

Si la respuesta a cualquiera de estas preguntas es "sí" o "no lo sé", tu relación señal-ruido puede ser peor de lo que crees.

### Las comparaciones requieren una infraestructura idéntica

Parece obvio, pero se incumple habitualmente. Dos equipos que evalúan en "SWE-bench" con distintos tamaños de contenedor, distintas asignaciones de CPU y distintos valores de timeout no están ejecutando el mismo benchmark. Sus puntuaciones no son directamente comparables.

Si tu harness no fija ni informa la especificación exacta de la infraestructura, **las comparaciones entre equipos no son fiables.**

---

## Consejos prácticos: configurar tu entorno de evaluación

A partir de los datos y los principios anteriores, este es un marco concreto para montar una infraestructura que mida lo que de verdad te importa.

### 1. Especifica un suelo y un techo

No uses un único valor de recursos. Define dos:

- **Suelo (mínimo garantizado):** los recursos que siempre están disponibles para el agente, independientemente de lo que ocurra en el host. Esto evita que la escasez de infraestructura corrompa tus resultados.
- **Techo (límite de ráfaga):** los recursos máximos a los que el agente puede acceder durante picos transitorios. Esto evita que un único proceso descontrolado desestabilice el host.

Por ejemplo:

```yaml
resources:
  cpu:
    floor: 4 cores (guaranteed)
    ceiling: 8 cores (burstable)
  memory:
    floor: 8 GB (guaranteed)
    ceiling: 16 GB (hard limit, OOM above this)
  timeout:
    per_task: 30 minutes (wall clock)
  disk:
    floor: 20 GB
```

El suelo garantiza la reproducibilidad. El techo evita costos descontrolados. Juntos, definen el "contrato de infraestructura" de la eval.

### 2. Fija el suelo en 3x tu configuración mínima viable

Los datos sugieren que, por debajo de ~3x la configuración mínima, estás midiendo principalmente ruido de infraestructura y no la capacidad del modelo. Usa esto como regla general:

1. Encuentra la **configuración mínima con la que un agente de rendimiento conocido puede completar la tarea mediana** sin errores de recursos.
2. **Multiplícala por 3.** Ese es tu suelo.

Esto no garantiza cero ruido de infraestructura, pero baja el umbral de ruido lo suficiente como para que las diferencias de puntuación tengan más probabilidades de reflejar diferencias reales de capacidad.

### 3. Monitoriza los fallos de infraestructura por separado

Registra estas métricas en cada ejecución de la eval:

- **Número de terminaciones por OOM**: cuántas tareas murieron por agotamiento de memoria.
- **Número de timeouts**: cuántas tareas alcanzaron el límite de tiempo real.
- **Número de discos llenos**: cuántas tareas se quedaron sin espacio en disco.
- **Tasa de errores de infraestructura**: (OOM + timeout + disco lleno) / total de tareas.

Informa de la tasa de errores de infraestructura junto a la puntuación del benchmark. Si supera el 2-3 %, tus resultados están contaminados. Arregla la infraestructura antes de interpretar la señal del modelo.

### 4. Aísla las ejecuciones de la eval

No compartas hosts entre ejecuciones de evals concurrentes a menos que uses un aislamiento estricto de recursos (cgroups con asignaciones garantizadas, no solo cuotas de CPU).

Mejor aún: **una ejecución de eval, una máquina** (o una VM / un pod dedicado). El costo marginal de una instancia dedicada es insignificante comparado con el costo de depurar una regresión fantasma de la puntuación que resulta ser culpa de vecinos ruidosos.

### 5. Versiona la especificación de tu infraestructura

Añade la configuración de la infraestructura a la especificación de tu eval bajo control de versiones:

```
eval-spec/
├── tasks/
├── scoring/
├── scaffold/
└── infrastructure.yaml    ← This is new. Treat it as mandatory.
```

Cuando publiques resultados, incluye la especificación de la infraestructura. Cuando compares ejecuciones, compara primero las especificaciones de infraestructura.

### 6. Ejecuta comprobaciones de sensibilidad a la infraestructura

Periódicamente (al menos una vez por trimestre o cada vez que cambies el entorno de evaluación), ejecuta el mismo modelo con recursos 1x, 3x y sin límite. Compara:

- Si las puntuaciones de 1x y 3x difieren más que tu varianza típica entre ejecuciones, tu suelo es demasiado bajo.
- Si las puntuaciones de 3x y sin límite son similares, tu configuración 3x basta para capturar la capacidad del modelo en este conjunto de tareas.
- Si 3x y sin límite siguen divergiendo, algunas tareas realmente requieren más recursos: plantéate si esas tareas están probando la capacidad del modelo o la capacidad de la infraestructura.

---

## La visión de conjunto

La conversación sobre el ruido de infraestructura es, en realidad, una conversación sobre **qué estamos midiendo**.

Una puntuación de benchmark no es una propiedad de un modelo. Es una propiedad de un *sistema*: modelo + scaffold + infraestructura + conjunto de tareas + función de puntuación. Cuando eliminamos la dimensión de la infraestructura y fingimos que la puntuación depende solo del modelo, nos engañamos a nosotros mismos, y potencialmente tomamos malas decisiones sobre qué modelos lanzar.

Para quienes construyen harness, la conclusión es sencilla: **trata la configuración de tu infraestructura con el mismo rigor que aplicas a tus definiciones de tareas y a tu lógica de puntuación.** No es fontanería. Es parte del experimento.

---

## Lecturas adicionales

- **Anthropic Engineering**: "Quantifying infrastructure noise in agentic coding evals" (abril de 2026). La fuente principal de los datos analizados en esta guía.
- **SWE-bench**: [swebench.com](https://www.swebench.com). El benchmark de programación agéntica más utilizado y el contexto de buena parte de esta discusión.
- **Docker Resource Constraints**: [docs.docker.com/config/containers/resource_constraints](https://docs.docker.com/config/containers/resource_constraints/). Referencia para entender las cuotas de CPU, los límites de memoria y el comportamiento ante OOM en entornos con contenedores.
- **Documentación de cgroups v2**: [kernel.org/doc/html/latest/admin-guide/cgroup-v2.html](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html). Cómo aplica Linux las garantías de recursos a nivel de kernel.

---

*La infraestructura no es el telón de fondo. En las evals agénticas, es el escenario, y el escenario cambia la actuación.*
