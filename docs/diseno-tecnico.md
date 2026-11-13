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
- Una sesión tarda 5–8 s en bajarse. Eso es aceptable en una petición HTTP normal, así que la API responde directo, sin cola de trabajos ni polling. Con caché la segunda vez es más rápida, pero no instantánea (ver la medición de abajo).
- Detalle encontrado: la vuelta más rápida de LEC en esa clasificación fue en Q2 (89.165 s), no en Q3. Para comparar en igualdad de condiciones, el proyecto 3 deja elegir **"mejor vuelta de la sesión"** o **"mejor vuelta de Q1 / Q2 / Q3"** (ver 4.5).

### Medición en las condiciones de Render Free (2026-11-09)

Con los tres análisis ya hechos, se midió la API completa (no solo un script) dentro de un contenedor con los límites de Render Free: 512 MB de RAM, sin swap y 0,1 CPU. La memoria es el `memory.peak` del cgroup (lo que el sistema compara con el límite para matar el proceso). Se repite con `uv run python scripts/medir_recursos.py` desde `backend/` (necesita Docker, internet y que no haya una sesión en vivo; no corre en CI).

| Análisis (sesión real) | En frío (s) | En caliente (s) | Pico de RAM (MB) | Render, en caliente (s) |
|---|---|---|---|---|
| Circuito · Monza 2024, clasificación | 5,5 | 0,7 | 136 | 0,7 a 1,0 |
| Gomas · España 2024, carrera | 10,1 | 3,0 | 143 | 1,6 |
| Gomas · Mónaco 2024, carrera (78 vueltas) | 8,1 | 2,8 | 143 | 1,4 |
| Telemetría · Bahréin 2024 Q3, VER y LEC | 7,5 | 2,3 | 135 | 1,2 |
| Telemetría · España 2024, carrera, VER y NOR | 6,0 | 1,1 | 134 | 0,9 |
| Los 5 seguidos, mismo contenedor | 3,0 a 6,7 | | **147** | |
| Los 5 a la vez, contenedor nuevo | 15 a 59 | | **167** | |

Conclusiones:
- **La RAM sobra.** El arranque ya ocupa ~122 MB (Python, FastAPI y pandas); cada análisis suma 12 a 25 MB y el máximo, con 5 a la vez, fue de 167 MB: un tercio del límite. No hubo ningún OOM. La cifra de ~80 MB de arriba era el proceso de un script sin la API, así que no se puede comparar con esta.
- **Los tiempos, también bien:** en frío 5 a 10 s (bajar la sesión de OpenF1) y en caliente 0,7 a 3 s. En caliente no es instantáneo porque la caché guarda los datos de OpenF1, no la respuesta: el análisis se vuelve a calcular. El contenedor con 0,1 CPU resultó más lento que Render real (en caliente, hasta el doble), así que sirve como cota pesimista.
- **Después de despertar, la primera petición puede tardar mucho más.** En Render, justo tras despertar el servidor, una petición de circuito tardó 51 s y una de telemetría 36 s (con el disco vacío, CPU escasa y OpenF1 respondiendo cuando le tocó); otras en frío tardaron 3 a 5 s. No se pudo separar cuánto fue de cada cosa. El frontend espera hasta 90 s y reintenta, así que no falla, pero se nota.
- **Una ráfaga se encola, pero la cola tiene tope.** El límite de concurrencia es un semáforo de 2: con 5 análisis a la vez las 5 respuestas fueron 200, pero tres esperaron hasta 59 s (medido). Sin tope, con unas 8 peticiones simultáneas en frío las últimas superarían los 90 s del frontend (estimación). Por eso, desde el 2026-11-10, solo pueden esperar 4 (`MAX_ANALISIS_EN_ESPERA`): el siguiente recibe `servidor_ocupado` (503) al instante. El 4 sale de extrapolar esa única medición (2 corriendo + 4 esperando = 6 dentro, el peor caso quedaría en unos 75 s); no se midió con 6 a la vez. Como una cuenta no garantiza el tiempo (tras despertar, un solo análisis llegó a tardar 36–51 s), además **nadie espera más de 60 s** (`ESPERA_MAXIMA_S`): pasado ese tiempo también recibe `servidor_ocupado`. Eso hace que «esperar + analizar» quede por debajo de los 90 s del frontend por construcción y limita cuánto retiene su lugar quien ya se fue (un hilo que espera no se puede cancelar).
- **Falta** la RAM real de Render: el CLI y la API de logs no la exponen. Se ve en la pestaña *Metrics* del servicio en el dashboard.

