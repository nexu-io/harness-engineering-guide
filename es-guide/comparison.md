---
author: Nexu
---

# Comparación de las principales implementaciones de harness

Esta es una comparación objetiva de los harness de agentes más destacados a mediados de 2025. El campo avanza rápido: los detalles concretos pueden cambiar, pero los patrones arquitectónicos son estables.

## Tabla general

| Proyecto | Gestión del contexto | Memoria | Skills / herramientas | Multiagente | Código abierto |
|---|---|---|---|---|---|
| **OpenClaw** | Inyección de contexto guiada por AGENTS.md. Carga los archivos del espacio de trabajo, las skills y la memoria en cada sesión. Compresión del contexto mediante resúmenes. | Basada en archivos: MEMORY.md (largo plazo), registros diarios (memory/YYYY-MM-DD.md), wiki/ para conocimiento estructurado. Totalmente portable. | Sistema de skills: cada skill es un SKILL.md + archivos de apoyo. Instalables desde ClawdHub. Compatible con el protocolo MCP. | Creación de subagentes con aviso de finalización por push. El orquestador delega tareas y los resultados se anuncian automáticamente. | ✅ Código abierto |
| **Claude Code** | Ventana de contexto de 512K. Carga archivos bajo demanda mediante la herramienta read. CLAUDE.md para instrucciones a nivel de proyecto. Compacta los mensajes antiguos cuando el contexto se llena. | Basada en sesiones. Sin memoria persistente entre sesiones por defecto. CLAUDE.md aporta continuidad al proyecto. Archivos gestionados por el usuario. | Herramientas integradas: read, write, edit, exec, búsqueda web. Extensible mediante servidores MCP. Sistema de permisos (allow/deny/ask). | Agente único. Sin soporte nativo de subagentes. Puede invocar otras herramientas CLI mediante exec. | ✅ Código abierto |
| **Codex (OpenAI CLI)** | Carga la estructura del repositorio + los archivos relevantes. AGENTS.md para instrucciones. Entorno de ejecución en sandbox. | Sin memoria persistente. Lee archivos del proyecto (README, AGENTS.md) para obtener contexto. El estado de la sesión se reinicia en cada ejecución. | Integradas: lectura/escritura de archivos, exec, búsqueda web. Por defecto se ejecuta en un sandbox sin red. La red se puede habilitar por sesión. | Agente único. Sin orquestación multiagente. Diseñado para ejecutar una sola tarea. | ✅ Código abierto |
| **Cline** | Extensión de VS Code. Carga los archivos abiertos + los archivos relevantes del espacio de trabajo. Archivo de instrucciones personalizadas. Ventana deslizante para gestionar el contexto. | Sin memoria persistente integrada. Depende de los archivos del espacio de trabajo y del historial de la conversación dentro de la sesión de VS Code. | Operaciones con archivos, comandos de terminal, automatización del navegador. Soporte de servidores MCP para la extensibilidad. Flujo de aprobación de acciones. | Agente único. Sin soporte multiagente. Supervisión humana (human-in-the-loop) mediante solicitudes de aprobación en VS Code. | ✅ Código abierto |
| **Aider** | Contexto integrado con Git. Los archivos se añaden explícitamente al contexto con /add. El mapa del repositorio ofrece una visión de todo el proyecto. Edición basada en diffs. | El historial de Git como memoria implícita. Sin sistema de memoria dedicado. El historial de la sesión persiste dentro de la sesión de terminal. | Conjunto de herramientas acotado: edición de archivos (formato diff), operaciones de Git, linting, testing. Sin sistema de plugins. | Agente único. Sin multiagente. Diseñado para programación en pareja (humano + un agente). | ✅ Código abierto |
| **Cursor** | Integrado en el IDE. Indexación completa del repositorio con embeddings. Carga los archivos relevantes mediante búsqueda semántica. Menciones con @ para contexto explícito. | Sin memoria persistente del agente. El índice del código base sirve como conocimiento implícito. .cursorrules para la configuración del proyecto. | Edición de código, terminal, operaciones con archivos, consulta de documentación. Contexto del depurador integrado. Sin marketplace de plugins. | Agente único. Sin multiagente. La indexación en segundo plano es asíncrona, pero no se basa en agentes. | ❌ Propietario |
| **Nexu** | Plataforma de mensajería instantánea nativa para agentes. Espacio de trabajo por agente con AGENTS.md, SOUL.md, USER.md, MEMORY.md. Las skills inyectan contexto especializado. | Completa: MEMORY.md (largo plazo, curada), registros diarios, base de conocimiento wiki/, TOOLS.md (notas específicas del entorno). Continuidad entre sesiones por diseño. | Marketplace de skills. Cada skill es autocontenida, con instrucciones en SKILL.md. Herramientas a nivel de plataforma: calendario, correo, mensajería, navegador, cámara, nodos. | Multiagente nativo. Creación de subagentes, mensajería entre canales, programación de tareas con cron. Los agentes pueden coordinarse a través de canales de mensajería instantánea. | ❌ Propietario (plataforma) |

