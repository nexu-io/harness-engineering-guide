---
author: Nexu
---

# Managed Agents: desacoplar el cerebro de las manos

> **Idea clave:** Un contenedor de agente monolítico —donde el harness, el sandbox y el estado de la sesión comparten un único proceso— es una mascota que no te puedes permitir perder. Desacoplar el cerebro (harness + LLM) de las manos (sandbox + herramientas) y de la sesión (registro de eventos) convierte cada componente en ganado reemplazable y hace posible el escalado independiente, la recuperación ante fallos y el aislamiento de seguridad.

## El problema del monolito

La arquitectura de agente más sencilla lo mete todo en una sola caja:

```
┌──────────────────────────────────┐
│         Single Container          │
│                                   │
│  ┌─────────┐  ┌──────────────┐   │
│  │ Harness  │  │   Sandbox    │   │
│  │ (brain)  │  │ (code exec)  │   │
│  │          │  │              │   │
│  │ Session  │  │ Credentials  │   │
│  │ state    │  │ User files   │   │
│  └─────────┘  └──────────────┘   │
│                                   │
└──────────────────────────────────┘
```

Esto funciona para prototipos. En producción, falla de tres formas predecibles.

### Fallo 1: el problema de la mascota

En la analogía de [mascotas frente a ganado](https://cloudscaling.com/blog/cloud-computing/the-history-of-pets-vs-cattle/), una mascota es un servidor con nombre propio, cuidado a mano, que no te puedes permitir perder. El ganado es intercambiable: cuando un ejemplar muere, lo reemplazas.

Un contenedor de agente monolítico es una mascota. Si el contenedor se cae, la sesión se pierde. Si deja de responder, tienes que cuidarlo hasta que se recupere. No puedes simplemente matarlo y arrancar uno nuevo, porque el estado de la sesión —el historial completo de lo que ha hecho el agente— vive dentro.

### Fallo 2: el punto ciego de la depuración

Cuando un contenedor monolítico se cuelga, tu única ventana es el flujo de eventos externo. Pero un bug del harness, un paquete perdido y un contenedor caído se ven exactamente igual desde fuera. Para diagnosticar la causa real, un ingeniero necesita acceso a una shell dentro del contenedor, pero ese contenedor también guarda datos de usuario y credenciales. Depurar se convierte en un incidente de seguridad.

### Fallo 3: el límite de seguridad

El código no confiable que genera el agente se ejecuta en el mismo contenedor que las credenciales. A una inyección de prompts le basta con convencer al agente de que lea sus propias variables de entorno. Una vez que un atacante tiene esos tokens, puede lanzar sesiones sin restricciones. Limitar el alcance de los tokens ayuda, pero eso codifica suposiciones sobre lo que el modelo no puede hacer con tokens limitados, y los modelos son cada vez más inteligentes.

## La arquitectura de tres capas

La solución es descomponer el monolito en tres capas independientes, cada una con su propio ciclo de vida:

```
┌─────────────────────────────────────────────────────────┐
│                    Orchestration Layer                    │
│                                                          │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │    Brain      │  │ Session  │  │      Hands        │  │
│  │  (Harness +   │  │ (Event   │  │  (Sandbox A)      │  │
│  │   LLM calls)  │  │  Log)    │  │  (Sandbox B)      │  │
│  │              │  │          │  │  (MCP Tools)      │  │
│  │  Stateless   │  │ Durable  │  │  Disposable       │  │
│  └──────┬───────┘  └────┬─────┘  └────────┬──────────┘  │
│         │               │                  │             │
│         │  emitEvent()  │   execute()      │             │
│         ├──────────────►│◄─────────────────┤             │
│         │  getEvents()  │   provision()    │             │
│         ├──────────────►│                  │             │
│         └───────────────┴──────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Cerebro (harness)

El harness ejecuta el bucle agéntico: llama al LLM, enruta las llamadas a herramientas y gestiona el contexto. Lo fundamental es que el harness **no tiene estado**. No guarda ningún dato de sesión en memoria. Todo lo que debe perdurar va al registro de la sesión mediante `emitEvent()`.

Cuando un harness se cae, arranca uno nuevo, llama a `wake(sessionId)`, obtiene el registro de eventos con `getEvents()` y se reanuda desde el último evento. No se pierden datos. No hay que cuidar de nada. El harness se ha convertido en ganado.

### Sesión (registro de eventos)

La sesión es un **registro append-only** de todo lo que ha ocurrido: llamadas al LLM, resultados de herramientas, mensajes del usuario, eventos del sistema. Vive fuera tanto del harness como del sandbox, en almacenamiento duradero.

Interfaces clave:
- `emitEvent(sessionId, event)` — escribe un evento durante el bucle del agente
- `getEvents(sessionId, options)` — vuelve a leer eventos (segmentación por posición, filtrado)
- `getSession(sessionId)` — obtiene los metadatos y el estado

La sesión sobrevive tanto al harness como al sandbox. Si cualquiera de los dos se cae, la sesión permanece intacta.

### Manos (sandbox)

Los sandboxes son entornos de ejecución donde el agente ejecuta código, edita archivos y lanza comandos. Se crean bajo demanda mediante `provision({resources})` y se destruyen cuando ya no hacen falta.

El harness llama a los sandboxes igual que a cualquier otra herramienta: `execute(name, input) → string`. Si un sandbox muere, el harness captura el error como una llamada a herramienta fallida y se lo pasa al LLM. El modelo puede decidir reintentarlo en un sandbox nuevo.

## Sesión ≠ ventana de contexto

Esta distinción es la parte más sutil y más importante de la arquitectura.

La **sesión** es el registro completo y duradero de todo: potencialmente millones de tokens que abarcan horas o días de trabajo del agente. La **ventana de contexto** es el subconjunto de ese registro que el harness selecciona para la llamada actual al LLM, normalmente 128K-200K tokens.

```
Session (append-only event log, durable)
┌─────────────────────────────────────────────────────────────┐
│ event_1 │ event_2 │ ... │ event_500 │ ... │ event_2000     │
└─────────────────────────────────────────────────────────────┘
                                    │
                          getEvents(slice)
                                    │
                                    ▼
                    Context Window (selected subset)
                    ┌───────────────────────────┐
                    │ system_prompt             │
                    │ event_1950 ... event_2000 │
                    │ (50 most recent events)   │
                    └───────────────────────────┘
```

Esta separación tiene tres ventajas:

**1. Las decisiones irreversibles se vuelven reversibles.** La compactación (resumir el contexto antiguo para liberar espacio) destruye información de forma permanente. Con un registro de sesión duradero, el harness puede volver a leer cualquier evento pasado, incluso los que en su momento se compactaron y salieron de la ventana de contexto. Si un turno futuro necesita información del event_200, el harness puede recuperarla.

**2. La ingeniería de contexto pasa a ser responsabilidad del harness.** El harness decide qué entra en la ventana de contexto: eventos recientes, un resumen de los eventos antiguos, prompts de sistema, contenido de archivos relevantes. Distintas implementaciones de harness pueden usar estrategias distintas sin cambiar el formato de la sesión. La ingeniería de contexto de hoy puede ser un recorte a nivel de token; la de mañana, recuperación semántica. La sesión sigue siendo la misma.

**3. Las arquitecturas con varios cerebros se vuelven posibles.** Varios harness pueden leer el mismo registro de sesión simultáneamente. Un cerebro de planificación puede revisar el historial completo mientras un cerebro de ejecución se centra en los eventos recientes. Ambos leen de la misma fuente duradera.

## Seguridad: las credenciales nunca entran en el sandbox

La arquitectura desacoplada crea un límite de seguridad natural. Las credenciales viven en un almacén de secretos (vault) fuera del sandbox. El agente nunca maneja tokens directamente.

Dos patrones:

**Integradas en el recurso:** Para Git, el token de acceso se usa durante la inicialización del sandbox para clonar el repositorio y configurar el remoto local. `git push` y `git pull` funcionan desde dentro del sandbox sin que el agente llegue a ver nunca el token.

**Vault + proxy:** Para APIs externas (vía MCP), los tokens OAuth viven en un vault seguro. El agente llama a las herramientas MCP a través de un proxy. El proxy busca en el vault las credenciales de la sesión y hace la llamada externa. El sandbox nunca ve las credenciales.

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌──────────┐
│  Agent    │────►│  MCP      │────►│  Vault    │────►│ External │
│ (sandbox) │     │  Proxy    │     │ (secrets) │     │ Service  │
│           │     │           │     │           │     │          │
│ No creds  │     │ Session   │     │ OAuth     │     │          │
│ here      │     │ → creds   │     │ tokens    │     │          │
└───────────┘     └───────────┘     └───────────┘     └──────────┘
```

Aunque una inyección de prompts convenza al agente de rastrear todo su entorno, no hay credenciales que encontrar.

## Rendimiento: mejoras en el TTFT

En el diseño monolítico, cada sesión —incluso las que nunca tocan el sandbox— pagaba el costo completo de preparar el contenedor: clonar el repositorio, arrancar el proceso, obtener los eventos. La inferencia no podía empezar hasta que el contenedor estuviera listo.

Con la arquitectura desacoplada, el harness arranca de inmediato. El aprovisionamiento del sandbox se hace de forma diferida mediante una llamada a herramienta, y solo si hace falta. Resultados del despliegue en producción de Anthropic:

| Métrica | Monolítico | Desacoplado | Mejora |
|--------|-----------|-----------|-------------|
| TTFT p50 | referencia | ~40% de la referencia | **~60% de reducción** |
| TTFT p95 | referencia | ~10% de la referencia | **~90% de reducción** |

La mejora en p95 es espectacular porque el peor caso de arranque del contenedor (descargas de imágenes en frío, discos lentos) desaparece por completo de la ruta crítica para las sesiones que no necesitan un sandbox.

## Muchos cerebros, muchas manos

La arquitectura se extiende de forma natural en ambas dimensiones.

### Escalar cerebros

Escalar a muchas sesiones de agente concurrentes significa arrancar muchos harness sin estado. Como ningún harness guarda estado (todo lo que debe perdurar está en el registro de la sesión), el escalado es horizontal y trivial. Sin memoria compartida, sin bloqueos distribuidos, sin sincronización de estado.

### Escalar manos

Un solo cerebro puede conectarse a varios sandboxes. En la práctica, esto significa que el agente razona sobre varios entornos de ejecución y decide adónde enviar el trabajo:

```
┌──────────┐
│  Brain   │
│ (harness)│
└────┬─────┘
     │
     ├──► Sandbox A (Python environment)
     ├──► Sandbox B (Node.js environment)
     ├──► Sandbox C (Customer VPC)
     └──► MCP Tool Server (external APIs)
```

Los modelos anteriores no podían con esto: razonar sobre varios entornos de ejecución a la vez era demasiado complejo. A medida que mejoró la capacidad de los modelos, la suposición de un único contenedor se convirtió en el cuello de botella. La arquitectura desacoplada ya estaba preparada para cuando los modelos se pusieran al día.

### Integración con la VPC del cliente

Cuando todo se ejecutaba en un solo contenedor, conectarse a la infraestructura de un cliente implicaba hacer peering de red: la VPC del cliente tenía que ser accesible desde nuestro contenedor. Con la arquitectura desacoplada, el sandbox puede ejecutarse dentro de la VPC del cliente mientras el cerebro se ejecuta en nuestra infraestructura. El cerebro se comunica con el sandbox a través de la interfaz estándar `execute()`, independientemente de dónde se ejecute físicamente el sandbox.

## Antipatrones

### Guardar el estado de la sesión en el harness

```python
# ❌ Session state in harness memory
class HarnessWithState:
    def __init__(self):
        self.events = []  # Lost if harness crashes
        self.current_plan = None
    
    def run_turn(self, message):
        result = self.llm.call(self.events + [message])
        self.events.append(result)  # Only in memory
```

Si el harness se cae, todo desaparece. Emite siempre los eventos al registro de sesión duradero.

```python
# ✅ Session state externalized
class StatelessHarness:
    def run_turn(self, session_id, message):
        events = self.session_store.get_events(session_id)
        result = self.llm.call(events + [message])
        self.session_store.emit(session_id, result)  # Durable
```

### Credenciales en el sandbox

```python
# ❌ Passing API keys into the sandbox environment
sandbox.execute("export GITHUB_TOKEN=ghp_xxx && git push")
```

Estás a una sola inyección de prompts de una exfiltración. Usa en su lugar el patrón vault + proxy.

### Aprovisionamiento anticipado del sandbox

```python
# ❌ Provision sandbox before knowing if it's needed
sandbox = provision_sandbox(resources=large_config)  # 30s startup
result = llm.call(prompt)  # Might not even need the sandbox
```

Aprovisiona de forma diferida. Deja que el LLM decida, mediante una llamada a herramienta, si necesita un sandbox y de qué tipo.

## Lista de verificación de diseño

Antes de construir una arquitectura de agentes gestionados:

1. **Cerebro sin estado** — ¿puede el harness caerse y reiniciarse sin perder datos?
2. **Durabilidad de la sesión** — ¿se almacena el registro de eventos fuera tanto del cerebro como de las manos?
3. **Sandboxes desechables** — ¿se puede matar y reemplazar cualquier sandbox?
4. **Aislamiento de credenciales** — ¿son los secretos inaccesibles desde el sandbox?
5. **Aprovisionamiento diferido** — ¿se crean los sandboxes bajo demanda y no por adelantado?
6. **Estabilidad de las interfaces** — ¿son las interfaces cerebro↔manos lo bastante generales como para sobrevivir a las implementaciones actuales?

## Resumen

El contenedor de agente monolítico es el punto de partida natural: tenerlo todo en una caja es sencillo. Pero crea mascotas que no se pueden reemplazar, límites de seguridad que no se pueden hacer cumplir y cuellos de botella de rendimiento que no se pueden eliminar.

Descomponerlo en tres capas —cerebro sin estado, sesión duradera, manos desechables— resuelve los tres problemas. El cerebro se convierte en ganado (se cae y se reinicia). La sesión se convierte en la única fuente de verdad (sobrevive a todo lo demás). Las manos se convierten en recursos bajo demanda (se aprovisionan solo cuando hacen falta y se destruyen al terminar).

Es el mismo patrón que los sistemas operativos descubrieron hace décadas: virtualizar los componentes, hacer estables las interfaces y dejar que las implementaciones cambien libremente por debajo. A la syscall `read()` no le importa si está leyendo de un paquete de discos de la década de 1970 o de un SSD moderno. A la interfaz `execute()` no le importa si el sandbox se ejecuta en local, en la VPC de un cliente o en otro continente.

## Lecturas adicionales

- [Subagentes](sub-agent.md) — Lanzar agentes aislados con ciclos de vida independientes
- [Orquestación multiagente](multi-agent-orchestration.md) — Patrones para coordinar varios cerebros
- [Sandbox](sandbox.md) — Aislamiento y seguridad del entorno de ejecución
- [Programación de tareas y automatización](scheduling-and-automation.md) — Selección de la sesión de destino para trabajo periódico de larga duración
- [Anthropic: Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents) — Artículo original sobre la arquitectura
- [Anthropic: Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) — Patrones fundamentales de diseño de agentes
