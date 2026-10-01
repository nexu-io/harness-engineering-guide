---
title: "Initializer + Coding Agent: un patrón de harness en dos fases"
author: Nexu
date: "2026-04-19"
description: "Por qué un único bucle de agente con compactación no puede construir un proyecto de varios días, y cómo dividir el harness en una fase Initializer y una fase Coding que se repite lo soluciona."
tags: [harness, long-running-agents, context-engineering, patterns]
---

# Initializer + Coding Agent: un patrón de harness en dos fases

Si alguna vez le has dado a un modelo de programación de frontera un prompt como *"constrúyeme un clon de Claude.ai"* y te has ido a hacer otra cosa toda la tarde, ya sabes cómo termina: un repositorio con un formulario de login que funciona, media lista de mensajes, un `TODO: hook up streaming` a mitad de archivo y un mensaje de commit muy seguro de sí mismo. El modelo se quedó sin contexto.

El instinto es culpar al modelo. Casi siempre es culpa del harness.

Este artículo trata sobre un patrón concreto que soluciona este tipo de fallo: **divide tu agente de larga duración en dos fases: un Initializer (inicializador) que se ejecuta una sola vez y un Coding Agent (agente de codificación) que se ejecuta muchas veces, donde cada sesión implementa exactamente una funcionalidad partiendo de un estado limpio.**

Se basa en [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), con una referencia en el [quickstart de autonomous-coding](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding). Quiero desgranar *por qué* funciona, no solo qué aspecto tiene.

---

## Idea clave: la compactación no basta

La respuesta habitual a "las ventanas de contexto son finitas" es la compactación. Resumir lo antiguo, conservar lo nuevo, repetir el bucle para siempre.

La compactación sirve para una refactorización de dos horas. Se viene abajo en un desarrollo de dos días.

Apunta Opus 4.5 sobre el Agent SDK a un prompt de alto nivel como "construye un clon de Claude.ai" y observa:

- La sesión 1 escribe mucho código y alcanza el límite de contexto con funcionalidades a medio terminar.
- La sesión 2 lee un resumen compactado (una versión narrativa y con pérdidas de lo que pasó) y tiene que reconstruir la intención a partir de él.
- La sesión 3 lee una compactación de la compactación. La información se degrada geométricamente.

Para la sesión 4, el modelo está jugando al teléfono roto con su yo del pasado. No sabe qué funcionalidades están terminadas, cuáles están a medias y cuáles se inventó al escribir el resumen.

**La compactación es memoria dentro del contexto. Los agentes de larga duración necesitan memoria fuera del contexto**: archivos, estado estructurado, historial de git. Cosas que el agente vuelve a leer en cada sesión, no cosas que arrastra hacia delante a base de resúmenes.

Esa es la tesis. Todo lo demás es mecánica.

---

## Dos modos de fallo con los que te vas a encontrar

Antes de llegar al patrón, seamos concretos sobre lo que sale mal sin él. Dominan dos modos de fallo.

### (A) Tendencia al one-shot

El modelo intenta hacerlo todo en una sola sesión. Ante un prompt grande, escribe una solución grande. El contexto se llena. Sigue empujando. La sesión termina con funcionalidades a medio implementar, `// TODO` repartidos a mitad de función, una suite de pruebas que no se ejecuta y ningún commit limpio al que volver. El modelo no tiene ni idea de que está roto: se quedó sin espacio antes de poder comprobarlo.

### (B) Victoria prematura

Más traicionera. La sesión 2 lee las notas de progreso de la sesión 1: "implementados login, mensajería, streaming". El modelo mira el código, ve algo que *parece* login + mensajería + streaming y declara el proyecto terminado. No lo ejecutó. No probó el flujo. Se fió del relato.

