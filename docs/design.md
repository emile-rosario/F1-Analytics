# F1 Analytics — Diseño visual

> Cómo se ve F1 Analytics. Para qué es y qué incluye: [`contexto.md`](contexto.md). Cómo se construye: [`diseno-tecnico.md`](diseno-tecnico.md).
> **Estado:** aprobado por Emile el 2026-10-29. Prototipo en el canvas [«F1 Analytics — diseño web»](https://claude.ai/artifact/Qr1xr4NPcmRtjvLAjwViDn) (inicio, telemetría, gomas y carga). Los datos del prototipo son de ejemplo.

---

## 1. Concepto

La web se ve como **los gráficos de la transmisión de TV**: paneles claros con un corte en ángulo (*lower thirds*) sobre fondo asfalto, cada piloto identificado con el color de su equipo, y tiempos y cifras grandes con números tabulares.

Principios:

- **Un momento fuerte por página.** Cada página tiene una animación protagonista; el resto se queda quieto.
- **El dato manda.** La decoración solo se usa si transmite información (color de equipo, compuesto, velocidad).
- **Se entiende sin ser fan.** Cada análisis termina en una conclusión en lenguaje simple.
- **Marca propia.** Sin logo, tipografía ni marcas oficiales de la F1.

---

## 2. Color

### Base

| Nombre | Hex | Uso |
|---|---|---|
| Asfalto | `#1A1C23` | Fondo |
| Panel | `#242731` | Tarjetas de gráficos, formularios |
| Línea | `#343845` | Bordes, rejilla de gráficos |
| Texto | `#F2F3F6` | Texto principal; fondo de los paneles *lower third* |
| Texto suave | `#A3A9B7` | Etiquetas, ejes, notas |
| Texto sobre panel claro | `#1A1C23` / `#4A4F5C` | Títulos / secundario dentro de los *lower thirds* |

### Acento

| Nombre | Hex | Uso |
|---|---|---|
| Morado | `#B65CFF` | Botón principal, foco del teclado, delta, la página activa. Es el morado de «vuelta más rápida» del timing |
| Morado claro | `#D7B3FF` | Enlaces sobre fondo oscuro |

### Datos

| Escala | Colores |
|---|---|
| Velocidad | lenta `#3D7BFF` → media `#F2C14E` → rápida `#FF5A36` (azul a naranja, apta para daltonismo) |
| Compuestos | blanda `#F0434A`, media `#F2C14E`, dura `#F2F3F6`, intermedia `#3DDC84`, lluvia `#3D7BFF` |
| Equipos | el `team_colour` que manda OpenF1 |
| Preguntas del inicio | circuito `#FF5A36`, gomas `#F2C14E`, telemetría `#B65CFF` |

Reglas:
- Cuando dos pilotos son del mismo color (compañeros de equipo), el segundo va con **línea discontinua**.
- Nada se distingue solo por el color: siempre hay también etiqueta, forma o tipo de línea.
- Contraste de texto mínimo 4.5:1.

---

## 3. Tipografía

| Fuente | Uso |
|---|---|
| **Saira Condensed** (500–800) | Títulos, tiempos de vuelta, códigos de piloto, números grandes, botones |
| **Saira** (400–600) | Texto, etiquetas, formularios |

Ambas de Google Fonts.

| Elemento | Tamaño |
|---|---|
| Título del inicio | `clamp(52px, 7vw, 92px)`, 800, interlineado 0.92 |
| Título de página | 56px, 800 |
| Título de sección | 24–34px, 700 |
| Código de piloto en panel | 32px, 800 |
| Tiempo de vuelta | 30px, 700, `tabular-nums` |
| Texto | 17px, interlineado 1.55 |
| Etiquetas | 13–15px |

- Todos los tiempos y velocidades con `font-variant-numeric: tabular-nums`, para que no bailen al cambiar.
- Formato de números según el idioma: `1:29,179` en español y `1:29.179` en inglés.
- Sin mayúsculas sostenidas en etiquetas.

---

## 4. Marca

- **Logo:** tres barras inclinadas en morado, verde (`#3DDC84`) y amarillo (`#F2C14E`), los colores de sector del timing (mejor absoluto, mejor personal, más lento). Va al lado del nombre «F1 Analytics» en Saira Condensed 700.
- **Pie de página en todas las páginas:** «Datos de OpenF1. Proyecto independiente, sin relación con la Fórmula 1 ni la FIA.» y «Hecho por Emile Rosario».

---

## 5. Componentes

| Componente | Cómo se ve |
|---|---|
| **Lower third** | Bloque de color con corte en ángulo + panel claro. Se usa para los pilotos de la telemetría, las tres preguntas del inicio y las conclusiones |
| **Panel de piloto** | Barra fina del color del equipo + código (VER) + equipo + tiempo de vuelta |
| **Diferencia** | Pieza morada en ángulo entre los dos pilotos, con la diferencia en segundos |
| **Conclusión** | Barra de acento + panel claro con un titular en Saira Condensed y una línea de detalle |
| **Curva** | Número en un círculo blanco sobre el mapa, como en la transmisión |
| **Selector de sesión** | Bloque oscuro con 4 campos (año, Gran Premio, sesión, piloto; en telemetría el campo de piloto pide dos, y en gomas el piloto se elige desde la estrategia) y botón morado «Ver la vuelta». En la app real, listas propias con búsqueda de Gran Premio, no las del navegador |
| **Selector de idioma** | Dos botones ES / EN, el activo en claro |
| **Segmentos** | Pastillas: Mejor vuelta / Q1 / Q2 / Q3 (SQ1 / SQ2 / SQ3 en la clasificación sprint). Solo aparecen en clasificaciones |
| **Interruptor** | «Corregir por combustible», morado cuando está activo |
| **Estrategia** | Fila por piloto con barras por stint del color del compuesto y la letra + número de vueltas (B 15, M 20, D 22) |
| **Lectura del cursor** | Chips con km, velocidad de cada piloto y delta, que se actualizan al mover el cursor |

Radios: 3–4px en piezas chicas, 6–8px en paneles. Los *lower thirds* no llevan radio, llevan el corte en ángulo.

---

## 6. Pantallas

### Inicio
- Título «Cada vuelta, metro a metro.», subtítulo y selector de sesión a la izquierda.
- A la derecha, el **circuito coloreado por velocidad** con las curvas numeradas, la etiqueta del piloto (LEC · Monza 2024 · 1:14.970) y la leyenda de velocidad.
- Debajo, las tres preguntas como *lower thirds* con su número y nivel.

### Circuito
- Mapa de velocidad con pestaña **Marchas**, curvas numeradas, frenadas marcadas, tabla de frenadas y conclusión.

### Gomas
- Estrategias de **todos los pilotos**, ordenados por posición final, con filas compactas. Los abandonos muestran la barra cortada.
- Dispersión de tiempo de vuelta contra edad de la goma del piloto elegido (clic en su fila), hasta 3 a la vez, con una recta por stint.
- Interruptor de combustible, conclusión, tabla de degradación por stint y por compuesto, y nota de limitaciones.

### Telemetría
- Los dos pilotos como en la tele, con la diferencia en el medio.
- Segmentos (mejor vuelta / Q1 / Q2 / Q3, o SQ1 / SQ2 / SQ3), solo en clasificaciones.
- Trazas apiladas con eje compartido: velocidad, acelerador, freno y delta. Un cursor recorre la vuelta en todas a la vez.
- Mapa de los 25 minisectores pintados del color del más rápido, conclusión y tabla de mayores ganancias.

### Carga
- Semáforo de salida que se enciende luz por luz, «Despertando el servidor», contador de segundos y enlace para volver.

### Estado
- Versión del frontend y de la API, y si la API responde.

---

## 7. Animación

**Un momento fuerte por página.** Las entradas usan `cubic-bezier(.2,.8,.2,1)`, entre 0.3 y 0.8 s.

| Página | Momento |
|---|---|
| Inicio | La pista se dibuja tramo a tramo con el color de la velocidad; aparecen los números de curva; un punto recorre el circuito en bucle, más lento en las curvas. Después entran las tres preguntas |
| Telemetría | Los paneles de los pilotos entran desde los lados, aparece la diferencia, se dibujan las trazas y se encienden los 25 minisectores uno por uno |
| Gomas | Las barras de estrategia crecen, los puntos aparecen vuelta por vuelta y luego las rectas. El interruptor de combustible **mueve** los puntos a su nuevo lugar |
| Carga | El semáforo de salida se enciende luz por luz y se apaga, en bucle |

Respuesta a acciones (sin animaciones decorativas):
- Cursor que recorre la vuelta en todas las trazas a la vez, también con un slider usable desde el teclado.
- Clic en un piloto de la estrategia: el gráfico cambia a ese piloto.
- Cambio de segmento o de idioma: transición corta.

Herramientas: CSS y Framer Motion para la interfaz; SVG propio para el mapa y los minisectores; Plotly para el resto de los gráficos.

**Todo respeta `prefers-reduced-motion`:** sin animación, todo aparece en su estado final.

---

## 8. Responsive y accesibilidad

- Ancho máximo del contenido 1240px, márgenes de 24px.
- En el móvil: el selector va arriba y el mapa ocupa todo el ancho, las trazas se apilan, el menú se acomoda en varias líneas y las tablas anchas tienen scroll propio.
- Zonas táctiles de al menos 44px.
- Foco visible: contorno morado de 3px.
- Elementos reales: `<button>`, `<a>`, `<select>`, `<label>`, `<table>`.
- Cada gráfico tiene una descripción (`aria-label`) con su conclusión; los decorativos van ocultos para los lectores de pantalla.
- La lectura del cursor se anuncia con `aria-live`.
