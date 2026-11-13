/**
 * Las tarjetas para compartir (1200×630), escritas para Satori: solo flexbox y un subconjunto de
 * CSS, así que cada contenedor con varios hijos lleva `display: flex` y los colores van literales
 * (las variables de Tailwind no existen aquí). Los valores son los de `docs/design.md`.
 */

import type { AnalisisCircuito } from "@/lib/api";
import { DEGRADADO_VELOCIDAD, colorVelocidad } from "@/lib/colores";
import { geometriaMapa } from "@/lib/mapa";

export const ANCHO = 1200;
export const ALTO = 630;

export const COLORES = {
  asfalto: "#1a1c23",
  panel: "#242731",
  texto: "#f2f3f6",
  suave: "#a3a9b7",
  acento: "#b65cff",
  acentoClaro: "#d7b3ff",
  verde: "#3ddc84",
  amarillo: "#f2c14e",
} as const;

const FUENTE = "Saira Condensed";

/** Las tres barras inclinadas de la marca (mismo dibujo que `components/Logo.tsx`). */
function Barras({ alto }: { alto: number }) {
  return (
    <svg width={(alto * 30) / 24} height={alto} viewBox="0 0 30 24">
      <path d="M7 0h6l-5 24H2z" fill={COLORES.acento} />
      <path d="M16 0h6l-5 24h-6z" fill={COLORES.verde} />
      <path d="M25 0h5l-5 24h-6z" fill={COLORES.amarillo} />
    </svg>
  );
}

/** La franja de los tres colores de sector que cierra todas las tarjetas. */
function Franja() {
  return (
    <div style={{ display: "flex", width: "100%", height: 14 }}>
      <div style={{ flex: 1, background: COLORES.acento }} />
      <div style={{ flex: 1, background: COLORES.verde }} />
      <div style={{ flex: 1, background: COLORES.amarillo }} />
    </div>
  );
}

/** La tarjeta de la marca: la que sale al compartir el inicio y las páginas sin datos propios. */
export function TarjetaMarca({
  nombre,
  lema,
  descripcion,
  credito,
}: {
  nombre: string;
  lema: string;
  descripcion: string;
  credito: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: COLORES.asfalto,
        color: COLORES.texto,
        fontFamily: FUENTE,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", padding: "72px 80px 0" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Barras alto={96} />
          <div style={{ fontSize: 104, fontWeight: 800, marginLeft: 32, lineHeight: 1 }}>{nombre}</div>
        </div>
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            color: COLORES.acentoClaro,
            marginTop: 52,
            lineHeight: 1,
          }}
        >
          {lema}
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 500,
            color: COLORES.suave,
            marginTop: 28,
            maxWidth: 980,
            lineHeight: 1.3,
          }}
        >
          {descripcion}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 30, fontWeight: 500, color: COLORES.suave, padding: "0 80px 36px" }}>
          {credito}
        </div>
        <Franja />
      </div>
    </div>
  );
}

/**
 * La pista de la vuelta coloreada por velocidad, dibujada para caber en `ancho` × `alto` píxeles.
 * Satori convierte el `<svg>` en una imagen, así que aquí no valen ni texto ni variables CSS.
 */
function MapaTarjeta({ analisis, ancho, alto }: { analisis: AnalisisCircuito; ancho: number; alto: number }) {
  const g = geometriaMapa(analisis);
  const escala = Math.min(ancho / g.ancho, alto / g.alto);

  return (
    <svg width={g.ancho * escala} height={g.alto * escala} viewBox={`0 0 ${g.ancho} ${g.alto}`}>
      <g strokeWidth={1.6 * g.unidad} strokeLinecap="round" fill="none">
        {g.trazos.map(({ desde, hasta }, i) => (
          <line
            key={i}
            x1={g.px(desde.x)}
            y1={g.py(desde.y)}
            x2={g.px(hasta.x)}
            y2={g.py(hasta.y)}
            stroke={colorVelocidad(desde.velocidad, g.velMin, g.velMax)}
          />
        ))}
      </g>
    </svg>
  );
}

/** La tarjeta de la vuelta de un piloto: su mapa coloreado por velocidad y el titular de la conclusión. */
export function TarjetaCircuito({
  marca,
  contexto,
  analisis,
  tiempo,
  vuelta,
  titulo,
  leyendaMinima,
  leyendaMaxima,
  credito,
}: {
  marca: string;
  /** «Gran Premio · sesión · año»; vacío si no se pudo averiguar. */
  contexto: string;
  analisis: AnalisisCircuito;
  tiempo: string;
  vuelta: string;
  titulo: string;
  leyendaMinima: string;
  leyendaMaxima: string;
  credito: string;
}) {
  const { piloto } = analisis;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: COLORES.asfalto,
        color: COLORES.texto,
        fontFamily: FUENTE,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", padding: "44px 64px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Barras alto={36} />
            <div style={{ fontSize: 38, fontWeight: 800, marginLeft: 14, lineHeight: 1 }}>{marca}</div>
          </div>
          <div style={{ fontSize: 30, fontWeight: 500, color: COLORES.suave }}>{contexto}</div>
        </div>

        <div style={{ display: "flex", marginTop: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 520, alignItems: "center" }}>
            <div style={{ display: "flex", width: 520, height: 360, alignItems: "center", justifyContent: "center" }}>
              <MapaTarjeta analisis={analisis} ancho={520} alto={360} />
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 14, fontSize: 24, fontWeight: 500, color: COLORES.suave }}>
              <div style={{ display: "flex" }}>{leyendaMinima}</div>
              <div style={{ display: "flex", width: 200, height: 12, borderRadius: 6, margin: "0 14px", background: DEGRADADO_VELOCIDAD }} />
              <div style={{ display: "flex" }}>{leyendaMaxima}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 48 }}>
            <div style={{ display: "flex", alignItems: "stretch" }}>
              <div style={{ display: "flex", width: 10, borderRadius: 5, background: piloto.color }} />
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
                <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 0.95 }}>{piloto.codigo}</div>
                <div style={{ fontSize: 30, fontWeight: 500, color: COLORES.suave }}>{piloto.equipo}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 22 }}>
              <div style={{ fontSize: 54, fontWeight: 800 }}>{tiempo}</div>
              <div style={{ fontSize: 28, fontWeight: 500, color: COLORES.suave, marginLeft: 16 }}>{vuelta}</div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 42,
                fontWeight: 800,
                color: COLORES.acentoClaro,
                marginTop: 26,
                lineHeight: 1.1,
              }}
            >
              {titulo}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 26, fontWeight: 500, color: COLORES.suave, padding: "0 64px 26px" }}>{credito}</div>
        <Franja />
      </div>
    </div>
  );
}
