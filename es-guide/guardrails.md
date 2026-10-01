---
author: Nexu
---

# Guardrails

> **Idea clave:** Un agente sin guardrails es un riesgo. El modelo hará exactamente lo que se le diga, incluido lo que le diga una inyección de prompts. Los guardrails son la capa de permisos entre "el modelo quiere hacer X" y "el harness realmente hace X".

## Por qué existen los guardrails

El modelo genera texto. Ese texto incluye llamadas a herramientas. El harness ejecuta esas llamadas a herramientas. Esto significa que cualquier cosa que influya en la salida del modelo puede influir en lo que hace el harness, incluido el contenido malicioso en archivos, páginas web o mensajes de usuario.

Esto es la **inyección de prompts**: un atacante incrusta instrucciones en los datos que lee el agente, y el modelo sigue esas instrucciones en lugar de la tarea original. Sin guardrails, una inyección de prompts puede:

- Borrar archivos (`rm -rf /`)
- Exfiltrar variables de entorno (claves de API, tokens)
- Ejecutar código arbitrario en el host
- Enviar mensajes no autorizados en nombre del usuario

Los guardrails convierten al harness en la autoridad final sobre qué acciones están permitidas, independientemente de lo que pida el modelo.

## El modelo de límite de confianza

Todo harness tiene un límite de confianza entre el modelo y el entorno de ejecución. El harness media en todos los cruces:

```
┌──────────────────────────────────┐
│           MODEL SPACE            │
│  (reasoning, tool call requests) │
└────────────┬─────────────────────┘
             │ tool call request
             ▼
┌──────────────────────────────────┐
│         GUARDRAIL LAYER          │
│  Permission check → Allow/Deny   │
└────────────┬─────────────────────┘
             │ approved call
             ▼
┌──────────────────────────────────┐
│        EXECUTION SPACE           │
│  (filesystem, network, shell)    │
└──────────────────────────────────┘
```

La capa de guardrails intercepta cada llamada a herramienta antes de ejecutarla. Puede:
- **Permitir** — ejecutarla tal como se pidió
- **Denegar** — devolver un error al modelo
- **Modificar** — reescribir la llamada (p. ej., restringir la ruta del archivo a un directorio seguro)
- **Preguntar** — pedir la aprobación de una persona antes de continuar

## Modelos de permisos

### Lista de permitidos (el más estricto)

Solo se permiten las acciones autorizadas explícitamente. Todo lo demás se deniega por defecto:

```python
ALLOWED_TOOLS = {
    "read_file": {"paths": ["/workspace/**"]},
    "write_file": {"paths": ["/workspace/**"]},
    "run_command": {"commands": ["npm test", "npm run build"]},
}

def check_permission(tool_name: str, args: dict) -> bool:
    if tool_name not in ALLOWED_TOOLS:
        return False
    policy = ALLOWED_TOOLS[tool_name]
    if "paths" in policy:
        return any(fnmatch(args.get("path", ""), p) for p in policy["paths"])
    if "commands" in policy:
        return args.get("command") in policy["commands"]
    return True
```

### Lista de bloqueados (permisivo)

Todo está permitido salvo las acciones bloqueadas explícitamente:

```python
BLOCKED_PATTERNS = [
    (r"rm\s+-rf\s+/", "Refusing to delete root filesystem"),
    (r"curl.*\|\s*sh", "Refusing to pipe remote script to shell"),
    (r"env\s+|printenv|echo\s+\$", "Refusing to expose environment variables"),
]

def check_command(command: str) -> tuple[bool, str]:
    for pattern, reason in BLOCKED_PATTERNS:
        if re.search(pattern, command):
            return False, reason
    return True, ""
```

### Aprobación por niveles

Cada nivel de riesgo activa un flujo de aprobación distinto:

| Nivel de riesgo | Ejemplos | Acción |
|-----------|----------|--------|
| **Bajo** | Leer archivos, buscar | Aprobación automática |
| **Medio** | Escribir archivos, ejecutar tests | Aprobación automática con registro |
| **Alto** | Ejecutar comandos de shell, peticiones de red | Requiere aprobación humana |
| **Crítico** | Borrar archivos, hacer push a git, enviar mensajes | Siempre requiere aprobación explícita |

```python
def get_risk_level(tool_name: str, args: dict) -> str:
    if tool_name == "read_file":
        return "low"
    if tool_name == "write_file":
        return "medium"
    if tool_name == "run_command":
        cmd = args.get("command", "")
        if any(k in cmd for k in ["rm", "git push", "curl"]):
            return "critical"
        return "high"
    return "medium"
```

## Aislamiento en sandbox

Los guardrails imponen políticas; los sandboxes imponen aislamiento. Un sandbox es un entorno de ejecución restringido que limita lo que el código puede hacer a nivel del sistema operativo:

| Tecnología | Nivel de aislamiento | Sobrecarga | Caso de uso |
|-----------|----------------|----------|----------|
| **chroot** | Solo sistema de archivos | Mínima | Restricción básica de rutas |
| **Docker** | Procesos + sistema de archivos + red | Baja | Desarrollo, CI/CD |
| **Firecracker microVM** | VM completa | Media | Producción multiinquilino |
| **gVisor** | A nivel de llamadas al sistema | Baja-media | Cargas de trabajo de alta seguridad |
| **WASM** | A nivel de lenguaje | Mínima | Agentes en el navegador |

La mayoría de los harness de producción usan Docker para desarrollo y Firecracker (o un equivalente) para producción. El principio clave: **la ejecución de código del agente nunca debería tener acceso al sistema de archivos, la red ni el espacio de procesos del host**.

## Saneamiento de entradas

Además de los guardrails a nivel de herramienta, el harness debería sanear las entradas para reducir el riesgo de inyección de prompts:

```python
def sanitize_tool_result(result: str, max_length: int = 50_000) -> str:
    """Truncate and mark external content as untrusted."""
    if len(result) > max_length:
        result = result[:max_length] + "\n[TRUNCATED]"
    # Wrap in markers so the model knows this is external data
    return f"<tool_result>\n{result}\n</tool_result>"
```

El contenido de fuentes externas (páginas web, archivos subidos por usuarios, respuestas de API) debería delimitarse claramente en el contexto para que el modelo pueda distinguir las instrucciones de los datos.

## Errores comunes

- **No tener ningún guardrail** — Lo habitual en la mayoría de los harness de aficionados. Aceptable para desarrollo local, desastroso para producción.
- **Guardrails solo en el prompt** — Decirle al modelo "no borres archivos" no es un guardrail. Una inyección de prompts puede anular esa instrucción. Los guardrails de verdad se imponen en el código, no en el texto.
- **Permisos demasiado restrictivos** — Nadie usará un agente que no puede hacer nada útil. Equilibra seguridad y utilidad.
- **No registrar las acciones denegadas** — Entender lo que el agente *intentó* hacer pero se le impidió es fundamental para depurar y mejorar los prompts.

## Lecturas adicionales

- [Simon Willison: Prompt Injection](https://simonwillison.net/series/prompt-injection/) — Serie completa sobre el modelo de amenazas
- [Anthropic: Mitigating Prompt Injection](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks) — Patrones de defensa prácticos