La victoria prematura es la otra cara del one-shot. El one-shot falla porque el modelo intenta hacer demasiado; la victoria prematura falla porque el siguiente modelo se fía del optimismo del anterior. Cualquier harness para trabajo de larga duración tiene que resolver **ambos** a la vez. Por eso el enfoque ingenuo de "simplemente repetir el bucle con compactación" no basta: la compactación refuerza el relato de la sesión anterior, que es justo lo contrario de lo que quieres cuando ese relato es demasiado optimista.

---

## El harness en dos fases

La solución es estructural. Un solo agente no lo hace todo. Tienes dos roles, con responsabilidades distintas y ciclos de vida distintos.

```
 ┌──────────────────────────────────────────────────────────────┐
 │                        HARNESS DRIVER                        │
 │                     (your Python script)                     │
 └──────────────────────────────────────────────────────────────┘
                  │                              │
                  │ runs once                    │ runs N times
                  ▼                              ▼
 ┌──────────────────────────┐     ┌──────────────────────────────┐
 │    INITIALIZER AGENT     │     │        CODING AGENT          │
 │                          │     │                              │
 │ • read spec / brief      │     │ • pwd + read git log         │
 │ • write init.sh          │     │ • read claude-progress.txt   │
 │ • write feature_list.json│     │ • read feature_list.json     │
 │ • write progress file    │     │ • pick highest-priority unit │
 │ • git init + first commit│     │ • run init.sh (dev server)   │
 │                          │     │ • implement ONE feature      │
 │                          │     │ • e2e test via browser       │
 │                          │     │ • flip passes: true          │
 │                          │     │ • commit + update progress   │
 └──────────────────────────┘     └──────────────────────────────┘
              │                                  ▲
              │                                  │
              └───── clean state repo ───────────┘
                     (shared on disk)
```

El inicializador se ejecuta **una vez**. Su trabajo es convertir un encargo humano difuso en un plan concreto y legible por máquina, más un esqueleto de proyecto ejecutable.

El agente de codificación se ejecuta **muchas veces**, y cada invocación es un proceso nuevo sin memoria de la anterior. Obtiene su memoria leyendo los archivos que las sesiones anteriores escribieron en disco.

Dos agentes, dos propósitos, un sistema de archivos compartido.

---

## El agente inicializador

El inicializador es la única fase que piensa en todo el proyecto a la vez. Cuando termina, nadie vuelve a tener una visión global: cada sesión de codificación trabaja en local.

Exactamente cuatro artefactos:

1. **`init.sh`**: un script que prepara el proyecto a partir de un checkout recién clonado (instala dependencias, ejecuta las migraciones, arranca el servidor de desarrollo en segundo plano e imprime la URL). Cada sesión de codificación lo ejecuta primero. Si `init.sh` está roto, nada más importa.
2. **`feature_list.json`**: el backlog descompuesto. Los detalles del formato, en la siguiente sección.
3. **`claude-progress.txt`**: notas breves en prosa sobre dónde está el proyecto y qué viene a continuación. Se actualiza al final de cada sesión.
4. **Un commit inicial de git**: esqueleto, scripts, lista de funcionalidades y archivo de progreso, todo en `HEAD`. A partir de aquí, cada sesión termina con un commit. `git log` es la fuente de verdad sobre lo que realmente se ha entregado.

El inicializador no implementa funcionalidades. No elige colores. Pone la mesa.

---

## Diseño de la lista de funcionalidades: por qué JSON es mejor que Markdown

"Eso no es más que una lista de tareas, ¿por qué no una checklist en Markdown?"

Porque cuando le das a Claude un archivo Markdown, lo trata como prosa. La prosa es editable. El modelo, con la mejor de las intenciones, reescribirá tus prioridades, reformulará las descripciones, fusionará dos funcionalidades porque "quedaba más limpio" y dividirá una en cinco porque "aclara la intención". Las listas de tareas en Markdown son arenas movedizas para los agentes.

JSON es diferente. Los modelos están entrenados para tratar JSON como datos estructurados: algo de lo que lees y en lo que escribes campos concretos, no algo que reescribes a la ligera. Combinado con una regla explícita de que solo un campo es modificable, JSON se convierte en un estado externo prácticamente a prueba de balas.

