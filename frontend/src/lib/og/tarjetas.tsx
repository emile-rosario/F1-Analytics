/**
 * Las tarjetas para compartir (1200×630), escritas para Satori: solo flexbox y un subconjunto de
 * CSS, así que cada contenedor con varios hijos lleva `display: flex` y los colores van literales
 * (las variables de Tailwind no existen aquí). Los valores son los de `docs/design.md`.
 */

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
