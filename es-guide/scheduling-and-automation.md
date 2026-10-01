---
title: "Programación de tareas y automatización"
section: practice
author: Nexu
---

> **Idea clave:** Un agente que solo responde cuando le hablan es un chatbot; un agente que actúa según un calendario, ante eventos y por iniciativa propia es un sistema de productividad.

## ¿Por qué programar tareas?

La mayoría de la gente conoce a los agentes como interfaces conversacionales: tú escribes y él responde. Ese modelo mental limita su valor a "un motor de búsqueda más rápido". El verdadero salto llega cuando los agentes ejecutan trabajo *sin que se lo pidan*.

Considera la diferencia:

- **Reactivo:** "Resume mis correos no leídos." → El agente responde.
- **Programado:** Cada mañana a las 8:00, el agente lee tu bandeja de entrada, filtra lo urgente, da formato a un resumen y lo envía a tu canal de Slack. Te despiertas con un informe que nunca pediste.

El segundo patrón tiene un efecto acumulativo. Una tarea programada te ahorra cinco minutos al día. Diez tareas programadas transforman tu forma de trabajar. La programación de tareas convierte a un agente, de una herramienta que usas, en un sistema que trabaja para ti.

Este capítulo cubre las primitivas que hacen posible el trabajo programado de agentes dentro de un harness: el entorno de ejecución que aloja las herramientas, el contexto, la memoria y el ciclo de vida de ejecución de un agente.

---

## Tipos de trabajo programado de agentes

No toda la automatización sigue el mismo reloj. Cuatro patrones cubren todo el panorama:

### Temporizadores de un solo disparo

Una única ejecución diferida. El usuario dice "recuérdamelo en 20 minutos" o "envía ese correo de seguimiento a las 3 de la tarde". El harness crea un temporizador, lo dispara una vez y lo descarta.

Propiedades clave:
- Se dispara exactamente una vez
- A menudo se crea de forma conversacional ("recuérdame…")
- De vida corta: de minutos a horas, rara vez días
- No necesita lógica de recurrencia

Los temporizadores de un solo disparo son la primitiva de programación más sencilla. Solo requieren una marca de tiempo y un payload.

### Crons recurrentes

Un cron (llamado así por el daemon `cron` de Unix) es un trabajo que se ejecuta según un calendario repetitivo definido por una expresión cron: una sintaxis compacta que especifica minuto, hora, día, mes y día de la semana.

Ejemplos:
- `0 8 * * *` → todos los días a las 08:00
- `0 9 * * 1` → todos los lunes a las 09:00
- `*/30 * * * *` → cada 30 minutos

Los crons son la columna vertebral de la automatización de agentes. Resúmenes diarios, informes semanales, monitorización periódica: todo eso es territorio del cron.

### Activados por eventos

No toda la programación se basa en el tiempo. Hay trabajo que debe dispararse en respuesta a eventos externos:

- Se abre un nuevo Pull Request → se lanza un agente de revisión
- Termina un despliegue → se ejecutan smoke tests y se informa del resultado
- Llega un correo nuevo de un remitente VIP → se resume y se envía una alerta

La automatización activada por eventos requiere una fuente de eventos (webhook, polling o integración con la plataforma) y un mecanismo de despacho que cree un turno del agente cuando se dispara el evento. Aquí el harness no funciona con un reloj, sino con señales.

### Basados en heartbeat

Un heartbeat es un sondeo periódico en el que el harness inyecta un prompt en la *sesión principal* del agente a intervalos regulares (normalmente cada 15–60 minutos). El agente lee el prompt, decide qué revisar y, o bien actúa, o bien se queda en silencio.

A diferencia del cron, que crea ejecuciones aisladas, un heartbeat se ejecuta dentro de la conversación en curso. El agente tiene acceso a los mensajes recientes, al contexto del usuario y al estado de la sesión. Esto hace que los heartbeats sean ideales para agrupar varias comprobaciones ligeras en un solo turno.

Un prompt de heartbeat típico:

```
Read HEARTBEAT.md if it exists. Follow it strictly.
If nothing needs attention, reply HEARTBEAT_OK.
```

El agente puede revisar el correo, echar un vistazo al calendario, repasar las notificaciones: todo en un solo turno y todo con el contexto de la conversación.

---

## Patrones de implementación de cron

Los crons son la primitiva de programación más estructurada. Implementarlos bien exige atender a cuatro dimensiones: definición del calendario, sesión de destino, tipo de payload y entrega.

### Definición del calendario

