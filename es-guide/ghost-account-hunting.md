# Toda startup de IA debería estar alerta: más de 1000 cuentas fantasma drenaron nuestra plataforma en 15 días

> **Nexu** es un cliente de escritorio de OpenClaw de código abierto, que se instala con un clic y pone la IA en tus manos, en local.
> GitHub: **[https://github.com/nexu-io/nexu](https://github.com/nexu-io/nexu)**
> ⭐ Si te resulta útil, una estrella significa muchísimo para nosotros.

Estamos construyendo **Nexu** 🦞, un cliente de escritorio de OpenClaw de código abierto en GitHub. Cuando los nuevos usuarios se registran, reciben créditos gratuitos para probar varios LLM en la plataforma.

Un día, mientras limpiábamos datos de usuarios, notamos algo raro: **un dominio de correo que nunca habíamos visto tenía un número anormalmente alto de usuarios registrados**. Más que muchos dominios corporativos. Estaba cerca de los primeros puestos de nuestra clasificación de dominios.

Este artículo es el registro completo de cómo pasamos de **"qué raro" → análisis en profundidad multidimensional → comparación con la línea base → conclusión**. Además, publicamos como código abierto toda la metodología de la investigación en forma de Skill instalable; la encontrarás al final.

## 01 / Un dominio que no debería estar en la clasificación

Cuando ordenamos los usuarios registrados por dominio de correo, arriba estaban los sospechosos habituales: gmail.com, qq.com y varios dominios corporativos.

Pero había un dominio sospechosamente alto (lo anonimizamos como **xx.love** a continuación). Tenía más de **1000 usuarios registrados**.

Un dominio del que nunca habíamos oído hablar, con más registros que muchos dominios empresariales. Eso, por sí solo, ya era una señal que merecía investigarse.

Una comprobación rápida de antecedentes:

- Registrado a principios de 2026, con protección de privacidad WHOIS: sin datos del titular
- DNS alojado en Cloudflare con registros MX: **capaz de enviar y recibir correo**
- Sin registros A, sin sitio web, sin licencia ICP

Un dominio creado exclusivamente para el correo, sin ninguna presencia web pública. Tenlo presente.

## 02 / Dos fases claramente diferenciadas

Al representar estas más de 1000 cuentas en una línea de tiempo, vimos que no estaban distribuidas de forma uniforme: **se dividían claramente en dos fases**.

**Fase 1 (días 1–7): sondeo de bajo volumen**

Desde unas pocas hasta unas decenas al día, ~150 en total. Los prefijos de correo eran variados: algunos parecían nombres reales (linlong, wuyan), otros eran entradas de prueba evidentes (ooo, qwe), y también había algunas cadenas mixtas. Sin un patrón coherente, como si alguien estuviera experimentando.

**Fase 2 (del día 8 en adelante): avalancha de alto volumen**

Más de 700 en un solo día. Los prefijos pasaron casi por completo a ser **cadenas alfanuméricas aleatorias de 6 caracteres** (p. ej., 01mh07, x9k2p3). En ventanas de 10 minutos vimos repetidamente ráfagas de 16–18 cuentas, con un intervalo de registro mediano de unos **37 segundos**.

No era solo un aumento de escala: **la estrategia de nombres cambió por completo**. De "alguien tecleando" a "un script haciendo el trabajo".

## 03 / Las huellas de User-Agent cambiaron en sincronía

El comportamiento de registro por sí solo quizá no fuera concluyente, pero los cambios de User-Agent añadieron otra capa de confirmación.

- Fase 1: casi exclusivamente **Chrome N (Windows)**
- Fase 2: el UA principal pasó a ser **Chrome N+1 (Windows)**

Además, los patrones de los prefijos de correo se correlacionaban con UA concretos:

- Prefijos "tipo nombre", "de 5 caracteres" y "de 7 caracteres" → casi todos Chrome N
- Prefijos "aleatorios de 6 caracteres" → abrumadoramente Chrome N+1

El cambio de prefijo y el cambio de UA ocurrieron a la vez. Parecía que todo el entorno de registro se hubiera actualizado de golpe.

## 04 / La comparación con la línea base lo dejó todo al descubierto

**Al compararlas lado a lado con la población general de usuarios, las diferencias eran evidentes.**

| Métrica | Dominio sospechoso | Todos los usuarios |
|--------|-------------------|-----------|
| Estructura de sesiones | Casi todas de una sola sesión | Habitualmente varias sesiones |
| Cambio entre varias IP / varios UA | Casi ninguno | Claramente presente |
| Diversidad de UA | ~1000+ sesiones / 3 UA | ~4000 sesiones / 190 UA |
| Registro → primer uso | **~5 horas** | ~8 minutos |
| Cuentas con uso | 73.8% | 81.4% |

**Entorno muy convergente.** Los usuarios normales cambian de dispositivo y de navegador constantemente: 4000 sesiones correspondían a 190 UA distintos. ¿Y el dominio sospechoso? Más de 1000 sesiones repartidas entre solo 3 UA. Dos órdenes de magnitud más concentrado.

**Primero registrar, activar después.** Los usuarios normales empiezan a usar el producto en una mediana de 8 minutos tras registrarse. Estas cuentas esperaron una mediana de 5 horas. No estaban inactivas: era más bien "primero formar la reserva de cuentas y luego activarlas según un calendario".

**Activación selectiva.** El 73.8% de las cuentas acabó haciendo llamadas a la API. No eran registros desechables: se trataba de una reserva de cuentas activada de forma selectiva.

## 05 / No solo métricas de vanidad: un drenaje real de recursos

Si estas cuentas se hubieran quedado inactivas, el daño habría sido mínimo. Pero no fue así: **estaban haciendo llamadas a la API a gran escala**. Consumieron **miles de millones de tokens** en la mayoría de los principales modelos de la plataforma. El costo de inferencia fue considerable.

Las llamadas no se concentraban en uno o dos modelos, sino que estaban ampliamente repartidas: de miles a decenas de miles de llamadas por modelo.

No era "registrarse, llevarse los créditos e irse". Era un **consumo sistemático de los recursos de API de la plataforma**.

## 06 / Retrospectiva técnica: cuatro lecciones

**🔍 Establece siempre líneas base**

Muchas métricas no significan nada de forma aislada. "Creó una sesión poco después de registrarse" suena normal, pero el 80% de todos los usuarios lo hace. Solo comparando con la línea base puedes distinguir lo "normal" de lo "anómalo".

**📊 Análisis cruzado entre dimensiones > juicio basado en una sola métrica**

Solo los prefijos, solo el UA, solo el momento del registro: cada uno por separado podría descartarse como una coincidencia. Pero cuando las tres dimensiones cambian en sincronía, la probabilidad de que sea una coincidencia se acerca a cero.

**⏱ Amplía la línea de tiempo**

Los datos agregados ocultan las transiciones de fase. Desglósalos por día o incluso por hora para detectar el punto de inflexión de "sondeo → avalancha".

**🎯 La contención convence más que las acusaciones**

En todo este análisis, nunca dijimos "esto es un ataque malicioso". Solo describimos los patrones que revelaban los datos. Las conclusiones contenidas son, de hecho, más persuasivas, porque los hechos hablan por sí mismos.

## 07 / Conclusión

Las más de 1000 cuentas de este dominio sospechoso forman un clúster de cuentas **altamente homogéneo, creado por lotes y sistematizado**.

- ✅ Clara transición en dos fases: "sondeo → avalancha"
- ✅ Los patrones de prefijo, las huellas de UA y el ritmo de registro cambiaron en sincronía
- ✅ Frente a la población general: la convergencia del entorno, el momento de activación y la estructura de sesiones se desviaban de forma significativa
- ✅ Encaja mejor con "formar una reserva de cuentas y luego activarlas selectivamente" que con un simple registro de spam

Para productos SaaS en fase temprana, este tipo de registro masivo puede no ser fatal de inmediato. Pero el impacto es real: **costos de API robados, métricas de crecimiento contaminadas y el riesgo de que la situación escale si no se controla.** Cuanto antes desarrolles capacidades de detección de anomalías, antes detendrás la hemorragia.

## 08 / Publicamos nuestra investigación como una Skill de código abierto

Empaquetamos todo el flujo de trabajo de la investigación en una Skill de código abierto llamada **abuse-hunter**.

Instálala en Nexu:

```
/skill install https://github.com/nexu-io/harness-engineering-guide/tree/main/skills/abuse-hunter
```

Después, lanza una investigación con una sola frase:

```
Check for email domains with abnormally high registration volumes and look for signs of batch account farming
```

Ejecuta automáticamente una **investigación en 6 pasos** y genera un informe con puntuación:

- **Agrupación por dominio de correo** — identifica dominios con un volumen de registros anómalo
- **Análisis del ritmo de registro** — crecimiento orgánico frente a inyección por lotes
- **Reconocimiento de patrones de prefijo** — creados por humanos frente a generados por scripts
- **Comparación de huellas de UA** — diversidad del entorno frente a convergencia
- **Análisis del momento de activación** — uso inmediato frente a activación diferida
- **Estadísticas de consumo de créditos** — cuantifica el impacto económico real

Resultado final: una puntuación compuesta sobre 12 puntos con acciones recomendadas. También incluye un script de Python para analizar archivos CSV sin conexión.

🔗 Skill abuse-hunter: **[https://github.com/nexu-io/harness-engineering-guide/tree/main/skills/abuse-hunter](https://github.com/nexu-io/harness-engineering-guide/tree/main/skills/abuse-hunter)**

📘 Harness Engineering Guide — tutoriales prácticos de ingeniería de harness: **[https://github.com/nexu-io/harness-engineering-guide](https://github.com/nexu-io/harness-engineering-guide)**

## 09 / Sobre Nexu

Nexu es un cliente de escritorio de OpenClaw que se instala con un clic y te permite controlarlo todo con IA, en local.

Tanto si usas WeChat, Feishu, DingTalk, WeCom, QQ, Slack, Discord, WhatsApp o Telegram, tu agente vive directamente en tu ventana de chat y te ayuda a escribir código, corregir bugs, ejecutar automatizaciones, gestionar tu agenda e investigar.

🦞 **Nexu**: **[https://github.com/nexu-io/nexu](https://github.com/nexu-io/nexu)**

Si te interesan las prácticas reales con agentes de IA, ya sea en arquitectura, diseño de producto o seguridad del crecimiento, danos una estrella ⭐ o abre un Issue / Discussion para conversar.