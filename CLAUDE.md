# F1 Analytics — instrucciones para Claude Code

Aplicación web que analiza sesiones de Fórmula 1 con datos reales de OpenF1: mapa de velocidad del circuito, degradación de gomas y comparación de telemetría entre dos pilotos. Bilingüe (es/en).

## Documentos (manda el de más arriba)

1. [`docs/contexto.md`](docs/contexto.md): qué es, decisiones, alcance y plan por fases.
2. [`docs/diseno-tecnico.md`](docs/diseno-tecnico.md): cómo se construye, API y roadmap de PRs.
3. [`docs/design.md`](docs/design.md): cómo se ve.

Un cambio de decisión se hace primero en `contexto.md` y después se propaga a los otros.

## Forma de trabajo

- **No escribir código sin aprobación explícita de Emile.** Analizar, plantear dudas y presentar un plan primero.
- Trabajar por fases y probar cada parte antes de seguir.
- Emile está aprendiendo: explicar las decisiones relevantes.
- **Git:** una rama por tarea (`chore/`, `feat/`, `fix/`, `docs/`) y Pull Request a `main`. Claude implementa, prueba y abre el PR; **Emile revisa y mergea**. Nunca mergear ni hacer push a `main`.
- Commits pequeños: prefijo de Conventional Commits en inglés y mensaje en español (`feat: agregar detección de frenadas`). Descripciones de PR en español.
- Cada PR documenta en su descripción: archivos modificados, pruebas realizadas, configuración necesaria y pendientes reales.
- CI en verde antes de integrar.

## Convenciones de código

- **Todo nuestro código va en español**: módulos, funciones, variables, tests, campos del JSON de la API y rutas. **Sin tildes ni ñ en identificadores** (`anio`, `sesion`). En comentarios, docstrings y textos sí se escribe bien.
- Lo que viene de afuera se queda como viene (campos de OpenF1, métodos de librerías) y se renombra a español en `backend/src/f1analytics/datos/`.
- Python: `snake_case` y `PascalCase` para clases. TypeScript: `camelCase` y `PascalCase` para componentes.
- **La API nunca manda textos para el usuario**, solo datos y códigos. El frontend los traduce (`messages/es.json`, `messages/en.json`).
- Capas del backend: `datos/` (único que habla con OpenF1) → `analisis/` (funciones puras) → `api/` (esquemas Pydantic, sin cálculos). `graficos/` solo para notebooks.
- Sin logo, tipografía ni marcas oficiales de la F1.

## Comandos

Backend (desde `backend/`, con `uv`):

```
uv sync
uv run ruff check . && uv run ruff format --check .
uv run pytest
uv run uvicorn f1analytics.api.main:app --reload
```

Frontend (desde `frontend/`):

```
npm ci
npm run lint && npx tsc --noEmit
npm test
npm run build
npm run dev
```

Todo junto: `docker compose up` (API en `:8000`, web en `:3000`).

## Notas del entorno

- Windows con PowerShell. Para editar archivos con tildes usar las herramientas Edit/Write, no `Add-Content` ni `Set-Content` (escriben ANSI y rompen la codificación).
