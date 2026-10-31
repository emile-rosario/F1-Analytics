# F1 Analytics — Contexto del proyecto

> Referencia principal del proyecto para Emile Rosario y para Claude Code.
> **Estado:** diseño funcional, técnico y visual aprobado por Emile el 2026-10-29. Auditado y corregido el 2026-10-30. Fase 4 terminada el 2026-10-31: la app está en internet ([web](https://f1-analytics-eta.vercel.app) y [API](https://f1-analytics-api-a6xc.onrender.com/api/salud)). Siguiente: Fase 5.
> Nombre del producto: **F1 Analytics**.

### Prioridad entre documentos

Si dos documentos se contradicen, manda el de más arriba:

1. **`contexto.md`** (este): qué es F1 Analytics, decisiones y alcance.
2. [`diseno-tecnico.md`](diseno-tecnico.md): cómo se construye.
3. [`design.md`](design.md): cómo se ve.

Un cambio de decisión se hace primero aquí y después se propaga a los demás.

---

## 0. Forma de trabajo

1. **No se escribe código sin aprobación explícita.** Claude analiza, plantea dudas y presenta un plan; Emile lo aprueba o pide cambios.
2. **Se trabaja por fases**, probando cada parte antes de continuar.
3. **Git:** una rama por tarea (`chore/...`, `feat/...`, `fix/...`, `docs/...`) y se integra a `main` mediante Pull Request. Claude implementa, prueba y abre el PR; **Emile revisa y mergea**. Claude nunca mergea ni hace push a `main`.
4. **Commits** pequeños, con prefijo de Conventional Commits en inglés y mensaje en español: `feat: agregar detección de frenadas`. Descripciones de PR en español.
5. **Integración continua:** cada PR ejecuta lint, tests y build (GitHub Actions). No se integra un PR en rojo.
6. **Deploy desde el principio:** desde la Fase 4 la app está en internet. A partir del PR 1, cada PR trae su link de preview de Vercel para probarlo en vivo antes del merge, y cada merge a `main` sale solo a producción.
7. **Al cerrar cada PR** se documenta en su descripción: archivos modificados, pruebas realizadas, configuración necesaria y pendientes reales.
8. Emile está aprendiendo: las decisiones relevantes se explican.

---

## 1. Visión del producto

Aplicación web para **entender una sesión de Fórmula 1 con datos reales**, como lo verías en los gráficos de la transmisión. No es un sitio de noticias ni de resultados: cada página responde **una pregunta concreta** y explica la conclusión.

1. El usuario entra a la web, en **español o inglés**.
2. Elige un **año** (desde 2023), un **Gran Premio**, una **sesión** y los **pilotos**: uno en el circuito, dos en la telemetría y hasta tres en la dispersión de gomas.
3. La app trae los datos de OpenF1 y los analiza en el momento.
4. Mientras carga, se ve un **panel animado** (el semáforo de salida si el servidor está despertando); la app nunca se queda congelada.
5. Ve uno de tres análisis:

| # | Pregunta | Análisis | Nivel |
|---|----------|----------|-------|
| 1 | ¿Qué tan rápido va un F1 en cada parte del circuito? | Mapa del circuito coloreado por velocidad y por marcha, con curvas numeradas y frenadas | Básico |
| 2 | ¿Cuánto le costó a un piloto su estrategia de gomas? | Degradación por stint y compuesto, corregida por combustible | Intermedio |
| 3 | ¿Dónde le gana tiempo un piloto a otro? | Velocidad, acelerador, freno y delta metro a metro, con minisectores | Avanzado |

6. Cada análisis termina en una **conclusión en lenguaje simple**, por ejemplo: «LEC fue más rápido en 14 de 25 tramos, y aun así la vuelta se decidió por 0,014 s».
7. La selección queda en la URL, así que **el link se puede compartir** y abre lo mismo.

En `diseno-tecnico.md` los tres análisis se llaman también Proyecto 1, 2 y 3; el Proyecto 4 es el dashboard en vivo, fuera del MVP.

Cada análisis se construye en dos pasos: primero se explora y valida en un **notebook** y después se expone en la **API** y se muestra en la **web**.

---

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Fuente de datos | **OpenF1**, datos históricos gratis y sin cuenta, **desde 2023**. Probado el 2026-10-29: los 3 casos funcionan en 5–8 s y usan ~80 MB de RAM |
| Sesiones | Cualquier sesión **terminada** desde 2023, elegida por el usuario. No hay datos en vivo |
| Sesiones por defecto | Las que abre la web sin selección: **circuito**, Monza 2024 Clasificación, pole; **gomas**, a definir en la Fase 7 (carrera seca con blanda, media y dura); **telemetría**, Bahréin 2024 Clasificación, VER vs LEC, Q3 |
| Backend | **Python 3.12 + FastAPI**, entorno con **uv** |
| Frontend | **Next.js (App Router) + TypeScript + Tailwind** |
| Gráficos | **Plotly.js** en la web; SVG propio donde hace falta animar (mapa, minisectores); **Matplotlib** en los notebooks |
| Notebooks | Sí, uno por análisis, como laboratorio antes de pasar a la web |
| Persistencia | **Sin base de datos.** Caché en memoria y en disco de las respuestas de OpenF1 |
| Repositorio | **Monorepo** (`backend/` + `frontend/`) en GitHub **público** |
| Idioma del código | **Español**: módulos, funciones, variables, tests, JSON de la API y rutas. Sin tildes ni ñ en los identificadores |
| Idiomas de la web | **Español e inglés** con switch, español por defecto; detecta el idioma del navegador en la primera visita. `next-intl` con rutas `/es` y `/en` |
| Textos de la API | La API **nunca manda textos** para el usuario, solo datos y códigos. El frontend arma las frases en el idioma que toque |
| Hosting web | **Vercel Hobby**, con previews por PR |
| Hosting API | **Render Free**, sin tarjeta. Se duerme a los 15 min sin tráfico; la web lo despierta en segundo plano |
| Costo mensual | **$0** |
| Diseño visual | **Estilo gráficos de transmisión de TV**, con mucha animación, definido en [`design.md`](design.md). Prototipo aprobado en el canvas [«F1 Analytics — diseño web»](https://claude.ai/artifact/Qr1xr4NPcmRtjvLAjwViDn) |
| Marca | Nombre y logo propios. **Sin logo, tipografía ni marcas oficiales de la F1.** Pie de página: «Proyecto independiente, sin relación con la Fórmula 1 ni la FIA». El nombre usa «F1», que es marca registrada: Emile decidió mantenerlo el 2026-10-30 (riesgo bajo en un portafolio sin fines comerciales, con el aviso del pie de página) |
| Calidad | **GitHub Actions** en cada PR, en Ubuntu y Windows: `ruff` + `pytest` (backend) y ESLint + `tsc` + Vitest + build + Playwright (frontend) |
| Uso comercial | **No.** Proyecto personal y de portafolio |

### Descartado y por qué

- **FastF1 como fuente de datos:** desde octubre de 2026 la F1 exige autenticación y FastF1 3.9 pide una suscripción paga de F1TV, con un login que vence cada ~4 días. No sirve para un servidor público ni gratis.
- **Solo notebooks, sin web:** Emile quiere una app con frontend y link público.
- **Precalcular los análisis y servirlos como archivos estáticos:** era gratis, pero limitaba a un catálogo fijo de sesiones y dejaba FastAPI fuera de producción. Emile quiere las dos cosas.
- **Railway:** ya no tiene plan gratis, solo una prueba única de $5.
- **Hugging Face Spaces:** ahora exige plan pago para correr Docker.
- **Google Cloud Run y Oracle Cloud:** gratis, pero piden tarjeta, y Render alcanza.
- **Cola de trabajos con polling:** se diseñó cuando FastF1 tardaba hasta 2 min por sesión. Con OpenF1 tarda 5–8 s, y una petición normal basta.
- **Base de datos:** los datos vienen de OpenF1 y no cambian; con caché alcanza.
- **React + Vite:** se eligió Next.js, el mismo stack de ESCORE.
- **Apache ECharts:** Plotly está mejor pensado para gráficos técnicos (paneles con eje compartido, escalas de color).
- **Código en inglés:** decisión de Emile; el código va en español.
- **Zonas de frenado como «Z1, Z2…»:** Emile prefiere los números de curva reales, como en la transmisión.
- **Logo de un solo bloque morado:** no le gustó a Emile; se cambió por tres barras con los colores de sector.
- **Proyecto 4 (en vivo) dentro del MVP:** los datos en tiempo real de OpenF1 son pagos y Render gratis no aguanta conexiones persistentes.

---

## 3. Alcance del MVP

### Incluido

| Área | Funcionalidad |
|---|---|
| Selección | Año, Gran Premio, sesión y piloto(s), guardados en la URL |
| Circuito | Mapa coloreado por velocidad, pestaña de marchas, curvas numeradas, frenadas con velocidad de entrada y salida, conclusión |
| Gomas | Estrategias de **todos** los pilotos, dispersión de tiempo de vuelta contra edad de la goma (hasta 3 pilotos), degradación por stint y por compuesto, interruptor de corrección por combustible, conclusión y limitaciones |
| Telemetría | Dos pilotos, mejor vuelta de la sesión; en clasificación también de Q1/Q2/Q3 y en la clasificación sprint de SQ1/SQ2/SQ3 (en las demás sesiones no se muestran segmentos), trazas de velocidad, acelerador y freno, delta acumulado, cursor que recorre la vuelta, 25 minisectores en el mapa, conclusión |
| Carga | Panel animado; semáforo de salida mientras despierta el servidor |
| Idioma | Interfaz, gráficos, conclusiones y errores en es/en |
| Estado | Página `/estado` con la versión desplegada y si la API responde |
| Notebooks | Uno por análisis, con figuras para el README |
| Publicación | Link público, README en es y en |

### Mejoras después del lanzamiento

Detalle en `diseno-tecnico.md` §10. Cada una con su plan y su PR:

imagen para compartir el link, exportar gráficos en PNG, glosario, posiciones vuelta a vuelta, velocidad punta por equipo, clima contra ritmo, paradas en pits y undercut, compañeros de equipo en la temporada y replay de la carrera.

### Fuera del MVP

- Proyecto 4: dashboard en vivo (con costo; ver `diseno-tecnico.md` §11).
- Sesiones antes de 2023 (OpenF1 no las tiene).
- Cuentas de usuario, favoritos o historial.
- Predicciones con ML.
- Más idiomas.

---

## 4. Arquitectura

```
[Next.js en Vercel]  ──HTTPS──►  [FastAPI en Render]  ──HTTPS──►  [OpenF1 API]
  es / en, Plotly                  datos/ → analisis/ → api/
  anima y traduce                  caché en memoria + disco
                                         │
                                         └──► notebooks/ (Matplotlib, figuras del README)
```

| Capa | Papel |
|---|---|
| `datos/` | Lo único que habla con OpenF1. Trae, une y renombra a español |
| `analisis/` | Funciones puras: entra un DataFrame, sale un DataFrame o números. Sin HTTP ni gráficos |
| `api/` | Convierte los resultados en JSON con esquemas Pydantic. No calcula nada |
| `graficos/` | Matplotlib, solo para notebooks y scripts |
| Frontend | Dibuja, anima y traduce. No calcula deltas ni regresiones |

- Los tipos TypeScript del frontend se **generan desde el OpenAPI** de FastAPI, para que backend y frontend no se desincronicen.
- El código no depende de OpenF1 fuera de `datos/`: cambiar de fuente es cambiar esa capa.

### 4.1 Entornos

| Entorno | Web | API | Quién lo usa |
|---|---|---|---|
| Local | `localhost:3000` | `localhost:8000` (`docker compose up` o `uv run`) | Desarrollo y tests |
| Preview | Vercel, una URL por PR | Render de producción | Revisión de cada PR antes del merge |
| Producción | Vercel | Render | La app publicada |

Render gratis no tiene previews del backend: los cambios de API se prueban en local antes del merge.

---

## 5. Flujos clave

### 5.1 Elegir una sesión

1. La web arranca en el **idioma del navegador** (inglés si empieza por `en`, español en otro caso) y en segundo plano llama a `/api/salud` para ir despertando la API.
2. El usuario elige año → Gran Premio → sesión → piloto(s). Cada lista se llena desde la API.
3. La selección se guarda en la URL. Cambiar de idioma conserva la selección.

### 5.2 Cargar un análisis

1. El frontend pide el análisis a la API.
2. Si está en caché, responde al instante. Si no, la API baja de OpenF1 solo lo necesario (la vuelta de un piloto, las vueltas y stints de una carrera) y lo analiza: 5–8 s.
3. Si la API está dormida, la primera respuesta tarda hasta ~1 min: se muestra el semáforo de salida y un contador, con un reintento automático si llega un 502.
4. Llegan los datos y arranca la animación de la página; al final aparece la conclusión.
5. Si algo falla, mensaje claro en el idioma del usuario según el código de error y un botón para reintentar:

| Código | Cuándo |
|---|---|
| `parametro_invalido` | Año fuera de rango, tipo de sesión o segmento desconocido |
| `sesion_no_encontrada` | El `session_key` no existe en OpenF1 |
| `sesion_no_terminada` | La sesión todavía no terminó |
| `piloto_no_encontrado` | El piloto no corrió esa sesión |
| `analisis_no_disponible` | El análisis no aplica a esa sesión (gomas fuera de carrera o sprint, Q1–Q3 fuera de clasificación) |
| `sin_telemetria` | OpenF1 no tiene telemetría de esa vuelta |
| `telemetria_incompleta` | Hay telemetría, pero con muy pocas muestras |
| `limite_peticiones` | OpenF1 respondió 429, o el usuario superó el límite por IP (§9) |
| `fallo_openf1` | OpenF1 caído o con error |

Estados en la web: `despertando` → `cargando` → `listo` | `error`.

### 5.3 Conclusiones

- La API devuelve datos estructurados (`{ "codigo": "frenada_mas_fuerte", "curva": 1, "vel_entrada": 330, "vel_salida": 81 }`).
- El frontend arma la frase con una plantilla de `es.json` o `en.json`.
- Un test en CI comprueba que todo código tiene traducción en los dos idiomas.

---

## 6. Datos (resumen)

No hay base de datos. Todo sale de OpenF1 y se guarda en caché.

| Endpoint de OpenF1 | Para qué |
|---|---|
| `meetings`, `sessions` | Calendario y selector de sesión |
| `drivers` | Pilotos, equipo y color |
| `laps` | Tiempos de vuelta, sectores, salida de pits, inicio de cada vuelta |
| `stints` | Compuesto y edad de la goma |
| `pit`, `race_control` | Vueltas de pits y banderas (SC, VSC) para limpiar |
| `car_data` | Velocidad, acelerador, freno, marcha (~3.7 muestras por segundo) |
| `location` | Posición X/Y del carro para dibujar el circuito |

- **Caché:** en memoria mientras el servidor está despierto, y en disco en local y en notebooks. En Render se borra al dormirse, y es aceptable porque bajar una sesión tarda 5–8 s.
- Solo se cachean sesiones **terminadas**.
- Los **números de curva** no vienen en OpenF1: se guardan en un archivo propio con todos los circuitos (`backend/src/f1analytics/datos/circuitos.json`), que se arma en la Fase 5 (PR 2).

Detalle en [`diseno-tecnico.md`](diseno-tecnico.md).

---

## 7. Pantallas

- **Inicio:** el circuito se dibuja coloreado por velocidad y un punto lo recorre; selector de sesión; las tres preguntas.
- **Circuito:** mapa de velocidad / marchas, curvas, frenadas y conclusión.
- **Gomas:** estrategias de todos los pilotos, dispersión, tabla de degradación, interruptor de combustible y conclusión.
- **Telemetría:** los dos pilotos como en la tele, trazas apiladas con cursor, minisectores y conclusión.
- **Carga:** semáforo de salida.
- **Estado:** versión desplegada y salud de la API.

Diseño visual en [`design.md`](design.md): fondo asfalto, paneles con corte en ángulo, colores de equipo, Saira Condensed + Saira, acento morado de «vuelta más rápida», curvas en círculos blancos. Todo respeta `prefers-reduced-motion` y funciona en el móvil.

---

## 8. Estructura del repositorio

```
/
├── CLAUDE.md            instrucciones para Claude Code
├── README.md            español
├── README.en.md         inglés
├── backend/
│   ├── pyproject.toml, uv.lock, Dockerfile
│   ├── src/f1analytics/{datos,analisis,graficos,api}/
│   ├── notebooks/
│   ├── scripts/
│   └── tests/
├── frontend/
│   ├── messages/        es.json, en.json
│   ├── src/{app/[locale],components,lib,i18n}/
│   └── tests/
├── docs/
├── .github/             workflows/ (CI) y plantilla de PR
├── docker-compose.yml   API + web en local
├── render.yaml          deploy de la API en Render
└── .gitignore
```

---

## 9. Seguridad y restricciones

1. **No hay secretos:** OpenF1 histórico no pide clave. Si alguna vez hace falta una, va solo en variables de entorno de Render, nunca en el repo ni en el frontend.
2. **CORS** restringido al dominio de producción de Vercel, a las URLs de preview del proyecto (con una expresión regular, porque cada preview tiene una URL distinta) y a `localhost:3000` en desarrollo.
3. **Validación de entrada:** año entre 2023 y el actual, tipo de sesión de una lista cerrada, pilotos que existan en la sesión, análisis de gomas solo en carreras y sprints, segmentos Q solo en clasificaciones. Cada rechazo tiene su código (§5.2).
4. **Respeto a OpenF1:** caché, reintentos con espera ante 429 y máximo 2 análisis sin caché a la vez.
5. **Límite por IP:** como la API es pública y sin cuentas, cada IP puede pedir como máximo 10 análisis sin caché por minuto (las respuestas en caché no cuentan). Así una sola persona no deja la API ocupada para los demás. En Render la IP real viene en `X-Forwarded-For`.
6. La API no devuelve texto para el usuario; el frontend muestra todo como **texto**, nunca como HTML.
7. **Datos de la F1:** uso personal y de portafolio, sin fines comerciales. Sin logo, tipografía ni marcas oficiales.
8. **Honestidad del análisis:** una vuelta más lenta no prueba degradación. La página de gomas explica qué se limpió y qué no se puede corregir (tráfico, temperatura). La telemetría pública es de ~3.7 Hz y el delta se ajusta al tiempo oficial de vuelta.

---

## 10. Plan por fases

| Fase | Contenido | PRs | Estado |
|---|---|---|---|
| 1. Análisis | Análisis posibles, fuente de datos, prueba de OpenF1 y RAM en la PC de Emile, hosting gratis | — | ✅ |
| 2. Diseño técnico y visual | Arquitectura, API, tests, roadmap, prototipo en canvas | — | ✅ |
| 3. Aprobación | Revisión de Emile | — | ✅ (2026-10-29) |
| 4. Fundamentos y despliegue | Monorepo, CI, Docker, FastAPI con `/api/salud`, Next.js con i18n, `CLAUDE.md`, deploy en Vercel + Render, CORS, página `/estado`, despertar la API en segundo plano con reintento | 0, 1 | ✅ (2026-10-31) |
| 5. Datos y base de la web | Cliente de OpenF1, carga y caché, `circuitos.json`, calendario y pilotos, tema visual, selector de sesión, panel de carga con el semáforo | 2, 3, 4 | Siguiente |
| 6. Circuito | Análisis, notebook 01, página `/circuito` | 5, 6 | |
| 7. Gomas | Limpieza, análisis, notebook 02, página `/gomas` | 7, 8 | |
| 8. Telemetría | Análisis, notebook 03, página `/telemetria` | 9, 10 | |
| 9. Publicación | README es/en con link, capturas y conclusiones; pruebas en Windows y móvil | 11 | |
| 10. Mejoras | Lista del §3, una por PR | — | |

---

## 11. Pendientes

- [x] Nombre del producto: **F1 Analytics**.
- [x] Fuente de datos: OpenF1, probada el 2026-10-29.
- [x] Hosting: Vercel + Render gratis.
- [x] Diseño visual aprobado.
- [x] Repo en GitHub (`emile-rosario/F1-Analytics`, público) conectado a `C:\dev\F1-Analytics` (2026-10-30).
- [x] `main` protegida: solo merge por PR y los 4 checks del CI en verde (2026-10-31).
- [x] Nombre del paquete Python: `f1analytics` (antes `f1lab`, resto de un nombre anterior), decidido el 2026-10-30.
- [x] Mantener «F1» en el nombre del producto (decidido el 2026-10-30).
- [x] Link del canvas del prototipo en §2 y en `design.md` (2026-10-30).
- [x] Cuentas de Vercel y Render conectadas al GitHub de Emile, con la app desplegada (2026-10-31).
- [x] Ping para que la API no se duerma: **no se agrega** (decidido el 2026-10-31). La web despierta la API al abrir y muestra «Despertando el servidor». Se puede reabrir si la primera visita resulta muy molesta; un monitor externo gratis sería más confiable que un cron de GitHub Actions, que se atrasa y se desactiva a los 60 días sin actividad.
- [ ] Revisar `npm audit`: 16 vulnerabilidades moderadas, solo en herramientas de desarrollo (0 en producción).
- [ ] Reemplazar `httpx` por `httpx2` en los tests del backend cuando se pueda verificar (Starlette avisa que `httpx` está en desuso para `TestClient`).
- [ ] Buscar una fuente pública de números de curva; si no hay, armar `circuitos.json` a mano (Fase 5).
- [ ] Elegir la carrera destacada de gomas: seca y con blanda, media y dura (Bahréin 2024 no sirve, solo usó blanda y dura) (Fase 7).
- [ ] Verificar si OpenF1 tiene límites de peticiones no documentados (Fase 5).
