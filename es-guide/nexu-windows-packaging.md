---
author: Nexu
title: "La batalla de los mil millones de tokens: cómo lanzamos nuestro cliente de OpenClaw para Windows"
description: "Tiempo de build de 15 min→4 min, instalación de 10 min→2 min, CI totalmente automatizada, actualizaciones de macOS/Windows desacopladas: así reconstruimos nuestro pipeline de empaquetado de Electron"
category: Engineering
date: "2026-04-15"
originalUrl: https://gist.github.com/joeylee12629-star/cb9ae3801d562f75a1e3659ffcf1abc6
---

# La batalla de los mil millones de tokens: cómo lanzamos nuestro cliente de OpenClaw para Windows

> **Nexu** es un cliente de escritorio de OpenClaw de código abierto, que se instala con un clic y pone la IA en tus manos, en local.
> GitHub: **https://github.com/nexu-io/nexu**
> ⭐ Si te resulta útil, una estrella significa muchísimo para nosotros.

La semana pasada lanzamos Nexu v0.1.12 con soporte completo para Windows. Como primer cliente de escritorio de OpenClaw de código abierto del mundo, que procesa **miles de millones de tokens al día**, Windows era con diferencia la función más pedida por nuestra comunidad.

Pero "soporte para Windows" son tres palabras que esconden una reconstrucción completa de nuestro pipeline de empaquetado. Esto es lo que cambió:

| Métrica | Antes | Después |
|--------|--------|-------|
| ⏱ **Tiempo de build** | 15 min | **4 min** |
| 📦 **Tiempo de instalación** | 10 min | **menos de 2 min** |
| 🔄 **Builds en CI** | manuales | **totalmente automatizados** |
| 🧩 **Lógica de actualización** | acoplada | **macOS/Windows desacoplados** |

Nos topamos con muchos muros por el camino y tomamos algunas decisiones técnicas poco convencionales. Como somos de código abierto, **no hay motivo para guardarnos estas lecciones**. Este es el primer artículo de una serie; ojalá te ahorre algún disgusto si estás lanzando apps de Electron multiplataforma.

## Dónde se queda corto electron-builder

![Where electron-builder Falls Short](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-01.jpg)

electron-builder es el estándar de facto para empaquetar apps de Electron. La mayoría de los proyectos lo usan de principio a fin, desde el código fuente hasta el instalador final. Nosotros también, al principio.

Pero en cuanto ejecutamos de verdad el pipeline completo de Windows en producción, el camino por defecto empezó a desmoronarse:

- El árbol de archivos empaquetado de Nexu contiene aproximadamente **38,000 archivos**. La compresión ZIP por defecto gestiona fatal esta escala, tanto en tiempo de build como en tiempo de instalación
- Necesitábamos **lógica de instalación personalizada**: opciones de migración de datos, limpieza del registro y decisiones de cara al usuario que los valores por defecto de electron-builder no soportan
- macOS y Windows tienen una **semántica de actualización fundamentalmente distinta**. Forzarlos a compartir el mismo camino de código generaba un comportamiento frágil y difícil de depurar
- Los artefactos de CI tienen que ser **reproducibles**, independientemente de la configuración de la máquina local

electron-builder sigue encargándose de producir `win-unpacked` (el directorio bruto de la app). Pero a partir de ahí, tomamos el control nosotros.

## Pipeline personalizado de 7z + NSIS

![Custom 7z + NSIS Pipeline](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-02.jpg)

Nuestro nuevo pipeline tiene dos etapas:

**Etapa 1: electron-builder produce win-unpacked**
El directorio estándar de una app de Electron: exe, dlls, recursos. electron-builder sigue haciendo esto bien.

**Etapa 2: el empaquetado personalizado toma el relevo**

- **7-Zip**, incluido en el repositorio, comprime win-unpacked en `payload.7z`
- **makensis** compila un instalador NSIS personalizado
- El instalador se encarga de la extracción, las escrituras en el registro, los accesos directos y la limpieza al desinstalar