Las **expresiones cron** usan el formato estándar de cinco campos:

```
┌───────── minute (0–59)
│ ┌─────── hour (0–23)
│ │ ┌───── day of month (1–31)
│ │ │ ┌─── month (1–12)
│ │ │ │ ┌─ day of week (0–7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

La **gestión de zonas horarias** es, con diferencia, la fuente más común de bugs en los crons. La regla es simple:

> **Almacena en UTC. Muestra en hora local.**

Internamente, el harness evalúa todas las expresiones cron en UTC. Al mostrarle al usuario su calendario, conviértelo a su zona horaria local. Cuando el usuario dice "todos los días a las 8 de la mañana", el harness debe saber *qué* 8 de la mañana: pregunta la zona horaria si no la conoces, almacena el equivalente en UTC y confirma de vuelta en hora local.

```
User: "Run my digest every morning at 8am"
Agent: "Got it — daily digest at 8:00 AM Asia/Shanghai (0:00 UTC). ✓"
```

Esto evita ambigüedades y resiste los cambios de horario de verano (en las zonas horarias que lo aplican).

### Sesión de destino

Cuando se dispara un cron, ¿*dónde* se ejecuta el agente? Hay dos modelos:

**Sesión aislada**: el cron lanza un turno independiente del agente con una ventana de contexto nueva. Sin historial de conversación. Sin mensajes previos. El agente empieza desde cero, ejecuta su tarea y termina.

Ventajas:
- Sin contaminación del historial: la sesión principal se mantiene limpia
- Contexto predecible: el agente solo ve lo que le proporciona el cron
- Paralelizable: varios trabajos cron pueden ejecutarse a la vez sin interferir entre sí
- Configurable: cada trabajo puede usar un modelo o un nivel de razonamiento distinto

Usa sesiones aisladas para tareas independientes: resúmenes, informes, comprobaciones de monitorización, recopilación de datos.

**Sesión principal**: el cron inyecta contenido en la sesión activa actual del usuario. El agente ve todo el historial de conversación y puede hacer referencia a mensajes recientes.

Ventajas:
- Contexto conversacional: el agente sabe de qué has estado hablando
- Continuidad: puede retomar hilos anteriores
- Menor sobrecarga: no hay que crear una sesión nueva

Usa la inyección en la sesión principal con moderación. Cada inyección se suma a la ventana de contexto, y demasiadas la inflarán (consulta los antipatrones más abajo).

### Tipos de payload

¿Qué entrega exactamente el cron cuando se dispara?

**agentTurn**: desencadena un ciclo completo de ejecución del agente. El agente recibe un prompt, tiene acceso a todas sus herramientas y skills, y puede tomar decisiones, llamar a APIs, leer archivos y producir resultados. Es el tipo de payload más potente.

Ejemplo: un cron de resumen diario se dispara con un payload `agentTurn`. El agente lee los correos vía IMAP, revisa el calendario, consulta el tiempo, lo reúne todo en un informe y lo envía a un canal. Autonomía total.

**systemEvent**: inyecta un mensaje de texto en la sesión sin desencadenar un turno completo del agente. Piensa en ello como dejar una nota en la conversación. El agente la verá en su siguiente turno (o heartbeat), pero no actúa de inmediato.

Ejemplo: un webhook recibe una notificación de despliegue e inyecta "Despliegue v2.3.1 completado con éxito" como systemEvent. El agente no necesita actuar, pero la información está disponible si el usuario pregunta por ella.

### Entrega

¿Adónde van los resultados?

- **Anunciar en un canal**: la salida del agente se envía a un canal de mensajería concreto (Slack, Discord, un grupo de Feishu, etc.). Es la forma de entrega más común para resúmenes y alertas.
- **Webhook**: los resultados se envían mediante POST a un endpoint HTTP para integrarse con sistemas externos.
- **Ninguna (silenciosa)**: el cron se ejecuta pero no produce ninguna salida externa. Es útil para tareas de mantenimiento en segundo plano, como la limpieza de memoria o la precarga de datos.

La configuración de entrega debe fijarse al crear el cron y quedar vinculada a la sesión de origen. Si un usuario crea un cron en un grupo de Feishu, los resultados deben entregarse en ese grupo, no seguir al usuario allí donde haya chateado más recientemente.

---

## Ejemplos reales

### Cron de LangSmith Deployments

La plataforma LangSmith de LangChain introdujo trabajos cron para su funcionalidad Deployments (consulta la [documentación de Cron Jobs de LangSmith](https://docs.langchain.com/langsmith/cron-jobs)). El modelo:

1. Crear un Deployment (un agente de LangGraph alojado)
2. Definir un calendario cron
3. En cada tick, el sistema crea un hilo (thread) nuevo y envía una entrada fija

Este enfoque es limpio y predecible. Cada ejecución recibe la misma entrada y un hilo nuevo, y produce una salida trazable en la interfaz de monitorización de LangSmith.

**Puntos fuertes:**
- Modelo mental simple: misma entrada, hilo nuevo, siempre
- Observabilidad completa mediante las trazas de LangSmith
- Se integra con la gestión de estado de LangGraph

**Limitaciones:**
- Entrada fija por cron: no puedes ajustar dinámicamente lo que hace el agente en función del contexto
- Un hilo por ejecución implica que no hay continuidad entre ejecuciones
- Atado a la infraestructura de Deployments de LangSmith

### Cron nativo del harness

El patrón de harness ofrece un modelo más rico:

1. Definir un cron con calendario, sesión de destino, payload y entrega
2. En cada tick, el harness lanza una sesión aislada (o inyecta en la principal)
3. El agente tiene acceso completo a las herramientas: puede leer archivos, llamar a APIs, buscar en la web y usar cualquier skill instalada
4. Los resultados se entregan en el canal configurado

```yaml
# Conceptual Cron definition
schedule: "0 8 * * *"          # 8:00 AM UTC
timezone: "Asia/Shanghai"       # Display reference
session: isolated               # Fresh context each run
payload: agentTurn              # Full Agent execution
model: claude-sonnet            # Can differ from default
delivery:
  type: announce
  channel: feishu-group-abc     # Pinned to originating session