Un esquema razonable:

```json
{
  "project": "claude-ai-clone",
  "created_at": "2026-04-19T10:00:00Z",
  "features": [
    {
      "id": "auth-01",
      "title": "Email + password sign up",
      "description": "User can create account with email + password. Passwords hashed with bcrypt. Email uniqueness enforced.",
      "priority": 1,
      "depends_on": [],
      "acceptance": [
        "POST /api/signup returns 201 with session cookie",
        "duplicate email returns 409",
        "password stored as bcrypt hash, not plaintext"
      ],
      "passes": false
    },
    {
      "id": "auth-02",
      "title": "Email + password sign in",
      "description": "User can log in with credentials from auth-01.",
      "priority": 2,
      "depends_on": ["auth-01"],
      "acceptance": [
        "POST /api/signin with valid creds returns 200 + cookie",
        "wrong password returns 401",
        "signed-in user can load /app"
      ],
      "passes": false
    },
    {
      "id": "chat-01",
      "title": "Minimal chat page with message list",
      "description": "Authenticated user sees a chat page with past messages rendered from the DB.",
      "priority": 3,
      "depends_on": ["auth-02"],
      "acceptance": [
        "GET /chat renders <ul> of messages",
        "unauthenticated GET /chat redirects to /signin"
      ],
      "passes": false
    }
  ]
}
```

La disciplina queda codificada en el prompt de sistema del agente de codificación:

> Solo puedes modificar el campo `passes`. Es inaceptable eliminar o editar pruebas, criterios de aceptación, descripciones o la estructura de este archivo. Si crees que una funcionalidad es incorrecta, detente e infórmalo; no la reescribas en silencio.

Ese lenguaje no es exceso de cautela: es lo que sostiene todo. El modelo lee "inaceptable" como una regla estricta. En la práctica, basta para mantener el archivo estable a lo largo de decenas de sesiones.

`passes: false` es el otro detalle crítico. Es la única palanca del agente. Cuando una sesión implementa una funcionalidad, pasa las pruebas e2e y hace un commit limpio, cambia el booleano a `true`. Un solo campo (ni prosa, ni sensaciones) es la forma en que las sesiones futuras saben qué está realmente terminado.

---

## El agente de codificación: un ritual de arranque, no un todo vale

Cada vez que el agente de codificación se despierta, ejecuta el mismo ritual de cinco pasos antes de tocar una sola línea de código. No es opcional.

```
1. pwd                         → confirm we're in the project
2. git log --oneline -20       → what shipped, most recent first
   cat claude-progress.txt     → narrative notes from last session
3. cat feature_list.json       → what's done, what's next, what's blocked
4. bash init.sh                → install, migrate, start dev server
5. hit the app in a browser    → verify last session's work still works
```

Solo después del paso 5 el agente elige una funcionalidad y empieza a escribir código.

Llámalo **bootstrap de contexto**: el equivalente fuera del contexto de la compactación. En lugar de heredar un resumen, el agente reconstruye su contexto de trabajo a partir de archivos en disco. Las mismas fuentes canónicas, en el mismo orden, en cada sesión.

Algunas cosas que vale la pena dejar claras:

- **El git log antes que las notas de progreso.** Git es el ground truth; las notas de progreso son optimistas. Si no coinciden, gana git.
- **`init.sh` no es negociable.** Si el servidor de desarrollo no arranca, nada de lo que afirmó la sesión anterior importa.
- **Verificación E2E antes de elegir una nueva funcionalidad.** Esto es lo que acaba con la victoria prematura. No te fías del "terminado" de la sesión anterior: abres el navegador.

En el paso 3 el agente elige *la única funcionalidad de mayor prioridad con `passes: false` y todas sus dependencias satisfechas*. No dos. No "un grupo". Una. Y se detiene cuando esa está en verde y con su commit hecho.

