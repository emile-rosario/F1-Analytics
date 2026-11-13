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
| Pilotos en la telemetría | A (referencia) `#B65CFF`, B (comparado) `#FF8A3D`, empate `#6B7285` |
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
- **Favicon:** las mismas tres barras sobre un cuadro asfalto (`#1A1C23`) con esquinas redondeadas, para que se vea en pestañas claras y oscuras. A 16 px las barras van más finas y separadas para que no se peguen. `assets/favicon/` guarda los originales de diseño; las copias que sirve la web están en `frontend/src/app/` y `frontend/public/` (Next pone solo las etiquetas del `<head>`). Al instalar la web en el móvil se abre sin barra del navegador (`display: standalone`), sin service worker ni modo sin conexión.
- **Tarjeta para compartir (1200×630):** fondo asfalto, las tres barras del logo con «F1 Analytics» en Saira Condensed 800, el lema en morado claro, la descripción en gris, «Datos de OpenF1» abajo a la izquierda y una franja a todo el ancho con los tres colores de sector. Es la tarjeta de marca; las tarjetas con datos de una sesión mantienen la franja, la tipografía y el crédito.
- **Pie de página en todas las páginas:** «Datos de OpenF1. Proyecto independiente, sin relación con la Fórmula 1 ni la FIA.» y «Hecho por Emile Rosario», con los enlaces «Glosario» y «Estado del servicio».
- **Página de glosario (`/glosario`):** título y subtítulo como el resto de páginas, un índice de enlaces a cada término y debajo una tarjeta por término (fondo de panel, título de sección, definición en blanco y «Ejemplo:» en gris). Ancho de lectura de 48 rem como el bloque «Qué no mide este análisis»; una sola columna también en escritorio.

---

## 5. Componentes

| Componente | Cómo se ve |
|---|---|
| **Lower third** | Bloque de color con corte en ángulo + panel claro. Se usa para los pilotos de la telemetría, las tres preguntas del inicio y las conclusiones |
| **Panel de piloto** | Barra fina del color del equipo + código (VER) + equipo + tiempo de vuelta |
| **Diferencia** | Pieza morada en ángulo entre los dos pilotos, con la diferencia en segundos |
| **Ayuda de términos** | Fila bajo el título de una sección o tabla: «Qué significa:» y un botón redondeado con borde por término (mínimo 44 px de alto). Al pulsar uno se abre debajo un panel de fondo `panel` con el nombre en negrita, la definición corta y «Ver en el glosario»; solo uno abierto a la vez |
| **Término subrayado** | Palabra con subrayado punteado, dentro de las salvedades «Qué no mide este análisis». Al pulsarla, el mismo panel se abre al final de la viñeta o del párrafo, nunca en medio de la frase; Esc lo cierra y devuelve el foco |
| **Botón de descarga** | Botón secundario «Descargar PNG» a la derecha, sobre cada gráfico (mapa del circuito; gráficas y mapa de tramos de la telemetría; estrategia y dispersión de gomas). Baja la imagen al doble de resolución, sobre el fondo de la web y con la leyenda; debajo, en gris, «F1 Analytics · Datos de OpenF1». No salen el cursor, el tooltip ni la banda de zoom. Al terminar dice «Imagen descargada.» |
| **Conclusión** | Barra de acento + panel claro con un titular en Saira Condensed y una línea de detalle |
| **Curva** | Número en un círculo blanco sobre el mapa, como en la transmisión |
| **Selector de sesión** | Bloque oscuro con 4 campos (año, Gran Premio, sesión, piloto; en telemetría el campo de piloto pide dos, y en gomas el piloto se elige desde la estrategia) sin botón: el análisis se pide al elegir el piloto, y la elección queda en la URL (con el límite de 10 análisis por minuto y la caché, cambiar de piloto no cuesta). Por ahora son los `<select>` del navegador; las listas propias con búsqueda de Gran Premio quedan para después |
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
- Dispersión de tiempo de vuelta contra edad de la goma de los pilotos elegidos (clic en su fila), hasta 3 a la vez, con una recta por stint. **Un panel por piloto**, apilados y con la misma escala de tiempo y de edad, titulado con su código y la barra del color de su equipo: en una sola gráfica, tres pilotos con las mismas gomas se confunden (las formas de punto no bastaban). El color es siempre el compuesto. En pantallas angostas los paneles se desplazan juntos en horizontal para que los textos se lean.
- Si no se puede medir la degradación (la mitad o más de los stints no se gasta, o la diferencia entre compuestos es mínima), la conclusión pasa a un aviso con barra amarilla y la nota de limitaciones se abre sola.
- Interruptor de combustible, conclusión, tabla de degradación por stint y por compuesto, y nota de limitaciones.

### Telemetría
- Los dos pilotos como en la tele, con la diferencia en el medio.
- Segmentos (mejor vuelta / Q1 / Q2 / Q3, o SQ1 / SQ2 / SQ3), solo en clasificaciones.
- Trazas apiladas con eje compartido: velocidad, acelerador, freno (un carril por piloto) y delta, en un solo SVG. Un cursor recorre la vuelta en todas a la vez: se mueve con el mouse, tocando, o con un deslizador con teclado que lo anuncia a los lectores de pantalla. Encima, una tabla con los valores de los dos pilotos en ese punto; en el móvil el deslizador es el control principal, porque arrastrar sobre la gráfica la desplaza. Con el mouse, además, un tooltip pegado al puntero repite esos valores (distancia, velocidad y acelerador de cada piloto, si frena y la diferencia) para no tener que mirar la tabla de arriba; pasa al otro lado del puntero cerca de los bordes derecho e inferior, no aparece con el tacto ni con el teclado, y está oculto a los lectores de pantalla porque el deslizador y la tabla ya dicen lo mismo. Encima de las gráficas, «Acercar un tramo»: dos deslizadores («Desde» y «Hasta», en metros desde la meta), un botón «Toda la vuelta» y una línea que dice el tramo mostrado. Con el mouse también se puede arrastrar sobre las gráficas: una banda morada marca el tramo y al soltar se acerca; un clic sin arrastrar solo mueve el cursor. Al acercar, el eje de la distancia y las líneas, los frenos y el delta se recortan al tramo (mínimo 100 m); las escalas verticales no cambian, para que los valores sigan siendo comparables, y el cursor se queda dentro del tramo. El zoom es temporal: no va en la URL y se deshace al cambiar la comparación.
- **Colores de los pilotos:** el A (la referencia) es morado `#B65CFF` y el B naranja `#FF8A3D`, y el empate gris `#6B7285`. No son los colores de los equipos, porque dos compañeros comparten color; cada línea se identifica además con el código del piloto.
- Mapa de los 25 minisectores pintados del color del más rápido, con la leyenda de tramos ganados y un punto que sigue al cursor de las gráficas.
- Conclusión (con aviso amarillo si las dos vueltas son casi iguales) y una nota de limitaciones que se abre sola en ese caso.

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
- Zoom por rango: los deslizadores «Desde» y «Hasta» (o el arrastre con el mouse) acercan el tramo sin animación; el texto del tramo se anuncia en una región `status`.
- Clic en un piloto de la estrategia: el gráfico cambia a ese piloto.
- Cambio de segmento o de idioma: transición corta.

Herramientas: CSS para la interfaz (Framer Motion si algún día hace falta); SVG propio para todos los gráficos: mapa, minisectores y dispersión de gomas. Las barras de estrategia son HTML con CSS.

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