## Análisis en profundidad: diferencias clave

### Estrategia de contexto

Cómo decide cada harness qué mostrarle al modelo:

```
Aider          : Explicit — user adds files manually (/add, /drop)
Claude Code    : On-demand — agent reads files as needed
Cursor         : Semantic — embeddings index, auto-retrieves relevant code
OpenClaw/Nexu  : Config-driven — AGENTS.md declares what to load
Codex          : Repo-aware — scans structure, loads relevant files
Cline          : IDE-aware — open tabs + workspace files
```

**Compromiso:** El control explícito (Aider) aporta precisión, pero exige esfuerzo del usuario. La recuperación semántica (Cursor) es automática, pero puede pasar por alto archivos o incluir los equivocados. El enfoque guiado por configuración (OpenClaw) es predecible, pero requiere una configuración inicial.

### Arquitectura de memoria

```python
# Type 1: No memory (Claude Code, Codex, Cursor, Cline)
# Each session starts fresh. Context comes from project files.
context = load_project_files()  # That's it

# Type 2: File-based memory (OpenClaw, Nexu)
# Persistent knowledge across sessions, user-editable.
context = (
    load_project_files()
    + load_memory("MEMORY.md")
    + load_daily_log(today)
    + load_wiki_if_relevant(task)
)

# Type 3: Embedded memory (proprietary platforms)
# Stored in vector DB, retrieved by similarity.
context = (
    load_project_files()
    + vector_search(task, memory_store)
)
```

### Extensibilidad de las herramientas

| Enfoque | Proyectos | Ventajas | Desventajas |
|---|---|---|---|
| **Protocolo MCP** | OpenClaw, Claude Code, Cline | Protocolo estándar, interoperable | Sobrecarga de configurar servidores |
| **Archivos de skill** | OpenClaw, Nexu | Autocontenidos, compartibles, marketplace | Formato propio |
| **Solo integradas** | Aider, Codex | Simple, predecible | Extensibilidad limitada |
| **Integración con el IDE** | Cursor, Cline | Contexto rico del editor | Atado al IDE |

### Patrones multiagente

La mayoría de los harness son de agente único. El soporte multiagente varía considerablemente:

```python
# OpenClaw/Nexu: First-class sub-agent spawning
subagent = spawn(
    task="Research competitor pricing",
    model="gpt-4o",
    tools=["web_search", "web_fetch"],
)
# Result auto-announces when done — no polling needed

# Claude Code: Indirect multi-agent via exec
result = exec("claude-code --print 'Review this PR'")
# Works but no structured communication

# Others: No native multi-agent
# Workaround: multiple terminal sessions, manual coordination
```

## Elegir el harness adecuado

| Si necesitas... | Considera |
|---|---|
| Edición de código profunda con integración en el IDE | **Cursor** o **Cline** |
| Agente de programación basado en terminal | **Claude Code** o **Aider** |
| Ejecución de tareas en sandbox | **Codex** |
| Orquestación multiagente | **OpenClaw** o **Nexu** |
| Memoria persistente entre sesiones | **OpenClaw** o **Nexu** |
| Ecosistema de herramientas extensible | **OpenClaw** (skills + MCP) |
| Configuración mínima, que simplemente funcione | **Aider** |

## Lo que la tabla no muestra

- **Soporte de modelos** — La mayoría de los harness son agnósticos respecto al modelo (OpenClaw, Cline y Aider admiten muchos proveedores). Codex es exclusivo de OpenAI. Claude Code está centrado en Anthropic.
- **Costo** — Varía enormemente según el modelo elegido, el tamaño del contexto y la complejidad de la tarea. No es una característica del harness, sino un patrón de uso.
- **Velocidad** — Depende más de la latencia del modelo que de la arquitectura del harness. El soporte de streaming es universal.
- **Comunidad** — Los proyectos de código abierto (Aider, Claude Code, Cline, OpenClaw) tienen comunidades activas. El tamaño de la comunidad no equivale a calidad.

## Errores comunes

- **Elegir por el hype** — Elige el harness que se adapte a tu flujo de trabajo, no el que tenga más estrellas en GitHub.
- **Ignorar la memoria** — Si tus tareas abarcan varias sesiones, un harness sin memoria persistente te obliga a volver a explicar el contexto cada vez.
- **Suponer que "código abierto" significa "gratis"** — El harness es gratis; las llamadas a la API del modelo, no. Reserva presupuesto para los costos de API.

## Lecturas adicionales

- [Glosario →](/es/guide/glossary) — Términos clave que se usan a lo largo de esta guía
