---
author: Nexu
---

# Glosario

Términos clave que se usan a lo largo de la guía de Harness Engineering, definidos en lenguaje sencillo.

---

**Harness**
El código que envuelve un modelo de IA y lo convierte en un agente funcional. Gestiona el bucle de herramientas, el contexto, la memoria y el flujo de decisiones. Sin un harness, tienes un chatbot; con uno, tienes un agente.

**Runtime**
El entorno de ejecución en el que se ejecuta un harness. Incluye el sistema operativo, el sistema de archivos, el acceso a la red y el sandbox. El runtime determina lo que el agente puede *hacer* físicamente; el harness determina lo que *elige* hacer.

**Framework**
Una biblioteca o un SDK para construir harness. Los frameworks ofrecen abstracciones (registros de herramientas, almacenes de memoria, plantillas de prompts) para que no tengas que construir desde cero. Ejemplos: LangChain, CrewAI, AutoGen. Un framework es una caja de herramientas; un harness es el producto terminado.

**Context Window** (ventana de contexto)
La cantidad máxima de texto (medida en tokens) que un modelo puede procesar en una sola solicitud. Normalmente entre 128K y 200K tokens en los modelos de frontera. Todo lo que el agente "sabe" durante un turno (instrucciones, memoria, historial de conversación, contenido de archivos) debe caber en esta ventana.

**Tool Loop** (bucle de herramientas)
El ciclo de ejecución central de un agente: llamar al modelo → el modelo solicita una herramienta → ejecutar la herramienta → devolverle el resultado → repetir. El bucle continúa hasta que el modelo produce una respuesta de texto final sin llamadas a herramientas. Todo harness implementa alguna versión de este bucle.

**Skill**
Un paquete de capacidades autocontenido que amplía las habilidades de un agente. Consiste en un archivo de instrucciones SKILL.md más el código o las plantillas de apoyo que necesite. Las skills son la parte "densa" del patrón "harness ligero, skills densas" (thin harness, thick skills): codifican el conocimiento del dominio para que el harness siga siendo genérico.

**AGENTS.md**
Un archivo de configuración que define cómo debe comportarse un agente dentro de un espacio de trabajo. Contiene instrucciones, convenciones, pautas de uso de herramientas y definiciones de flujos de trabajo. El harness lo lee al inicio de cada sesión. Es portable entre las implementaciones de harness que admiten esta convención.

**MEMORY.md**
Un almacén de memoria a largo plazo basado en archivos. Contiene el conocimiento curado que el agente necesita entre sesiones: preferencias del usuario, detalles del proyecto, lecciones aprendidas. A diferencia de los sistemas de memoria propietarios, MEMORY.md es legible por humanos, editable y portable.

**ReAct (Reasoning + Acting)** (razonar + actuar)
Un patrón de prompting en el que el modelo alterna entre pensar ("Debería buscar X") y actuar (llamar a una herramienta). Produce un bucle Pensamiento → Acción → Observación. La mayoría de los harness de agentes modernos implementan una variante de ReAct, a menudo de forma implícita a través del bucle de herramientas.

**Chain-of-Thought (CoT)** (cadena de pensamiento)
Una técnica de prompting en la que se anima al modelo a "pensar paso a paso" antes de producir una respuesta final. El pensamiento extendido (como el modo de pensamiento de Claude) es una implementación de esto a nivel de modelo: el modelo genera tokens de razonamiento internos antes de responder.

**HaaS (Harness as a Service)** (harness como servicio)
El patrón de desplegar harness de agentes como servicios gestionados en la nube. Un API gateway enruta las solicitudes a gestores de sesión, que las despachan a trabajadores de harness que se ejecutan en entornos aislados en sandbox. Permite alojar agentes en modo multiinquilino (multi-tenant) con aislamiento de sesiones y límites de recursos.

**Thin Harness** (harness ligero)
Una filosofía de diseño en la que el harness en sí es mínimo (solo el bucle de herramientas, la gestión de contexto y la orquestación de sesiones), mientras que la lógica específica del dominio vive en las skills. El harness es un motor genérico; las skills aportan la experiencia. Es lo opuesto a las arquitecturas de agentes monolíticas.

