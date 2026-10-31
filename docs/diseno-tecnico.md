# Diseño técnico — F1 Analytics

> Estado: **Aprobado** (Emile, 2026-10-29)
> Última actualización: 2026-10-30 (correcciones de la auditoría de `contexto.md`)
> Ver también: [`contexto.md`](contexto.md) (qué y por qué) y [`design.md`](design.md) (cómo se ve).

## 1. Convenciones de idioma en el código

- **Todo nuestro código va en español**: módulos, funciones, variables, clases, comentarios, docstrings, tests, campos del JSON de la API y rutas.
- **Sin tildes ni ñ en identificadores** (`anio`, `sesion`, `telemetria`). En comentarios, docstrings y textos sí se escribe bien.
- **Lo que viene de afuera se queda como viene**: los campos de OpenF1 (`lap_duration`, `compound`, `n_gear`…), los métodos de librerías y las palabras clave del lenguaje. Se renombran a español al pasar por la capa `datos/` (ver 4.2), y de ahí en adelante todo el código usa los nombres en español.
- Python: `snake_case` para funciones y variables, `PascalCase` para clases. TypeScript: `camelCase` y `PascalCase` para componentes.

## 2. Fuente de datos: OpenF1

### Por qué no FastF1
En octubre de 2026 la F1 empezó a exigir autenticación en sus APIs de datos. FastF1 3.9 ahora pide una cuenta de **F1TV con suscripción paga**, y el login vence cada ~4 días. Eso no sirve para un servidor público ni para un proyecto gratis.

