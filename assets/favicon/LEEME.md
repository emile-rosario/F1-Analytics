# Favicon de F1 Analytics

Tres barras con los colores de sector (morado, verde, amarillo) sobre asfalto `#1A1C23`. Ver `docs/design.md` §4.

| Archivo | Va en | Para qué |
|---|---|---|
| `icon.svg` | `frontend/src/app/icon.svg` | Favicon principal (navegadores modernos) |
| `favicon.ico` | `frontend/src/app/favicon.ico` | 16, 32 y 48 px, navegadores viejos y Windows. El de 16 px tiene las barras más separadas para que se lean |
| `apple-icon.png` | `frontend/src/app/apple-icon.png` | 180 px, al guardar en la pantalla de inicio del iPhone (sin esquinas: iOS las redondea) |
| `icon-192.png`, `icon-512.png` | `frontend/public/` | Android y el manifest |
| `manifest.webmanifest` | `frontend/src/app/manifest.webmanifest` | Nombre y colores al instalar la web |
| `icon-16.svg` | — | Fuente del tamaño 16 px |

Next.js detecta solo los archivos de `src/app/` y pone las etiquetas `<link>` en el `<head>`. Se integra en el PR 0.