**Thick Skills** (skills densas)
La contraparte del "harness ligero". Las skills contienen las instrucciones detalladas, los ejemplos y los flujos de trabajo para tareas específicas. Una skill densa para correo electrónico podría incluir plantillas, pautas de tono y reglas de formato específicas de cada plataforma. La skill es donde vive el conocimiento del dominio.

**Multi-Agent** (multiagente)
Una arquitectura en la que varios agentes de IA colaboran en una tarea. Los agentes pueden tener distintos roles (investigador, redactor, revisor), distintos modelos o distintos conjuntos de herramientas. Requiere orquestación: decidir qué agente hace qué y cómo se comunican.

**Sub-Agent** (subagente)
Un agente creado por otro agente para encargarse de una subtarea específica. El agente padre delega el trabajo y recibe los resultados cuando el subagente termina. Los subagentes tienen sesiones aisladas, pero pueden compartir la memoria o el acceso al espacio de trabajo. Es un patrón clave para descomponer tareas complejas.

**Sandbox**
Un entorno de ejecución aislado para ejecutar de forma segura las llamadas a herramientas del agente. Normalmente es un contenedor o una VM con acceso restringido al sistema de archivos, a la red y a los procesos. Evita que los agentes afecten de forma accidental (o maliciosa) al sistema host. Es esencial para las herramientas de ejecución de código.

**Context Compression** (compresión de contexto)
Técnicas para meter más información en una ventana de contexto de tamaño fijo. Incluyen resumir mensajes antiguos, eliminar contenido redundante, truncar las salidas grandes de las herramientas y cargar de forma selectiva solo los archivos relevantes. Son críticas cuando el historial de conversación supera el límite de contexto.

**Token Budget** (presupuesto de tokens)
La estrategia de asignación para repartir la ventana de contexto entre distintos fines: prompt de sistema, memoria, historial de conversación, resultados de herramientas y salida del modelo. Un presupuesto de tokens bien diseñado garantiza que la información más importante tenga prioridad. Ejemplo: reservar un 20% para el prompt de sistema, un 15% para la memoria, un 50% para el historial y un 15% para la respuesta.

**Session** (sesión)
Una única interacción continua entre un usuario y un agente. Las sesiones tienen un inicio (el usuario envía el primer mensaje), una parte intermedia (el intercambio de mensajes con llamadas a herramientas) y un final (el usuario se desconecta o la sesión expira). El estado de la sesión incluye el historial de conversación, las herramientas activas y cualquier contexto acumulado.

**Checkpoint**
Una instantánea guardada del estado del agente en un punto concreto de una sesión. Incluye el historial de conversación, los estados de las herramientas y cualquier resultado intermedio. Permite reanudar tras fallos o pausas sin empezar de cero. Es crítico en tareas de larga duración, en las que un fallo a mitad de camino sale caro.

**MCP (Model Context Protocol)**
Un protocolo abierto para conectar modelos de IA con herramientas y fuentes de datos externas. Define una interfaz estándar para que las herramientas (servidores MCP) puedan usarse desde cualquier harness compatible (cliente MCP). Busca resolver el problema de integración N×M: en lugar de que cada harness se integre con cada herramienta, ambos lados hablan MCP.

**Eval (Evaluation)** (evaluación)
El proceso de medir el rendimiento de un agente frente a criterios definidos. Incluye pruebas de comportamiento (¿llamó el agente a las herramientas correctas?), pruebas de resultado (¿fue correcto el resultado?) y pruebas económicas (¿cuánto costó?). Las evals son para los agentes lo que las pruebas unitarias son para el código: no son opcionales en producción.

**Trace** (traza)
Un registro completo de una sesión del agente: cada mensaje enviado, cada herramienta llamada, cada resultado recibido y la salida final. Las trazas se usan para depurar (¿qué salió mal?), para evaluar (¿cómo se desempeñó el agente?) y para pruebas de regresión (¿la nueva versión es peor?). Es el equivalente para agentes de un archivo de log.

---