**¿Por qué 7z?** Con 38,000 archivos, la compresión sólida de 7z trata todo el árbol como un único bloque: una ratio de compresión y una velocidad de extracción muchísimo mejores que las de ZIP. Esta es, de lejos, la principal razón por la que el tiempo de instalación bajó de 10 minutos a menos de 2.

**¿Por qué NSIS?** Control total sobre cada aspecto del flujo de instalación: rutas, opciones de migración, registro, desinstalación. Se acabó pelearse con los valores por defecto del framework.

También incluimos 7-Zip directamente en el repositorio (vendoring), así que tanto la CI como los builds locales no tienen ninguna dependencia externa. Reproducibilidad lista para usar.

## Drivers de actualización por plataforma

![Platform Update Drivers](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-03.jpg)

Esto nos hizo mucho daño. Nuestra lógica de actualización para macOS y Windows compartía antes un único camino de código, ramificado con `if (platform === 'win32')`.

El problema es que estas plataformas tienen modelos de actualización fundamentalmente distintos:

- macOS puede **actualizarse en silencio dentro de la app**
- Windows requiere **cerrar → ejecutar el instalador → reiniciar**

Meter ambos en un mismo camino significaba que cada corrección para Windows corría el riesgo de romper macOS. Así que introdujimos una abstracción de **Update Driver**: tres drivers de plataforma independientes:

- **mac-update-driver** — descarga e instalación dentro de la app
- **windows-update-driver** — descarga externa + redirección al instalador
- **unsupported-update-driver** — fallback elegante para otras plataformas

Ahora cada plataforma evoluciona de forma independiente. Si estás construyendo apps de Electron multiplataforma, **introduce esta separación pronto**: tu yo del futuro te lo agradecerá.

## Resolución de rutas en runtime

![Runtime Path Resolution](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-04.jpg)

Este es sutil: después de empaquetar, la ubicación de los archivos en runtime depende de tu configuración de build. Nuestro código antiguo usaba heurísticas laxas para encontrarlos, lo cual funcionaba casi siempre, hasta que dejó de funcionar.

Cualquier cambio en la estructura de la salida del build podía romper en silencio el descubrimiento en runtime. Y estos fallos solo aparecían en los builds empaquetados, nunca en desarrollo local.

Escribimos un localizador de runtime dedicado para Windows que resuelve las rutas **de forma explícita, relativas al exe**. El contrato entre la estructura de la salida del build, el empaquetado del runtime y el descubrimiento en runtime ahora es estricto.

Antes: "probablemente está por aquí". Ahora: **"tiene que estar exactamente aquí, o fallar de forma ruidosa"**. Se acabaron las roturas silenciosas en producción.

## Pipeline de CI/CD

![CI/CD Pipeline](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-05.jpg)

Antes, los builds de Windows eran algo exclusivamente local: que salieran bien dependía de que la cadena de herramientas de tu máquina estuviera configurada correctamente.

Movimos todo el flujo de build → empaquetado → firma → publicación a GitHub Actions:

- **Nightly / beta / release**: los tres workflows ya soportan Windows por completo
- Genera automáticamente los manifiestos de actualización `latest-win.json`
- Los artefactos incluyen el instalador, los hashes y los metadatos: totalmente trazables

Para los proyectos de código abierto, una CI reproducible lo es todo. Cualquier colaborador puede hacer el build y obtener exactamente la misma salida.

## Qué viene después

![What's Next](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-06.jpg)

El verdadero valor de este trabajo no es una función nueva y llamativa: es **infraestructura que se acumula con el tiempo**. Más control sobre el empaquetado, actualizaciones más estables, rutas más predecibles.

Todavía tenemos optimizaciones experimentales en el pipeline (como la migración de datos de Windows guiada por el ciclo de vida), que contaremos en el próximo artículo cuando estén probadas en batalla.

La razón de ser del código abierto es **compartir lo que aprendes, no solo lo que lanzas**.

## Lecturas adicionales

- [Nexu en GitHub](https://github.com/nexu-io/nexu) — El cliente de escritorio de OpenClaw de código abierto
- [Harness Engineering Guide](https://harness-guide.com) — Base de conocimiento gratuita y de código abierto sobre ingeniería de agentes de IA