### OpenF1
[OpenF1](https://openf1.org/docs/) da los datos históricos **gratis y sin autenticación desde 2023**. Los datos en tiempo real sí son pagos (ver sección 11).

| Endpoint | Qué usamos | Para |
|---|---|---|
| `sessions` | `session_key`, año, país, tipo, fechas | Selector de sesión |
| `meetings` | Nombre del GP, circuito | Calendario |
| `drivers` | Número, código, nombre, equipo, color | Selector de pilotos |
| `laps` | `lap_duration`, sectores, `is_pit_out_lap`, `date_start` | Proyectos 2 y 3 |
| `stints` | `compound`, `tyre_age_at_start`, `lap_start`, `lap_end` | Proyecto 2 |
| `pit` | `lap_number` de cada parada | Proyecto 2 (vueltas de entrada a pits) |
| `race_control` | Banderas, SC, VSC, con vuelta | Proyecto 2 (limpieza) |
| `car_data` | `speed`, `throttle`, `brake`, `n_gear`, `rpm`, `drs` (~3.7 Hz) | Proyectos 1 y 3 |
| `location` | `x`, `y`, `z` (~3.7 Hz) | Proyectos 1 y 3 |

### Prueba real (2026-10-29, en la PC de Emile)
| Caso | Resultado | Pico RAM | Tiempo |
|---|---|---|---|
| Circuito: Monza 2024 Q, LEC | 298 muestras `car_data`, 305 puntos X/Y, vmax 330 km/h | 78 MB | 5 s |
| Gomas: Bahréin 2024 carrera | 1129 vueltas, 63 stints, 71 mensajes de dirección de carrera | 82 MB | 5 s |
| Telemetría: Bahréin 2024 Q, VER vs LEC | 344 y 335 muestras | 81 MB | 8 s |

Conclusiones:
- La RAM está muy por debajo de los 512 MB de Render gratis.
- Una sesión tarda 5–8 s en bajarse. Eso es aceptable en una petición HTTP normal, así que la API responde directo, sin cola de trabajos ni polling. Con caché, la segunda vez es instantánea.
- Detalle encontrado: la vuelta más rápida de LEC en esa clasificación fue en Q2 (89.165 s), no en Q3. Para comparar en igualdad de condiciones, el proyecto 3 deja elegir **"mejor vuelta de la sesión"** o **"mejor vuelta de Q1 / Q2 / Q3"** (ver 4.5).

### Lo que FastF1 nos daba hecho y ahora hacemos nosotros
| Qué | Cómo lo resolvemos |
|---|---|
| Unir `car_data` y `location` (vienen con timestamps distintos) | `pd.merge_asof` por `date`, con tolerancia de 300 ms |
| Distancia recorrida en la vuelta | Integrar velocidad × Δt (más preciso que sumar distancias X/Y) |
| Recortar la telemetría a una vuelta | Filtro por `date_start` y `date_start + lap_duration` de `laps` |
| Estado de pista por vuelta (verde, SC, VSC) | Reconstruirlo desde `race_control` |
| Vueltas de entrada a pits | Desde `pit.lap_number` |
| Rotación del mapa como en la TV | Sin dato oficial: se rota con PCA para dejar la recta más larga horizontal |
| Números de curva | OpenF1 no los trae. Se guarda un archivo propio `datos/circuitos.json` con la posición de cada curva numerada por circuito (curva 1, 2, …), en metros desde la línea de meta, y se ubican sobre la vuelta por distancia. En el PR 2 se revisa si alguna API pública los da (por ejemplo MultiViewer, que usaba FastF1); si no, se arma a mano para los circuitos del calendario desde 2023 (~25 circuitos) |

Riesgo: OpenF1 no publica límites de peticiones. El cliente reintenta con backoff si recibe 429, y la caché evita repetir llamadas.

## 3. Arquitectura general

```
                       ┌────────────────────── backend/ ───────────────────────┐
OpenF1 API ──► datos/cliente ──► datos/cargador ──► datos/limpieza ──► analisis/* ──┬──► api/ (FastAPI, JSON) ──► frontend/ (Next.js + Plotly, ES/EN)
                     │                                                         │
              cache (disco + memoria)                                          └──► notebooks/ + graficos/ (Matplotlib, README)
```

Reglas de capas:
- `datos/` es lo único que habla con OpenF1, y entrega DataFrames con columnas en español.
- `analisis/` son **funciones puras**: entra DataFrame, sale DataFrame o números. Nada de gráficos ni de HTTP.
- `api/` convierte el resultado de `analisis` en esquemas Pydantic. No calcula nada por su cuenta.
- `graficos/` (Matplotlib) solo se usa desde notebooks y scripts.
- El frontend dibuja y traduce. No calcula deltas ni regresiones.
- **La API no devuelve textos para el usuario**, solo datos y códigos. Las traducciones viven en el frontend.

## 4. Backend

### 4.1 Estructura

```
backend/
├── pyproject.toml, uv.lock, Dockerfile
├── src/f1analytics/
│   ├── config.py
│   ├── datos/        cliente.py, cargador.py, limpieza.py, telemetria_vuelta.py, circuitos.json
│   ├── analisis/     circuito.py, gomas.py, telemetria.py
│   ├── graficos/     estilo.py, circuito.py, gomas.py, telemetria.py
│   └── api/
│       ├── main.py            # app, CORS, gzip, routers
│       ├── esquemas.py        # modelos Pydantic
│       └── rutas/  meta.py, circuito.py, gomas.py, telemetria.py
├── notebooks/  01_velocidad_circuito, 02_degradacion_gomas, 03_comparacion_telemetria
├── scripts/    generar_fixtures.py, probar_openf1.py
└── tests/      fixtures/, unit/, api/, integracion/
```

### 4.2 `datos/`

**`cliente.py`**: cliente HTTP de OpenF1.
- `ClienteOpenF1(base_url, timeout=60, reintentos=4, dir_cache, max_bytes_memoria, ...)` con `httpx`.
- `obtener(endpoint, filtros=None, *, cachear=False) -> pd.DataFrame`. Los filtros van en un diccionario porque sus nombres no siempre son identificadores válidos (`{"date>": "...", "driver_number": 16}`).
- **OpenF1 responde 404 cuando una consulta no tiene resultados.** El cliente lo devuelve como un DataFrame vacío y es el cargador quien decide si eso es un error.
- Reintenta (máximo 4 veces) en 429, 5xx y errores de red, con espera creciente de 1, 2, 4 y 8 s; si el 429 trae `Retry-After`, espera eso (hasta 30 s). Otros 4xx no se reintentan. Al agotar los reintentos lanza `ErrorOpenF1` con el código `limite_peticiones` o `fallo_openf1`.
- **Caché en dos niveles**, solo cuando el llamador pasa `cachear=True`:
  - En memoria (LRU, ~100 MB máximo) para las peticiones repetidas mientras el servidor está despierto.
  - En disco (`DIR_CACHE`, parquet), útil en local y en notebooks. En Render gratis el disco se borra al dormirse, y es aceptable porque bajar una sesión de nuevo tarda 5–8 s. Si el disco no es escribible, se sigue solo con memoria.
  - El cargador pasa `cachear=True` **solo en sesiones terminadas**, así una sesión en curso nunca queda congelada. Las respuestas vacías no se guardan.

**`cargador.py`**: la clase `Cargador(cliente)` traduce OpenF1 a DataFrames en español. Recibe el cliente (y un reloj, para los tests), así que no hay estado global.
- `calendario(anio)`: GP del año sin las pruebas de pretemporada. Columnas `evento` (el `meeting_key`), `nombre`, `nombre_oficial`, `pais`, `circuito`, `circuito_clave`, `inicio`.
- `sesiones(anio, evento)`: solo las analizables (Practice 1–3, Qualifying, Sprint Qualifying/Shootout, Sprint, Race), sin las canceladas y con `terminada`.
- `info_sesion(sesion)` y `buscar_sesion(anio, evento, nombre) -> int` (`session_key`): lanzan `ErrorDatos("sesion_no_encontrada")` si no existe.
- `pilotos(sesion)`: `numero`, `codigo`, `nombre`, `equipo`, `color` (con `#`).
- `vueltas(sesion, piloto=None)`: `piloto`, `vuelta`, `inicio`, `tiempo_vuelta_s`, `sector_1_s`…, `salida_pits`.
- `stints(sesion)`: `piloto`, `stint`, `compuesto`, `vuelta_inicio`, `vuelta_fin`, `edad_inicial`.
- `paradas(sesion)`: `piloto`, `vuelta`, `fecha`, `duracion_s` (OpenF1 solo la mide desde el GP de EE. UU. 2024).
- `direccion_carrera(sesion)`: incluye `fase_clasificacion` (1, 2 o 3), que usa `vuelta_rapida` para recortar Q1/Q2/Q3.

**`telemetria_vuelta.py`**: las funciones reciben el `Cargador` como primer argumento.
- `telemetria_de_vuelta(cargador, sesion, piloto, vuelta) -> pd.DataFrame`: baja `car_data` y `location` solo para el rango de tiempo de esa vuelta, los une con `merge_asof` y agrega `tiempo_s` (desde el inicio de la vuelta) y `distancia_m` (integrando la velocidad). Columnas: `tiempo_s`, `distancia_m`, `x`, `y`, `velocidad`, `acelerador`, `freno`, `marcha`, `rpm`, `drs`.
- `vuelta_rapida(cargador, sesion, piloto, segmento=None) -> int`, donde `segmento` es `None` (toda la sesión), `"Q1"`, `"Q2"` o `"Q3"` en clasificación, o `"SQ1"`, `"SQ2"` o `"SQ3"` en la clasificación sprint. Un segmento en otro tipo de sesión lanza `ErrorDatos("analisis_no_disponible")`. Las fases salen de los mensajes `SESSION STARTED` / `SESSION FINISHED` de la dirección de carrera, y una vuelta pertenece a la fase en la que **empezó**. Las salidas de pits no cuentan.
- Valida que la vuelta tenga al menos 2 muestras por segundo y ningún hueco de más de 2 s; si no, lanza `ErrorDatos("telemetria_incompleta")`. Sin ninguna muestra, `ErrorDatos("sin_telemetria")`.
- Medido con datos reales: la distancia integrada de la mejor vuelta de Monza 2024 da 5752 m contra 5793 m oficiales (−0,7 %), y la de Bahréin queda también dentro del ±2 %.

**`limpieza.py`**
- `estado_pista_por_vuelta(direccion_carrera, n_vueltas) -> pd.Series`: `verde`, `amarilla`, `sc`, `vsc` o `roja`.
- `limpiar_vueltas_carrera(vueltas, paradas, estado_pista, *, quitar_primera=True, solo_verde=True, quitar_pits=True, umbral_rapidas=1.07) -> pd.DataFrame`
- `agregar_edad_goma(vueltas, stints) -> pd.DataFrame`: agrega `compuesto`, `stint` y `edad_goma` (edad inicial + vueltas desde el inicio del stint).
- `agregar_correccion_combustible(vueltas, segundos_por_vuelta=0.06) -> pd.DataFrame`, que agrega `tiempo_corregido_s`.

### 4.3 `analisis/circuito.py` (Proyecto 1)
- `orientar_circuito(tel) -> pd.DataFrame`: rotación con PCA.
- `zonas_frenado(tel, curvas, longitud_min_m=20) -> pd.DataFrame`: `curva` (el número de la curva más cercana, de `circuitos.json`), inicio, fin, velocidad de entrada y de salida, x/y del punto de frenada.
- `posicion_curvas(tel, curvas) -> pd.DataFrame`: x/y de cada curva sobre el mapa, para dibujar los números.
- `zonas_alta_velocidad(tel, percentil=90) -> pd.DataFrame`
- `resumen_circuito(tel, zonas) -> dict`: % de la vuelta a fondo, frenada más fuerte, velocidad máxima y mínima.

### 4.4 `analisis/gomas.py` (Proyecto 2)
- `resumen_stints(vueltas) -> pd.DataFrame`
- `degradacion_por_stint(vueltas, columna="tiempo_corregido_s") -> pd.DataFrame`: `pendiente_s_por_vuelta`, `intercepto`, `r2`, `n_vueltas`. Los stints con menos de 5 vueltas limpias se marcan como `insuficiente`.
- `comparar_compuestos(degradacion) -> pd.DataFrame`
- `resumen_gomas(degradacion, stints) -> dict`

### 4.5 `analisis/telemetria.py` (Proyecto 3)
- `remuestrear_por_distancia(tel, paso_m=5.0) -> pd.DataFrame`
- `alinear_vueltas(tel_a, tel_b, paso_m=5.0) -> pd.DataFrame`, con sufijos `_a` y `_b`.
- `delta_tiempo(alineadas) -> pd.Series`: delta acumulado (positivo = B pierde contra A), integrando `ds / v`. Se ajusta para que el delta final coincida con la diferencia oficial de `lap_duration`, porque la integración con ~3.7 Hz acumula error.
- `ganador_por_minisector(alineadas, n_sectores=25) -> pd.DataFrame`
- `resumen_telemetria(alineadas, delta, ganadores) -> dict`

Las funciones `resumen_*` devuelven datos estructurados, nunca texto:

```json
{ "codigo": "frenada_mas_fuerte", "curva": 1, "vel_entrada": 330, "vel_salida": 81 }
```

### 4.6 API

Respuestas síncronas (5–8 s la primera vez, instantáneas con caché).

| Método | Ruta | Devuelve |
|--------|------|----------|
| GET | `/api/salud` | Estado, versión (commit) |
| GET | `/api/calendario/{anio}` | GPs del año |
| GET | `/api/sesiones/{anio}/{evento}` | Sesiones del GP |
| GET | `/api/sesiones/{sesion}/pilotos` | Pilotos de la sesión |
| GET | `/api/analisis/circuito?sesion&piloto` | Puntos X/Y/velocidad, zonas, resumen |
| GET | `/api/analisis/gomas?sesion&pilotos` | Vueltas limpias, stints, degradación, resumen |
| GET | `/api/analisis/telemetria?sesion&piloto_a&piloto_b&segmento` | Canales alineados, delta, minisectores, resumen |

- Las sesiones se identifican con el `session_key` de OpenF1, que es estable y corto.
- Los modelos van en `esquemas.py`, y los tipos TS del frontend se generan desde el OpenAPI con `openapi-typescript`.
- Errores con código (cuándo sale cada uno: `contexto.md` §5.2): `parametro_invalido`, `sesion_no_encontrada`, `sesion_no_terminada`, `piloto_no_encontrado`, `analisis_no_disponible`, `sin_telemetria`, `telemetria_incompleta`, `limite_peticiones`, `fallo_openf1`.
- Validación: año entre 2023 y el actual, tipo de sesión y segmento de listas cerradas, pilotos que existan en la sesión, el análisis de gomas solo en carreras y sprints, y los segmentos Q/SQ solo en clasificaciones.
- **Limitador de concurrencia** (semáforo, máximo 2 análisis sin caché a la vez), para no saturar OpenF1 ni el servidor.
- **Límite por IP:** máximo 10 análisis sin caché por minuto por IP (las respuestas en caché no cuentan), leyendo la IP de `X-Forwarded-For` porque en Render la API está detrás de un proxy. Al pasarlo responde 429 con `limite_peticiones`.
- Remuestreo a 5 m + gzip para que el payload sea liviano.
- CORS: `allow_origins` con el dominio de producción y `localhost:3000`, y `allow_origin_regex` para las URLs de preview del proyecto en Vercel, que cambian en cada PR.

## 5. Frontend

### Estructura

```
frontend/
├── messages/ es.json, en.json
├── src/
│   ├── i18n/, proxy.ts        # en Next.js 16 el middleware se llama proxy
│   ├── app/[locale]/  layout.tsx, page.tsx, circuito/, gomas/, telemetria/, estado/
│   ├── components/
│   │   ├── SelectorSesion.tsx, SelectorIdioma.tsx, Conclusion.tsx
│   │   ├── EstadoCarga.tsx       # cargando / despertando servidor / error
│   │   └── graficos/  MapaVelocidad, DispersionVueltas, PanelTelemetria, MapaMinisectores
│   └── lib/  api.ts, tipos-api.ts, plotly-idioma.ts
└── tests/
```

### Stack
- **Next.js (App Router) + TypeScript + Tailwind**, con tema oscuro estilo F1.
- **Plotly.js** con `react-plotly.js`, cargado con `dynamic(..., { ssr: false })`.

### Diseño visual
Colores, tipografía, marca, componentes, pantallas y animaciones: [`design.md`](design.md).

Cómo se implementa:
- Los colores y tipografías de `design.md` van como variables del tema de Tailwind (`asfalto`, `panel`, `morado`, `compuesto-blanda`…), nunca escritos a mano en los componentes.
- Fuentes con `next/font/google` (Saira y Saira Condensed), sin pedirlas a Google desde el navegador.
- Animaciones de la interfaz con CSS y Framer Motion; mapa del circuito y minisectores en SVG propio; el resto de los gráficos en Plotly.
- `prefers-reduced-motion` se respeta en un solo lugar (un hook compartido) para que todos los componentes lo cumplan.

### Idiomas (ES / EN)
- `next-intl` con rutas `/es/...` y `/en/...`. Español por defecto, y la primera visita detecta el idioma del navegador.
- `SelectorIdioma` cambia de idioma conservando los parámetros de la sesión.
- Se traduce todo: la interfaz, ejes, leyendas y tooltips, las conclusiones (plantillas a partir de los datos estructurados), los códigos de error, los compuestos y los tipos de sesión.
- Formato de números según el locale en Plotly (`plotly-idioma.ts`). Las unidades no cambian.
- Metadata y Open Graph traducidos.

### Servidor dormido (Render gratis)
La API se duerme a los 15 min sin tráfico, y la primera petición tarda ~1 min en despertarla. El frontend lo maneja así:
- Al abrir cualquier página llama a `/api/salud` en segundo plano, para que la API vaya despertando mientras el usuario elige la sesión.
- Si tarda, `EstadoCarga` muestra "Despertando el servidor, puede tardar hasta un minuto…" en vez de un error.
- Timeout de 90 s y un reintento automático si la primera respuesta es 502.

### Flujo y gráficos
1. `SelectorSesion` (año, GP, sesión y pilotos) guarda la selección en la URL.
2. Llamada a la API → `EstadoCarga` → gráficos + `Conclusion`.

- **/circuito**: `MapaVelocidad` con pestañas **Velocidad / Marchas** (mismo mapa coloreado por `marcha`) + números de curva + marcadores de frenada + tabla de frenadas.
- **/gomas**:
  - Estrategias de **todos los pilotos**, ordenados por posición final, con filas compactas. Los abandonos muestran la barra cortada en la vuelta en que se retiraron.
  - `DispersionVueltas` del piloto elegido (clic en su fila), con opción de comparar hasta 3.
  - Tabla de degradación por stint del piloto elegido + tabla general de degradación promedio por compuesto en toda la carrera.
- **/telemetria**: selector de segmento (mejor vuelta / Q1 / Q2 / Q3, o SQ1 / SQ2 / SQ3 en la clasificación sprint; en las demás sesiones no aparece) + `PanelTelemetria` (velocidad, acelerador, freno y delta) + `MapaMinisectores`.
- **/estado**: versión del frontend y de la API, y si la API responde.

Responsive: en móvil los paneles se apilan.

## 6. Estrategia de tests

| Capa | Herramienta | Qué cubre | Corre en CI |
|------|-------------|-----------|-------------|
| `datos/cliente` | pytest + `respx` (mock de httpx) | Reintentos en 429/5xx, códigos de error, caché, no cachear sesiones en curso | Sí |
| `datos/cargador`, `telemetria_vuelta` | pytest + fixtures JSON reales de OpenF1 | Renombrado, `merge_asof`, distancia, recorte por vuelta | Sí |
| `limpieza`, `analisis` | pytest | Lógica con datos sintéticos y fixtures | Sí |
| `graficos` | pytest | Smoke: devuelven una `Figure` | Sí |
| API | pytest + `TestClient` | Endpoints, validaciones, códigos de error, con el cliente mockeado | Sí |
| OpenF1 real | pytest `-m integracion` | Las 3 sesiones destacadas contra la API real | No (manual) |
| Frontend unit | Vitest + Testing Library | `api.ts` (timeout, reintento, servidor dormido), `SelectorSesion`, plantillas de conclusiones | Sí |
| i18n | Vitest | `es.json` y `en.json` con las mismas claves; todo código tiene traducción | Sí |
| E2E | Playwright | Elegir sesión → ver gráfico, y cambiar de idioma conservando la sesión, con la API mockeada | Sí |

Los fixtures se generan con `scripts/generar_fixtures.py` (respuestas reales de OpenF1 guardadas como JSON, recortadas para que pesen poco).

Casos clave:
- `distancia_m` de una vuelta completa queda dentro de ±2 % de la longitud oficial del circuito.
- `delta_tiempo` con dos vueltas idénticas da 0, y su valor final coincide con la diferencia de `lap_duration`.
- `estado_pista_por_vuelta` marca exactamente las vueltas de SC de un fixture con SC conocido.
- `limpiar_vueltas_carrera` elimina las vueltas de entrada y salida de pits.
- `degradacion_por_stint` recupera la pendiente de datos sintéticos lineales con ruido.

## 7. Calidad, CI y deploy

**CI (GitHub Actions)**, que corre siempre en cada PR (los 4 checks son obligatorios para mergear, así que un filtro por carpeta dejaría PR bloqueados esperando checks que nunca corren):
- `backend.yml`: `ruff check`, `ruff format --check`, `pytest` (sin integración), en Ubuntu y Windows.
- `frontend.yml`: `eslint`, `tsc --noEmit`, `vitest`, `next build` y Playwright, en Ubuntu y Windows.

**Local:** `docker compose up` (API en `:8000`, web en `:3000`), o cada uno por separado con `uv run` y `npm run dev`.

**Deploy (desde el PR 1), $0/mes:**
- **Frontend → Vercel (Hobby, gratis).** Merge a `main` → producción. Cada PR → link de preview comentado en el PR.
- **API → Render (Free, gratis), sin tarjeta.**
  - Merge a `main` → deploy automático. Configurado en `render.yaml` dentro del repo.
  - 512 MB de RAM (~80 MB medidos por análisis, más la caché en memoria de hasta ~100 MB), 750 horas al mes (alcanza para 1 servicio 24/7).
  - Se duerme a los 15 min sin tráfico (ver sección 5) y el disco se borra al dormirse (ver la caché en 4.2).
  - Previews de PR del backend: no en el plan gratis. Los previews del frontend apuntan a la API de producción, y los cambios de API se prueban local antes del merge.
- **Opcional, a decidir:** una GitHub Action que llame a `/api/salud` cada 14 min para que no se duerma. Gasta ~744 h/mes de las 750, así que alcanza para un solo servicio. Ojo: el cron de Actions puede atrasarse más de 15 min (la API se dormiría igual) y se desactiva solo tras 60 días sin actividad en el repo; un monitor externo gratis puede ser más confiable. Se decide en el PR 1.

## 8. Sesiones destacadas (por defecto)

| Análisis | Sesión | Por qué |
|----------|--------|---------|
| 1. Circuito | Monza 2024, Clasificación, pole | Rectas largas y frenadas fuertes: el contraste de velocidad se ve clarísimo |
| 2. Gomas | **A definir en el PR 7**: una carrera seca donde se hayan usado blanda, media y dura | Bahréin 2024 queda descartada: según OpenF1 en esa carrera solo se usaron blandas y duras. Se elige con un script que busque carreras con los 3 compuestos |
| 3. Telemetría | Bahréin 2024, Clasificación, VER vs LEC, Q3 | Pole contra segundo puesto, en una sesión ya probada con OpenF1 el 2026-10-29 |

Son las que abren por defecto en la web. El usuario puede elegir cualquier sesión desde 2023.

## 9. Roadmap de PRs

Cómo se agrupan en fases: ver `contexto.md` §10.

- **Deploy primero:** desde el PR 1 la app ya está en internet.
- **Slices verticales:** cada análisis se termina completo (notebook → API → web) antes de pasar al siguiente.

| PR | Rama | Contenido | Qué se ve en producción después del merge |
|----|------|-----------|-------------------------------------------|
| 0 | `chore/setup` | Monorepo, uv, ruff, pytest, Next.js + Tailwind, ESLint, Vitest, CI, Docker Compose, PR template, docs, `CLAUDE.md`. API mínima con `/api/salud`. Home mínima con i18n ES/EN | Nada todavía (corre local) |
| 1 | `chore/deploy` | `render.yaml`, Vercel, variables de entorno, CORS, página `/estado`, llamada a `/api/salud` en segundo plano y reintento ante 502 (el semáforo llega en el PR 4). Desde aquí cada PR trae su preview de Vercel | **Link público**: home ES/EN + API viva |
| 2 | `feat/datos-openf1` | `cliente`, `cargador`, `telemetria_vuelta`, `config`, `estilo`, `circuitos.json`, fixtures | Igual (backend interno) |
| 3 | `feat/api-base` | `/calendario`, `/sesiones`, `/pilotos`, generación de tipos TS | API con calendario real |
| 4 | `feat/web-base` | Layout, tema visual, `SelectorIdioma`, `SelectorSesion`, `EstadoCarga` con el semáforo, cliente API, test de claves i18n | Ya se puede elegir GP y sesión |
| 5 | `feat/analisis-circuito` | `analisis/circuito` (velocidad, frenadas y mapa de marchas), `graficos/circuito`, notebook 01 | Igual (notebook) |
| 6 | `feat/web-circuito` | Endpoint + página `/circuito` | **Proyecto 1 vivo** |
| 7 | `feat/analisis-gomas` | `limpieza`, `analisis/gomas`, `graficos/gomas`, notebook 02 | Igual (notebook) |
| 8 | `feat/web-gomas` | Endpoint + página `/gomas` | **Proyecto 2 vivo** |
| 9 | `feat/analisis-telemetria` | `analisis/telemetria`, `graficos/telemetria`, notebook 03 | Igual (notebook) |
| 10 | `feat/web-telemetria` | Endpoint + página `/telemetria` | **Proyecto 3 vivo** |
| 11 | `docs/readme` | `README.md` (ES) y `README.en.md` (EN) con link, capturas y conclusiones | Repo listo para portafolio |

Definition of Done de cada PR:
- [ ] Plan aprobado antes de empezar
- [ ] Tests nuevos para la lógica nueva, todo en verde
- [ ] Lint y typecheck sin errores
- [ ] Notebook corre de principio a fin (si aplica)
- [ ] Textos nuevos en `es.json` y `en.json` (si hay UI)
- [ ] Capturas en ambos idiomas y preview de Vercel funcionando (si hay UI)
- [ ] Docs actualizados si cambió el diseño

## 10. Mejoras después del lanzamiento (Fase 10 del plan)

No entran en el roadmap actual. Se hacen cuando los 3 proyectos estén en producción, cada una con su propio plan aprobado y su PR. Todas usan datos históricos de OpenF1, así que siguen a $0/mes. El orden es una propuesta y se puede cambiar.

| # | Mejora | Qué hace | Datos de OpenF1 | Dificultad |
|---|--------|----------|-----------------|------------|
| 1 | Imagen para compartir | Al pegar el link en LinkedIn o WhatsApp sale una imagen con el gráfico y la conclusión, generada con `next/og` en Vercel | Los mismos del análisis | Baja |
| 2 | Exportar gráfico | Botón para bajar cualquier gráfico como PNG | — | Muy baja |
| 3 | Glosario | "¿Qué es esto?" junto a cada término (undercut, degradación, delta), en ES y EN | — | Baja |
| 4 | Posiciones vuelta a vuelta | Gráfico de líneas cruzadas con la posición de cada piloto en cada vuelta y las paradas marcadas | `position`, `laps`, `pit` | Baja |
| 5 | Velocidad punta por equipo | Velocidad máxima en la trampa de velocidad contra tiempo de vuelta, para ver qué equipo va con menos carga | `laps` (`st_speed`, `i1_speed`, `i2_speed`) | Baja |
| 6 | Clima contra ritmo | Temperatura de la pista superpuesta a los tiempos de vuelta, dentro de la página de gomas | `weather` | Baja |
| 7 | Paradas en pits | Ranking de paradas más rápidas por equipo y si el undercut ganó posiciones | `pit` (`stop_duration` desde el GP de EE. UU. 2024), `position` | Media |
| 8 | Compañeros de equipo | Diferencia de clasificación carrera por carrera entre los dos pilotos de cada equipo, en toda la temporada | `sessions`, `laps` | Media (muchas sesiones: precalcular y cachear) |
| 9 | Replay de la carrera | Los 20 carros moviéndose sobre el mapa, con play, pausa y velocidad x10/x50 | `location` de todos los pilotos | Media-alta (mucho volumen: se manda por tramos de vueltas y se anima en `canvas`) |

## 11. Fuera del MVP — Proyecto 4: dashboard en vivo

No entra en este roadmap.

**Costo:** los datos en tiempo real de OpenF1 son **pagos**, y el live timing oficial ahora pide F1TV. Por lo tanto, el proyecto 4 tiene costo sí o sí: una suscripción a OpenF1 en tiempo real o a F1TV, más un servidor que no se duerma (Render gratis no sirve para conexiones persistentes). Se evalúa cuando se terminen los 3 proyectos.

Piezas, si se hace: cliente de tiempo real, estado de la sesión, WebSockets en FastAPI, modo replay con sesiones históricas de OpenF1 (gratis, sirve para desarrollar sin pagar) y la página `/[locale]/en-vivo`.

## 12. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| OpenF1 cambia, se cae o empieza a cobrar lo histórico | Capa `datos/` aislada (solo hay que cambiar ahí); fixtures para tests; caché |
| OpenF1 limita las peticiones (429) | Reintentos con backoff, caché, máximo 2 análisis sin caché a la vez |
| Alguien abusa de la API pública y la deja ocupada para todos | Límite de 10 análisis sin caché por minuto por IP (4.6) |
| Primera visita lenta (servidor dormido) | Despertar la API al abrir la web, mensaje claro, reintento; ping opcional |
| Caché perdida al dormirse | Aceptable (5–8 s por sesión) |
| Telemetría a ~3.7 Hz poco precisa | Interpolación por distancia, delta ajustado al tiempo oficial y aclaración en la UI |
| Sin rotación oficial ni números de curva | PCA para rotar; `circuitos.json` propio con las curvas |
| Una carrera sin alguno de los compuestos | La UI muestra solo los compuestos que se usaron y la leyenda se adapta (incluye intermedia y lluvia cuando aparecen) |
| Vuelta más lenta ≠ degradación | Limpieza + corrección de combustible + sección de limitaciones |
| Textos sin traducir | Test de claves en CI; la API solo manda códigos |
| Backend y frontend desincronizados | Tipos TS generados desde el OpenAPI |