### Lo que FastF1 nos daba hecho y ahora hacemos nosotros
| Qué | Cómo lo resolvemos |
|---|---|
| Unir `car_data` y `location` (vienen con timestamps distintos) | `pd.merge_asof` por `date`, con tolerancia de 300 ms |
| Distancia recorrida en la vuelta | Integrar velocidad × Δt (más preciso que sumar distancias X/Y) |
| Recortar la telemetría a una vuelta | Filtro por `date_start` y `date_start + lap_duration` de `laps` |
| Estado de pista por vuelta (verde, SC, VSC) | Reconstruirlo desde `race_control` |
| Vueltas de entrada a pits | Desde `pit.lap_number` |
| Rotación del mapa como en la TV | `datos/circuitos.json` trae la rotación que usa la transmisión (por ejemplo 95° en Monza). En los 2 circuitos que ese archivo no tiene (ver abajo) el mapa sale sin girar |
| Números de curva | OpenF1 no los trae. `datos/circuitos.json` es una **copia estática** de la API pública de [MultiViewer](https://multiviewer.app), generada una sola vez con `scripts/generar_circuitos.py`: cada curva con su número, su letra (la 1A de Hungaroring), su posición X/Y y su distancia desde la meta. La app nunca consulta a MultiViewer mientras corre. Las coordenadas son las mismas de `location` de OpenF1 (décimas de metro): en Monza la muestra de telemetría más cercana a cada curva está a menos de 13 m. Cubre 24 de los 26 circuitos desde 2023; **faltan Kuala Lumpur y Madring**, nuevos en 2026, para los que el análisis se hace sin curvas numeradas: `circuito()` sigue lanzando `analisis_no_disponible`, pero las rutas usan `circuito_o_sin_datos()`, que devuelve `SIN_DATOS` (`conocido=False`, `curvas=()`, rotación 0); las rutas piden el largo con `trazado.longitud_o(medida)`, que da el oficial si el circuito se conoce y, si no, el medido en la telemetría. Cuando MultiViewer los tenga basta volver a correr el script (comprobado el 2026-11-10: no los tiene, ni en años anteriores) |
| Minisectores | MultiViewer trae minisectores oficiales, pero su cantidad varía entre 21 y 28 y casi la mitad de los circuitos no tiene ninguno. Por eso se descartan: los 25 minisectores del análisis son tramos de igual longitud, iguales para todos los circuitos |

Riesgo: OpenF1 no publica límites de peticiones. El cliente reintenta con backoff si recibe 429, y la caché evita repetir llamadas.

## 3. Arquitectura general

```
                       ┌────────────────────── backend/ ───────────────────────┐
OpenF1 API ──► datos/cliente ──► datos/cargador ──► datos/limpieza ──► analisis/* ──┬──► api/ (FastAPI, JSON) ──► frontend/ (Next.js + SVG propio, ES/EN)
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
│   ├── datos/        cliente.py, cargador.py, limpieza.py, telemetria_vuelta.py, circuitos.py, circuitos.json, errores.py
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
- Reintenta (máximo 4 veces) en 429, 5xx y errores de red, con espera creciente de 1, 2, 4 y 8 s; si el 429 trae `Retry-After`, espera eso (hasta 30 s). Otros 4xx no se reintentan. Al agotar los reintentos lanza `ErrorOpenF1` con el código `limite_peticiones` o `fallo_openf1`. Un 401 con el mensaje «Live F1 session in progress» (OpenF1 bloquea el acceso sin clave mientras hay una sesión en vivo, también al histórico) lanza `ErrorOpenF1("openf1_en_vivo")` de inmediato, sin reintentos. Lo que ya esté en caché sigue sirviéndose.
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
- `resultado(sesion)`: clasificación final de `session_result`: `piloto`, `posicion`, `vueltas`, `abandono`, `no_salio`, `descalificado`. Los que no tienen posición (abandonos) quedan al final, de más a menos vueltas. La caché en disco tolera que OpenF1 mezcle números y textos como `+1 LAP` en `gap_to_leader`.

**`telemetria_vuelta.py`**: las funciones reciben el `Cargador` como primer argumento.
- `telemetria_de_vuelta(cargador, sesion, piloto, vuelta) -> pd.DataFrame`: baja `car_data` y `location` solo para el rango de tiempo de esa vuelta, los une con `merge_asof` y agrega `tiempo_s` (desde el inicio de la vuelta) y `distancia_m` (integrando la velocidad). Columnas: `tiempo_s`, `distancia_m`, `x`, `y`, `velocidad`, `acelerador`, `freno`, `marcha`, `rpm`, `drs`.
- `vuelta_rapida(cargador, sesion, piloto, segmento=None) -> int`, donde `segmento` es `None` (toda la sesión), `"Q1"`, `"Q2"` o `"Q3"` en clasificación, o `"SQ1"`, `"SQ2"` o `"SQ3"` en la clasificación sprint. Un segmento en otro tipo de sesión lanza `ErrorDatos("analisis_no_disponible")`. Las fases salen de los mensajes `SESSION STARTED` / `SESSION FINISHED` de la dirección de carrera, y una vuelta pertenece a la fase en la que **empezó**. Las salidas de pits no cuentan.
- Valida que la vuelta tenga al menos 2 muestras por segundo y ningún hueco de más de 2 s; si no, lanza `ErrorDatos("telemetria_incompleta")`. Sin ninguna muestra, `ErrorDatos("sin_telemetria")`.
- Medido con datos reales: la distancia integrada de la mejor vuelta de Monza 2024 da 5752 m contra 5793 m oficiales (−0,7 %), y la de Bahréin queda también dentro del ±2 %.

**`limpieza.py`** (funciones puras sobre las tablas del cargador)
- `estado_pista_por_vuelta(direccion_carrera, n_vueltas) -> pd.Series`: `verde`, `amarilla` (solo la bandera amarilla de toda la pista; las de un sector no cuentan porque no se sabe dónde estaba cada piloto), `vsc`, `sc` o `roja`. El safety car cubre de `SAFETY CAR DEPLOYED` a `SAFETY CAR IN THIS LAP`, el VSC hasta `VIRTUAL SAFETY CAR ENDING` y la roja hasta el siguiente `SESSION STARTED`. Si coinciden varios manda el más serio. Usa el número de vuelta del líder, así que para un rezagado es una aproximación.
- `limpiar_vueltas_carrera(vueltas, paradas, estado_pista, *, quitar_primera=True, solo_verde=True, quitar_pits=True, umbral_mediana=1.07) -> pd.DataFrame`: quita las vueltas sin tiempo, la vuelta 1, las no verdes, la entrada y la salida de boxes y las que tardan más de 1,07 veces la **mediana de ese piloto** (tráfico, errores).
- `agregar_edad_goma(vueltas, stints) -> pd.DataFrame`: agrega `stint`, `compuesto` y `edad_goma` (edad inicial del stint + vueltas desde que empezó).
- `agregar_correccion_combustible(vueltas, segundos_por_vuelta=0.06) -> pd.DataFrame`: agrega `tiempo_corregido_s = tiempo + 0,06 × (vuelta − 1)`, lo que habría tardado la vuelta con el combustible de la primera. Con el combustible que se quema el coche gana unos 0,06 s por vuelta aunque la goma se gaste; sin corregir eso la degradación se ve mucho menor (en España 2024 la media pasa de 0,03 a 0,09 s por vuelta). El 0,06 es una aproximación.

### 4.3 `analisis/circuito.py` (Proyecto 1)
Funciones puras. Reciben la telemetría de una vuelta y las curvas del circuito, **en el mismo sistema de coordenadas**: si se gira el mapa, las curvas se giran con el mismo ángulo. `x` e `y` van en décimas de metro.
- `orientar_circuito(tel, rotacion) -> pd.DataFrame`: copia con `x` e `y` girados `rotacion` grados en sentido antihorario (`y` hacia arriba), con la rotación de `circuitos.json`. Con 95° Monza queda como en la transmisión: recta de meta horizontal abajo y la Parabolica a la derecha.
- `posicion_curvas(curvas, rotacion=0) -> pd.DataFrame`: `numero`, `letra`, `etiqueta` (`"1"`, `"1A"`), `x`, `y`, `distancia_m`, ya girados, para dibujar los números y para pasarle a `zonas_frenado`.
- `zonas_frenado(tel, curvas, longitud_min_m=20, distancia_max_m=500) -> pd.DataFrame`: `curva`, `letra`, `inicio_m`, `fin_m`, `longitud_m`, `vel_entrada`, `vel_salida`, `x_inicio`, `y_inicio`. Una zona es un tramo con el freno pisado (OpenF1 lo manda como 0 o 100). Se asigna a la curva más cercana al punto donde se suelta el freno (la entrada de la curva); las que no tienen una curva a menos de `distancia_max_m` se descartan y, si dos caen en la misma curva (una chicane), queda la más larga.
- `zonas_alta_velocidad(tel, percentil=90, longitud_min_m=20) -> pd.DataFrame`: tramos sobre el percentil, con su velocidad máxima y su posición.
- `resumen_circuito(tel, zonas) -> dict`: solo datos. `pct_a_fondo` (de la **distancia** con el acelerador al 98 % o más), `vel_maxima` y `vel_minima` (`kmh` y `distancia_m`) y `frenada_mas_fuerte` (la que más velocidad pierde: `curva`, `letra`, `vel_entrada`, `vel_salida`; `None` si no hubo frenadas). La web arma la conclusión con estos números.

`graficos/circuito.py` (Matplotlib, solo para notebooks y README): `mapa_velocidad` y `mapa_marchas`, con las curvas numeradas en círculos blancos y un rombo donde empieza cada frenada. La paleta de marchas es viridis (`estilo.colores_marcha()`).

### 4.4 `analisis/gomas.py` (Proyecto 2)
Recibe las vueltas ya limpias y con la edad de la goma. «Degradación» es la **pendiente** de una recta que ajusta el tiempo de vuelta contra la edad de la goma dentro de cada stint (segundos por vuelta de uso). No es el desgaste real: se mezclan el tráfico, la temperatura y la evolución de la pista, que no se pueden corregir con estos datos.
- `resumen_stints(vueltas) -> pd.DataFrame`: un renglón por stint con sus vueltas limpias, edades y tiempo medio.
- `degradacion_por_stint(vueltas, columna="tiempo_corregido_s", minimo_vueltas=5) -> pd.DataFrame`: `pendiente_s_por_vuelta`, `intercepto`, `r2`, `n_vueltas`, `edad_inicial`, `edad_final` e `insuficiente`. Los stints con menos de 5 vueltas limpias, o cuya goma no cambia de edad, quedan `insuficiente` y sin pendiente.
- `comparar_compuestos(degradacion) -> pd.DataFrame`: pendiente media de cada compuesto ponderada por sus vueltas, y mediana; sin los stints insuficientes; de la más blanda a la más dura.
- `resumen_gomas(degradacion, stints) -> dict`: solo datos: stints válidos, insuficientes y sin degradación (pendiente ≤ 0), compuesto que más y que menos se gasta (`None` si hay uno solo), stint más largo y paradas por piloto.

`graficos/gomas.py` (Matplotlib, notebooks y README): `estrategias` (una fila por piloto ordenada por posición final, con la letra del compuesto y las vueltas de cada barra y una cruz en quien abandona), `dispersion_edad` (hasta 3 pilotos, un panel por piloto con los mismos ejes y una recta por stint; el color es el compuesto) y `degradacion_compuestos`.

`scripts/buscar_carrera_gomas.py` revisa las carreras de 2023 en adelante y lista las que son secas, usan los tres compuestos en cantidad (mínimo 8 stints de cada uno), casi no tienen vueltas neutralizadas y no tuvieron bandera roja.

### 4.5 `analisis/telemetria.py` (Proyecto 3)
- `remuestrear_por_distancia(tel, paso_m=5.0) -> pd.DataFrame`
- `alinear_vueltas(tel_a, tel_b, paso_m=5.0) -> pd.DataFrame`, con sufijos `_a` y `_b`.
- `delta_tiempo(alineadas, duracion_a_s=None, duracion_b_s=None, ventana_m=VENTANA_SUAVIZADO_M) -> pd.Series`: delta acumulado (positivo = B pierde contra A), integrando `ds / v`. Con las duraciones oficiales (`lap_duration`) el tiempo de cada vuelta se escala para terminar justo en la suya, y el delta final es la diferencia oficial: la integración con ~3.7 Hz acumula error (en Bahréin 2024 daba −0,119 s donde el oficial es +0,228 s). El ajuste solo asegura el final; a mitad de vuelta el delta es una estimación. Por último se alisa con una media móvil de `ventana_m` metros (105 m; 0 la desactiva): en los bordes la serie se refleja respecto al extremo, así que el inicio sigue en 0, el final no se mueve y una recta queda igual.
- `ganador_por_minisector(alineadas, delta, n_sectores=25) -> pd.DataFrame`: 25 tramos de igual longitud; columnas `sector`, `inicio_m`, `fin_m`, `diferencia_s` y `ganador` (`"a"`, `"b"` o `"empate"`). Recibe el `delta` para que los ganadores sean coherentes con la curva que se dibuja.
- `resumen_telemetria(alineadas, delta, ganadores) -> dict`: `delta_final_s`, `ganador`, `sectores_ganados`, `mayor_ventaja` (por piloto, con el minisector y la ventaja en segundos), y `pct_a_fondo`, `vel_maxima` y `vel_minima` por piloto (`a` y `b`).

`alinear_vueltas` estira las dos vueltas para que midan lo mismo (el promedio de sus largos): la distancia sale de integrar la velocidad y cada vuelta se equivoca un ~1 % distinto, pero las dos recorren la misma pista.

**Cuánto se equivoca el delta.** Se comparó con los tiempos oficiales de sector de OpenF1 (`duration_sector_1/2/3`) en 10 comparaciones de la Q3 de 5 carreras de 2024 (`scripts/validar_delta.py`, 20 cruces de sector): error medio de **0,042 s** y máximo de **0,132 s**. Con los relojes de las muestras en vez de integrar `ds / v` el error medio era de 0,13 s, por eso se mantiene la integración. Los empates de minisector son diferencias menores que `EMPATE_S = 0.01` s, el mismo orden que ese error.

**Alisado del delta (ventana de 105 m).** Con una muestra cada ~20 m, una medida mala en una curva lenta (75–110 km/h, donde `ds / v` pesa más) dejaba dientes de 40 a 120 ms que no eran una ventaja real. Se midió contra la vuelta de Bahréin 2024: el dentado (lo que el delta se aleja de su mediana móvil de 125 m) bajaba de 124 a 23 ms con 105 m (51 ms con 65 m), y el residuo típico de 13,3 a 3,4 ms. **No es una solución completa:** los lomos anchos que el delta hace en cada frenada fuerte (sube 0,1–0,2 s y vuelve a bajar en ~200–300 m) solo bajan una mediana del 26 % (entre 15 y 62 % en las seis curvas lentas de Bahréin). Son más anchos que la ventana, así que no son solo ruido de muestreo; se probó la hipótesis de que vinieran del desfase de distancia entre las dos vueltas y no se sostiene (ver más abajo). Por eso la página sigue diciendo en sus limitaciones que lo que cuenta es el nivel al que se estabiliza el delta después de la curva. Coste: el alisado también redondea cambios reales y el error contra los sectores oficiales sube con el ancho de la ventana (medio / máximo: 0,035 / 0,107 s sin alisar, 0,039 / 0,120 con 65 m, 0,042 / 0,132 con 105 m). Se eligió 105 m para quitar los picos grandes; si se prefiere conservar más detalle, basta bajar `VENTANA_SUAVIZADO_M`. Las alternativas descartadas: restar directamente los relojes de las muestras (no reduce el ruido y en España erraba 116 ms en el sector 1, contra 24 ms) y suavizar solo la velocidad antes de integrar (reduce poco). Lo que no arregla el alisado es el desfase lento entre las dos vueltas (la distancia integrada se equivoca ~1 % distinto en cada una), que llega a ~0,09 s a mitad de vuelta en algún caso.

**Alineación por posición (probada y descartada, 2026-11-10).** Para ver si los lomos venían del desfase de distancia se alinearon las dos vueltas por su posición X/Y real (proyectando los puntos de B sobre la trayectoria de A) en vez de por la distancia integrada, en las mismas 10 comparaciones: error medio contra los sectores oficiales de **0,161 s** (máximo 0,466 s) sin alisar y de 0,110 s (máximo 0,429 s) alisado, contra 0,042 s (0,132 s) del método actual, y un delta mucho más ruidoso. La razón está en los datos: `car_data` y `location` se unen con hasta 300 ms de tolerancia (`TOLERANCIA_UNION`), así que cada posición X/Y puede estar desfasada ~150 ms de su muestra de reloj, entre 3 y 12 m según la velocidad; alinear por posición hereda ese error, mientras que la distancia integrada usa el mismo reloj que la velocidad. Tampoco ayudó restar los relojes de las muestras (arriba). Conclusión: con ~3,7 muestras por segundo no hay un arreglo barato, y los lomos quedan como **límite conocido** que la página explica. Fue un experimento puntual; no se conservó el script.

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
| GET | `/api/analisis/circuito?sesion&piloto` | La vuelta más rápida del piloto: puntos `x`/`y` (ya girados), velocidad y marcha; curvas con su etiqueta; zonas de frenado; resumen. Solo sesiones terminadas |
| GET | `/api/analisis/gomas?sesion&pilotos` | Estrategias de los 20 pilotos por posición final, vueltas limpias de los pilotos elegidos (hasta 3, repitiendo `pilotos`; sin él, el podio), degradación de cada stint y por compuesto y resumen, todo con y sin corrección por combustible. Solo carreras y sprints terminados |
| GET | `/api/analisis/telemetria?sesion&piloto_a&piloto_b&segmento` | Canales alineados, delta, minisectores, resumen (ver abajo) |

- Las sesiones se identifican con el `session_key` de OpenF1, que es estable y corto.
- Los modelos van en `esquemas.py`, y los tipos TS del frontend se generan desde el OpenAPI con `openapi-typescript`.
- Errores con código (cuándo sale cada uno: `contexto.md` §5.2): `parametro_invalido`, `sesion_no_encontrada`, `sesion_no_terminada`, `piloto_no_encontrado`, `analisis_no_disponible`, `sin_telemetria`, `telemetria_incompleta`, `limite_peticiones`, `servidor_ocupado`, `fallo_openf1`, `openf1_en_vivo`.
- Estado HTTP de cada código: `parametro_invalido`, `analisis_no_disponible` y `telemetria_incompleta` → 422; `sesion_no_encontrada`, `piloto_no_encontrado` y `sin_telemetria` → 404; `sesion_no_terminada` → 409; `limite_peticiones` → 429; `fallo_openf1`, `openf1_en_vivo` y `servidor_ocupado` → 503 (este último con `Retry-After: 10`, que sirve a clientes que no son el navegador: la web no lo lee —CORS no lo expone— y no reintenta sola, la persona decide cuándo). Se usa 503 y no 502 porque el frontend reintenta los 502 como señal de «servidor dormido». Todo error responde `{"codigo": "..."}`, también la validación de FastAPI.
- Los tipos TypeScript del frontend se generan del OpenAPI: `uv run python scripts/exportar_openapi.py` escribe `backend/openapi.json` y `npm run tipos` genera `frontend/src/lib/tipos-api.ts`. Un test del backend y un paso del CI del frontend fallan si alguno quedó desactualizado.
- Validación: año entre 2023 y el actual, tipo de sesión y segmento de listas cerradas, pilotos que existan en la sesión, el análisis de gomas solo en carreras y sprints, y los segmentos Q/SQ solo en clasificaciones.
- **Limitador de concurrencia** (máximo 2 análisis a la vez, 4 esperando en orden de llegada y 60 s de espera como tope; si no, `servidor_ocupado`. Un solo cerrojo y el turno se entrega directo al primero de la cola, para que nadie se cuele), para no saturar OpenF1 ni el servidor. Una respuesta que ya estaba en caché también se rechaza si el servidor está saturado: no se sabe de antemano que iba a ser rápida. Implementado en `api/limites.py`; los dos análisis comparten dependencias y el gancho del límite en `api/rutas/comunes.py`.
- **Límite por IP:** máximo 10 análisis sin caché por minuto por IP (las respuestas en caché no cuentan), leyendo la IP de `X-Forwarded-For` porque en Render la API está detrás de un proxy. Se cuenta cuando el análisis va a pedir a la red lo que pesa de él (la telemetría, `car_data` y `location`, en el circuito; las vueltas de toda la carrera, `laps`, en gomas): el cliente de OpenF1 avisa justo antes de cada petición (`antes_de_pedir`) y lo que sale de la caché nunca llega ahí. Se toma la primera IP de la lista; una cabecera inventada permitiría repartir peticiones entre IPs falsas, pero el límite de concurrencia sigue en pie. Al pasarlo responde 429 con `limite_peticiones`.
- Gzip desde el PR 6a (respuestas de más de 1 KB). El análisis del circuito manda las ~300 muestras de la vuelta tal cual.
- **`/api/analisis/telemetria`** (PR 10a): `piloto_a` es la referencia y `piloto_b` el que se compara; `segmento` (`Q1`/`Q2`/`Q3`, `SQ1`/`SQ2`/`SQ3`) es opcional y solo vale en esas sesiones (si no, `analisis_no_disponible`); `piloto_a == piloto_b` da `parametro_invalido`. Elige la vuelta rápida de cada piloto, baja su telemetría y alinea las dos cada 5 m. La respuesta lleva `piloto_a` y `piloto_b` (con su vuelta y tiempo oficial), `canales` en **columnas** (un arreglo por canal: ~1000 puntos en 60 KB, 14 KB con gzip, contra varios cientos de KB si fuera una lista de objetos), las `curvas`, los 25 `minisectores` y el `resumen`. `x` e `y` son la posición de la vuelta de A, ya girada como en la transmisión; el freno va como booleano. Una petición cuenta como **un** cupo del límite por IP aunque baje 4 consultas pesadas (`car_data` y `location` de cada piloto). En un circuito que no está en `circuitos.json` (Kuala Lumpur, Madring) `curvas` llega vacío, el mapa no se gira y `longitud_m` es la medida en las vueltas; el resto de la comparación no cambia.
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
│   │   ├── MapaCircuito.tsx      # SVG: mapa de velocidad/marchas, curvas y frenadas
│   │   ├── BotonDescargarPng.tsx # «Descargar PNG» sobre cada gráfico (usa lib/exportar.ts)
│   │   ├── VistaGomas.tsx, EstrategiaCarrera.tsx, DispersionGomas.tsx, TablasDegradacion.tsx, ConclusionGomas.tsx
│   │   ├── VistaTelemetria.tsx, PanelTelemetria.tsx, ControlesRango.tsx, MapaMinisectores.tsx, ConclusionTelemetria.tsx
│   └── lib/  api.ts, tipos-api.ts, colores.ts, exportar.ts, formato.ts, gomas.ts, telemetria.ts
└── tests/
```

### Stack
- **Next.js (App Router) + TypeScript + Tailwind**, con tema oscuro estilo F1.
- **Gráficos en SVG propio** (React), sin librería de gráficos: se animan con CSS y pesan nada. Las escalas y los ejes están en `lib/` y en cada componente; la tabla y el texto son la alternativa accesible de cada gráfica.

### Diseño visual
Colores, tipografía, marca, componentes, pantallas y animaciones: [`design.md`](design.md).

Cómo se implementa:
- Los colores y tipografías de `design.md` van como variables del tema de Tailwind (`asfalto`, `panel`, `morado`, `compuesto-blanda`…), nunca escritos a mano en los componentes.
- Fuentes con `next/font/google` (Saira y Saira Condensed), sin pedirlas a Google desde el navegador.
- Animaciones de la interfaz con CSS y Framer Motion; los gráficos (mapa del circuito, dispersión de gomas, minisectores) en SVG propio, y las barras de estrategia en HTML con CSS.
- `prefers-reduced-motion` se respeta en un solo lugar (un hook compartido) para que todos los componentes lo cumplan.

### Idiomas (ES / EN)
- `next-intl` con rutas `/es/...` y `/en/...`. Español por defecto, y la primera visita detecta el idioma del navegador.
- `SelectorIdioma` cambia de idioma conservando los parámetros de la sesión.
- Se traduce todo: la interfaz, ejes, leyendas y tooltips, las conclusiones (plantillas a partir de los datos estructurados), los códigos de error, los compuestos y los tipos de sesión.
- Formato de números y tiempos según el locale (`useFormatter` de `next-intl` y `lib/formato.ts`). Las unidades no cambian.
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
- **/telemetria**: `SelectorSesion` en modo comparación (año, Gran Premio, sesión, piloto A, piloto B y segmento: mejor vuelta / Q1 / Q2 / Q3, o SQ1 / SQ2 / SQ3 en la clasificación sprint; en las demás sesiones no aparece), con todo en la URL (`piloto_a`, `piloto_b`, `segmento`) + `PanelTelemetria` (velocidad, acelerador, freno y delta en un solo SVG, con un cursor controlado por mouse, toque y un deslizador accesible, y un tooltip HTML pegado al puntero solo con mouse; el tramo visible, `rango`, se elige con los dos deslizadores de `ControlesRango` o arrastrando con el mouse, se recorta con un `clipPath` y deja el cursor dentro; no va en la URL) + `MapaMinisectores` (el punto del mapa sigue al cursor) + conclusión y limitaciones. El cursor vive en `VistaTelemetria` y se comparte con el mapa; vuelve a la meta al cambiar la comparación. Sin Plotly (ver `contexto.md`).
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

**Dependencias y seguridad:**
- **En CI:** `frontend.yml` corre `npm audit --omit=dev --audit-level=moderate` (solo en Ubuntu: no depende del sistema). Audita únicamente lo que se publica; un aviso en una herramienta de desarrollo, como ESLint, no frena los PR. Si aparece un aviso en una dependencia de producción, todos los PR fallan hasta arreglarlo, que es lo que se quiere.
- **Dependabot** (`.github/dependabot.yml`): cada lunes revisa `npm` (frontend), `uv` (backend) y GitHub Actions. Las versiones menores y de parche van agrupadas en un solo PR por ecosistema; las mayores llegan una por PR; máximo 3 abiertos por ecosistema. Emile revisa y mergea, como siempre.
- **`html-to-image` (2026-11-10):** MIT, sin dependencias propias, `npm audit` en 0. Su última versión es de febrero de 2025, así que el mantenimiento es lento; si algún día se abandona, el código que lo usa está en un solo archivo (`lib/exportar.ts`).
- **`minimatch` en `overrides` (2026-11-09):** `npm audit` marcaba `minimatch` 10.2.6 (denegación de servicio con patrones glob, parchado en 11.0.1) dentro de `@typescript-eslint/typescript-estree`, que todavía pide `^10.2.2`. Se fuerza a `^11.0.5` solo para ese paquete en `frontend/package.json`. Solo afecta a las herramientas de lint (producción ya salía con 0 avisos) y `npm audit fix --force` no sirve: propone bajar `eslint-config-next` a la 15. **Cuando `typescript-estree` suba su dependencia a `minimatch` 11, quitar el `override`.** Backend: `pip-audit` sobre `uv.lock`, con y sin desarrollo, no encontró vulnerabilidades.

**Exportar gráficos como PNG (2026-11-10):** `lib/exportar.ts` convierte el nodo del gráfico con `html-to-image` (`toCanvas`, al doble de resolución y con el fondo de la web), le pone margen y dibuja debajo, sobre el lienzo, la línea de crédito, y lo baja con un nombre como `f1analytics-telemetria-9468-ver-lec.png`. Tres detalles que costaron descubrirlos con datos reales:
- **La opción `filter` de la librería no sirve dentro de un SVG:** clona todo el subárbol de una vez y nunca la llama. Los elementos de interacción (cursor, tooltip, banda de zoom) llevan `data-no-exportar` y se esconden en la página (`visibility: hidden`) mientras dura la captura y se restauran después, también si falla. Cuesta un parpadeo del cursor de unas décimas de segundo.
- **Las animaciones se terminan antes de capturar** (`getAnimations().finish()`), para no exportar el mapa a medio dibujar.
- **El crédito no toca el DOM visible:** se dibuja en el lienzo final, así no hay parpadeo ni cambios de diseño.
Cada botón apunta al nodo que contiene el gráfico **y su leyenda** (por eso la leyenda de compuestos de la dispersión vive dentro de `DispersionGomas`). No se probó la descarga en un iPhone ni en Android: el dibujo se probó con Chromium.

**Local:** `docker compose up` (API en `:8000`, web en `:3000`), o cada uno por separado con `uv run` y `npm run dev`.

**Deploy (desde el PR 1), $0/mes:**
- **Frontend → Vercel (Hobby, gratis).** Merge a `main` → producción. Cada PR → link de preview comentado en el PR.
- **API → Render (Free, gratis), sin tarjeta.**
  - Merge a `main` → deploy automático. Configurado en `render.yaml` dentro del repo.
  - 512 MB de RAM (medido en un contenedor con esos límites: ~122 MB al arrancar y 167 MB como máximo con 5 análisis a la vez; ver sección 2), 750 horas al mes (alcanza para 1 servicio 24/7).
  - Se duerme a los 15 min sin tráfico (ver sección 5) y el disco se borra al dormirse (ver la caché en 4.2).
  - Previews de PR del backend: no en el plan gratis. Los previews del frontend apuntan a la API de producción, y los cambios de API se prueban local antes del merge.
- **Opcional, a decidir:** una GitHub Action que llame a `/api/salud` cada 14 min para que no se duerma. Gasta ~744 h/mes de las 750, así que alcanza para un solo servicio. Ojo: el cron de Actions puede atrasarse más de 15 min (la API se dormiría igual) y se desactiva solo tras 60 días sin actividad en el repo; un monitor externo gratis puede ser más confiable. Se decide en el PR 1.

## 8. Sesiones destacadas (por defecto)

| Análisis | Sesión | Por qué |
|----------|--------|---------|
| 1. Circuito | Monza 2024, Clasificación, pole | Rectas largas y frenadas fuertes: el contraste de velocidad se ve clarísimo |
| 2. Gomas | España 2024, carrera (`session_key` 9539) | Seca, sin safety car, VSC ni bandera roja, y con 30 stints de blanda, 19 de media y 13 de dura. Elegida con `scripts/buscar_carrera_gomas.py` (10 de las 89 carreras de 2023 a 2026 cumplen todo). Bahréin 2024 no sirve (solo blanda y dura) y Suzuka 2024 tuvo bandera roja en la vuelta 1 |
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
| 2a | `feat/datos-openf1` | `cliente`, `cargador`, `telemetria_vuelta`, `config`, fixtures | Igual (backend interno) |
| 2b | `feat/circuitos-estilo` | `circuitos.json` (copia de MultiViewer), `datos/circuitos.py`, `estilo` | Igual (backend interno) |
| 3 | `feat/api-base` | `/calendario`, `/sesiones`, `/pilotos`, generación de tipos TS | API con calendario real |
| 4 | `feat/web-base` | Layout, tema visual, `SelectorIdioma`, `SelectorSesion`, `EstadoCarga` con el semáforo, cliente API, test de claves i18n | Ya se puede elegir GP y sesión (hecho; la búsqueda de GP y las listas propias del diseño quedan para después) |
| 5 | `feat/analisis-circuito` | `analisis/circuito` (velocidad, frenadas y mapa de marchas), `graficos/circuito`, notebook 01 | Igual (notebook) |
| 6a | `feat/api-circuito` | Endpoint `/api/analisis/circuito`, gzip, límite por IP y de concurrencia | API con el análisis del circuito (hecho) |
| 6b | `feat/web-circuito` | Página `/circuito` (selector con piloto, mapa SVG con pestañas Velocidad/Marchas, conclusión, tabla de frenadas), tres preguntas en el inicio | **Proyecto 1 vivo** |
| 7 | `feat/analisis-gomas` | `limpieza`, `analisis/gomas`, `graficos/gomas`, notebook 02 | Igual (notebook) |
| 8a | `feat/api-gomas` | Endpoint `/api/analisis/gomas` | API con el análisis de gomas (hecho) |
| 8b | `feat/web-gomas` | Página `/gomas` (estrategias de todos, dispersión en SVG propio, interruptor de combustible, tablas, conclusión y limitaciones) | **Proyecto 2 vivo** (hecho) |
| 9 | `feat/analisis-telemetria` | `analisis/telemetria`, `graficos/telemetria`, notebook 03 | Igual (notebook) (hecho) |
| 10a | `feat/api-telemetria` | Endpoint `/api/analisis/telemetria` | API con la comparación de telemetría (hecho) |
| 10b | `feat/web-telemetria` | Página `/telemetria` (selector de segmento, paneles con cursor en SVG propio, mapa de minisectores, conclusión y limitaciones) | **Proyecto 3 vivo** (hecho) |
| 11 | `docs/readme` | `README.md` (ES) y `README.en.md` (EN) con link, capturas y conclusiones | Repo listo para portafolio (hecho) |

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
| 2 | Exportar gráfico ✅ (2026-11-10) | Botón para bajar cualquier gráfico como PNG | — | Muy baja |
| 3 | Glosario ✅ (2026-11-12) | Página `/glosario` con cada término y un "¿qué es esto?" desplegable junto a él en las vistas (degradación, stint, delta…), en ES y EN. *Undercut* entra con la mejora 7 | — | Baja |
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
| OpenF1 bloquea todo acceso sin clave durante una sesión de F1 en vivo (verificado el 2026-10-31) | Código `openf1_en_vivo` con mensaje claro en la web; la caché sirve lo ya consultado. Opciones para la demo: sesiones destacadas como archivos estáticos o una clave de pago (`contexto.md` §11) |
| OpenF1 limita las peticiones (429) | Reintentos con backoff, caché, máximo 2 análisis sin caché a la vez |
| Alguien abusa de la API pública y la deja ocupada para todos | Límite de 10 análisis sin caché por minuto por IP (4.6) |
| Primera visita lenta (servidor dormido) | Despertar la API al abrir la web, mensaje claro, reintento; ping opcional. La primera petición tras despertar llegó a tardar 36 y 51 s; el frontend espera hasta 90 s |
| Muchas peticiones en frío a la vez | El semáforo de 2 las encola (5 a la vez: hasta 59 s, sin errores) y la cola tiene tope de 4: la siguiente recibe `servidor_ocupado` (503) al instante. Sin el tope, ~8 superarían los 90 s del frontend |
| Caché perdida al dormirse | Aceptable (5–8 s por sesión) |
| Telemetría a ~3.7 Hz poco precisa | Interpolación por distancia, delta ajustado al tiempo oficial y aclaración en la UI |
| OpenF1 no trae números de curva ni rotación | `circuitos.json`, copia estática de MultiViewer (sin dependencia en producción); en los 2 circuitos nuevos que MultiViewer no tiene el análisis se hace sin números de curva (decisión del 2026-11-10; antes respondía `analisis_no_disponible`): `curvas` y `frenadas` llegan vacías, el mapa no se gira y la web lo explica. El mapa de velocidad y de marchas y el resumen siguen siendo útiles sin las curvas |
| MultiViewer es un servicio de terceros y no encontré sus términos de uso | Solo se usa una copia estática, con atribución en el README y en el propio JSON; si desaparece, la app sigue igual |
| Una carrera sin alguno de los compuestos | La UI muestra solo los compuestos que se usaron y la leyenda se adapta (incluye intermedia y lluvia cuando aparecen) |
| Vuelta más lenta ≠ degradación | Limpieza + corrección de combustible + sección de limitaciones |
| Textos sin traducir | Test de claves en CI; la API solo manda códigos |
| Backend y frontend desincronizados | Tipos TS generados desde el OpenAPI |
