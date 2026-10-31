# F1 Analytics

Aplicación web para entender una sesión de Fórmula 1 con datos reales de [OpenF1](https://openf1.org): mapa de velocidad del circuito, desgaste de gomas y comparación de telemetría entre dos pilotos. En español e inglés.

> **Estado:** en construcción. Todavía no hay link público. El README completo, con capturas y conclusiones, llega en el PR 11.

## Documentación

- [`docs/contexto.md`](docs/contexto.md): qué es el proyecto, decisiones y alcance.
- [`docs/diseno-tecnico.md`](docs/diseno-tecnico.md): arquitectura, API y roadmap.
- [`docs/design.md`](docs/design.md): diseño visual.

## Correr en local

Con Docker (API en `:8000`, web en `:3000`):

```
docker compose up --build
```

Sin Docker:

```
# Backend (requiere uv)
cd backend
uv sync
uv run uvicorn f1analytics.api.main:app --reload

# Frontend (requiere Node 22)
cd frontend
npm ci
npm run dev
```

## Licencia

[MIT](LICENSE). Proyecto independiente, sin relación con la Fórmula 1 ni la FIA.