prompt: |
  Generate today's morning briefing:
  1. Check unread emails for urgent items
  2. List today's calendar events
  3. Summarize overnight GitHub notifications
  Format as a concise digest.
```

**Diferencias clave respecto a LangSmith:**
- Prompts dinámicos: el agente decide qué hacer, no se limita a procesar una entrada fija
- Acceso completo a skills: puede usar cualquier herramienta que proporcione el harness
- Selección de modelo por trabajo: usa un modelo más barato para comprobaciones simples y uno más potente para el análisis
- Entrega flexible: canal, webhook o silenciosa

### Patrón de resumen diario

El caso de uso de cron más común. El flujo:

```
Cron fires (8:00 AM local)
  → Agent spawns in isolated session
  → Reads email (IMAP Tool)
  → Reads calendar (Calendar Tool)
  → Checks weather (Weather Skill)
  → Checks GitHub notifications (GitHub Skill)
  → Formats digest with priorities and highlights
  → Pushes to user's preferred channel
  → Session terminates
```

El multiplicador de valor: esto se ejecuta todos los días, tanto si el usuario se acuerda de pedirlo como si no. La información llega ya procesada y con formato.

### Patrón de monitorización

Un cron que revisa métricas y solo alerta cuando se superan los umbrales:

```
Cron fires (every 15 minutes)
  → Agent checks API response times
  → Compares against threshold (p99 < 500ms)
  → If healthy: silent (no delivery)
  → If degraded: alert to ops channel with details
  → Session terminates
```

La decisión de diseño clave: **alerta ante excepciones, no en cada comprobación.** Un cron de monitorización que envía "todo va bien" cada 15 minutos es ruido. Uno que permanece en silencio hasta que algo se rompe es señal.

---

## Heartbeat vs. cron: cuándo usar cada uno

Tanto el heartbeat como el cron permiten trabajo periódico de agentes, pero sirven a propósitos distintos.

| Dimensión | Heartbeat | Cron |
|-----------|-----------|------|
| **Temporización** | Aproximada (se acepta cierta deriva) | Exacta (se dispara según el calendario) |
| **Contexto** | Sesión principal (historial completo) | Sesión aislada (contexto nuevo) |
| **Comprobaciones por ejecución** | Varias (agrupadas) | Una sola tarea |
| **Impacto en la sesión** | Se suma a la ventana de contexto principal | Sin impacto en la sesión principal |
| **Configuración** | Editar HEARTBEAT.md | Definición explícita del cron |
| **Modelo** | Usa el modelo de la sesión | Se puede especificar por trabajo |

**Usa heartbeat cuando:**
- Quieras agrupar 3–5 comprobaciones ligeras (correo + calendario + notificaciones) en un solo turno
- El agente necesite el contexto de la conversación para decidir qué importa
- La precisión temporal no importe (cada ~30 minutos está bien)
- Quieras reducir el total de llamadas a la API combinando comprobaciones periódicas

**Usa cron cuando:**
- Importe la hora exacta ("a las 9:00 en punto cada lunes")
- La tarea deba ejecutarse de forma aislada, sin contaminar la sesión principal
- Quieras un modelo o un presupuesto de razonamiento distinto para la tarea
- La salida deba entregarse en un canal concreto sin tocar la sesión principal
- Se trate de recordatorios de un solo disparo ("recuérdamelo en 20 minutos")

**Regla general:** si tienes cinco cosas que revisar periódicamente y ninguna requiere una hora exacta, ponlas en HEARTBEAT.md en lugar de crear cinco trabajos cron. Si tienes una tarea que debe ejecutarse exactamente a las 9 de la mañana con un modelo específico y entregar en un canal concreto, eso es un cron.

---

## Antipatrones

### Bucles de polling

```python
# ❌ Don't do this
while True:
    result = check_something()
    if result.changed:
        notify()
    sleep(60)