Una funcionalidad por sesión acaba con ambos modos de fallo a la vez: acaba con el one-shot porque el contrato restringe el alcance de forma artificial, y acaba con la victoria prematura porque el "terminado" no se autodeclara: es una prueba e2e que pasa sobre una unidad con un alcance claramente definido.

---

## Las pruebas end-to-end son la capa de confianza

Las pruebas unitarias son necesarias pero insuficientes. Las escribió el agente de codificación: no pueden ser lo único que las verifique. Si el modelo entendió mal la especificación, las pruebas unitarias estarán mal de la misma forma que la implementación, y pasarán de una manera que no significa nada.

Las pruebas end-to-end son donde obtienes una señal independiente. Levanta la aplicación real, manéjala como lo haría un usuario y mira qué pasa.

En la práctica, eso significa automatización del navegador. [Puppeteer MCP](https://github.com/modelcontextprotocol/servers) funciona bien: el agente puede navegar, rellenar formularios, hacer clic y hacer aserciones sobre el DOM.

Una pasada de verificación para `auth-01`:

```
→ navigate to http://localhost:3000/signup
→ fill #email with "test+{{timestamp}}@example.com"
→ fill #password with "correct-horse-battery-staple"
→ click button[type=submit]
→ assert url === "/app"
→ assert response cookie "session" is set
→ navigate to /signup again with same email
→ fill + submit
→ assert error text contains "already exists"
```

Tres cosas: (1) se ejecuta contra el servidor real que arrancó `init.sh`, no contra un mock; (2) comprueba comportamiento observable (URLs, DOM, cookies), no funciones internas; (3) es lo bastante barata como para ejecutarla en cada sesión, así que la comprobación del bootstrap de "¿sobrevivió el trabajo de la sesión anterior?" es también una pasada e2e sobre las funcionalidades que ya estaban en verde.

Esto es lo que hace que `passes: true` signifique algo.

---

## Commits en estado limpio: git y archivo de progreso juntos

Al final de cada sesión de codificación ocurren dos cosas, en secuencia:

1. `git commit -m "feat(auth-01): email+password signup"`: el código entra en el repositorio.
2. `claude-progress.txt` recibe un breve añadido: qué se entregó, qué es delicado y qué debería mirar primero la siguiente sesión.

Hacen trabajos distintos. Git es la capa de **verdad**: solo admite añadidos, tiene marcas de tiempo y el diff no se negocia. `claude-progress.txt` es la capa de **pistas**: notas para el siguiente agente del tipo "las plantillas de email están en `/lib/email/`, hice monkeypatch del cliente SMTP para las pruebas, cuidado con la condición de carrera en `/api/signin` que esquivé con un reintento".

Ambos se leen al inicio de cada sesión. Ninguno basta por sí solo. Git sin pistas es escueto y cuesta reconstruir la intención a partir de él. Las pistas sin git se desvían de la realidad. Juntos forman la memoria fuera del contexto que sustituye a la compactación.

Ambos deberían terminar la sesión en un estado *limpio*: sin cambios sin commit, sin archivos a medio terminar, sin un servidor de desarrollo roto. Si la funcionalidad no está terminada al llegar al límite de contexto, **la sesión vuelve al último commit limpio e informa de que "no está terminada"** en lugar de hacer commit de trabajo roto. Así es como mantienes git fiable.

---

## Dónde encaja este patrón (y dónde no)

Sé honesto sobre la forma de tu proyecto antes de recurrir a esto.

**Buenos casos:** aplicaciones web (descomponibles en funcionalidades, testeables e2e), CLIs (cada subcomando es una unidad natural), herramientas internas / dashboards / paneles de administración, pipelines de datos con etapas discretas.

**Malos casos:** investigación sobre un único algoritmo, como "diseña un mecanismo de atención mejor" (no se puede descomponer en `passes: true/false`), bases de código muy acopladas donde tocar una función obliga a cambiar todo lo demás, y cualquier cosa cuyo valor resida en las *relaciones* entre componentes: la corrección de un compilador está en invariantes globales, no en "añadir lexer" + "añadir parser".

Regla general: si puedes escribir la aceptación como "un usuario (o una shell) hace X y observa Y", este patrón funciona. Si no, elige otro harness.

---

## Esbozo de implementación

El propio driver del harness es pequeño. La mayor parte del trabajo está en los dos prompts de sistema.

```python
# harness.py — pseudocode, omit the error handling for clarity
from pathlib import Path
import json, subprocess, time
from claude_sdk import run_agent

PROJECT = Path("./project")

def initialize(brief: str) -> None:
    """Run once. Turns a brief into a runnable scaffold."""
    run_agent(
        system_prompt=INITIALIZER_PROMPT,
        user_prompt=brief,
        workdir=PROJECT,
        allowed_tools=["write_file", "run_shell", "git"],
        # the initializer is expected to produce:
        #   init.sh, feature_list.json, claude-progress.txt, first git commit
    )
    assert (PROJECT / "feature_list.json").exists()
    assert (PROJECT / "init.sh").exists()

def next_feature() -> dict | None:
    features = json.loads((PROJECT / "feature_list.json").read_text())["features"]
    features.sort(key=lambda f: f["priority"])
    for f in features:
        if f["passes"]:
            continue
        if all(done(dep) for dep in f["depends_on"]):
            return f
    return None  # everything done

def done(feature_id: str) -> bool:
    features = json.loads((PROJECT / "feature_list.json").read_text())["features"]
    return any(f["id"] == feature_id and f["passes"] for f in features)

def code_one_feature() -> bool:
    feat = next_feature()
    if feat is None:
        return False
    run_agent(
        system_prompt=CODING_PROMPT,         # includes the startup ritual
        user_prompt=f"Implement feature {feat['id']}: {feat['title']}",
        workdir=PROJECT,
        allowed_tools=["read_file", "write_file", "run_shell", "git", "puppeteer"],
    )
    # agent is expected to leave a clean commit + updated progress file
    return True

if __name__ == "__main__":
    if not (PROJECT / "feature_list.json").exists():
        initialize(open("brief.md").read())
    while code_one_feature():
        time.sleep(1)  # fresh process each iteration — no state carried over
    print("all features passed.")
```

Dos cosas que debes interiorizar: **cada llamada a `run_agent` es un proceso completamente nuevo**: sin memoria compartida, sin ventana de contexto compartida; la memoria es el sistema de archivos. Y **el driver es tonto a propósito**: no elige funcionalidades, no valida el trabajo ni interpreta resultados. Toda la inteligencia está en los prompts y en los artefactos.

---

## Reflexión final

Este patrón no funciona porque el inicializador o el agente de codificación sean listos. Funciona porque **la pregunta "¿qué sé?" la responden los archivos en disco, no el contenido de la ventana de contexto.**

Cada vez que trasladas estado de dentro del contexto a fuera del contexto, ganas durabilidad y no pierdes nada importante. El harness en dos fases es una forma con opinión propia de hacer ese traslado, aplicada al problema concreto de construir software a lo largo de muchas sesiones.

Si tu agente de larga duración no deja de "olvidar", la solución casi nunca es una ventana de contexto más grande. Son más archivos.

---

## Lecturas adicionales

- [scheduling-and-automation.md](./scheduling-and-automation.md): cómo despertar al agente de codificación de forma programada sin que un humano tenga que vigilarlo
- [long-running-harness.md](./long-running-harness.md): la familia más amplia de patrones en la que encaja este
- [memory-and-context.md](./memory-and-context.md): un análisis más profundo de la memoria fuera del contexto, la organización de archivos y los rituales de bootstrap
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents): Anthropic Engineering, el material original
- [quickstart de autonomous-coding](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding): implementación de referencia funcional del patrón en dos fases