```

Esto mantiene ocupado un proceso persistente, desperdicia cómputo y se salta la infraestructura de programación de tareas del harness. Usa en su lugar un cron con un intervalo de 1 minuto. El harness gestiona el ciclo de vida, los reintentos y la liberación de recursos.

### Contaminación de la sesión principal

Inyectar demasiados systemEvents en la sesión principal infla la ventana de contexto. Cada inyección añade tokens. Tras un día de inyecciones frecuentes, el contexto del agente está dominado por ruido del sistema en lugar de por conversación útil.

**Síntoma:** las respuestas del agente se ralentizan, pierden coherencia o pierden el hilo de los temas de conversación.

**Solución:** usa sesiones aisladas para el trabajo de alta frecuencia. Reserva la inyección en la sesión principal para eventos poco frecuentes y de alta señal que el usuario necesite ver en contexto.

### Sin timeout

Un trabajo cron que puede ejecutarse indefinidamente es una fuga de recursos. Si el agente se queda atascado (esperando a una API, atrapado en un bucle de razonamiento), el trabajo se cuelga para siempre.

**Solución:** todo trabajo cron debe tener un timeout. Un valor por defecto razonable es de 2–5 minutos para tareas simples y de 10–15 minutos para las complejas. Si un trabajo no puede completarse dentro de su timeout, debe fallar de forma visible, no colgarse en silencio.

### Entrega duplicada

```yaml
# ❌ Cron announces to channel AND agent manually sends message
delivery:
  type: announce
  channel: slack-general
prompt: |
  Check metrics and send results to #general  # Agent also sends!
```

Si el cron está configurado para anunciar los resultados en un canal y el prompt del agente también le indica que envíe un mensaje a ese mismo canal, el usuario recibe el mismo contenido dos veces.

**Solución:** elige un único mecanismo de entrega. O dejas que el harness anuncie, o dejas que el agente envíe el mensaje manualmente, pero nunca ambas cosas.

---

## Lista de verificación de diseño

Antes de crear cualquier trabajo programado de agentes:

1. **Zona horaria**: ¿conoces la zona horaria del usuario? Si no, pregúntala.
2. **Tipo de sesión**: ¿necesita contexto de conversación (principal) o una ejecución limpia (aislada)?
3. **Entrega**: ¿adónde deben ir los resultados? Vincúlala a la sesión de origen.
4. **Timeout**: ¿cuál es el tiempo máximo de ejecución aceptable?
5. **Modo de fallo**: ¿qué pasa si el trabajo falla? ¿Silencio? ¿Alerta? ¿Reintento?
6. **Frecuencia**: ¿encaja mejor como cron o como entrada de HEARTBEAT.md?
7. **Deduplicación**: ¿estás seguro de que los resultados no se entregarán dos veces?

Acierta con estos siete puntos y tu trabajo programado de agentes será fiable, predecible y realmente útil.

---

## Resumen

La programación de tareas es lo que separa una novedad conversacional de un sistema de productividad. El harness ofrece cuatro primitivas (temporizadores de un solo disparo, crons recurrentes, disparadores por eventos y heartbeats), cada una adecuada para un tipo distinto de automatización.

Las decisiones de arquitectura importan: almacena en UTC y muestra en hora local. Aísla las sesiones por defecto. Establece timeouts. Vincula la entrega al canal de origen. Agrupa las comprobaciones ligeras en heartbeats en lugar de lanzar muchos crons.

Un agente que actúa por iniciativa propia, según un calendario, sin que se lo pidan, ya no es un chatbot. Es infraestructura.
