"use client";

import { useLocale, useTranslations } from "next-intl";

import type { AnalisisGomas } from "@/lib/api";
import { colorCompuesto } from "@/lib/colores";
import { formatearTiempoVuelta } from "@/lib/formato";
import { marcasEje } from "@/lib/gomas";

const ANCHO = 800;
const ALTO = 420;
const MARGEN = { izquierda: 84, derecha: 20, arriba: 16, abajo: 56 };
const RADIO = 5;

/** Un símbolo por piloto (el color queda para el compuesto), hasta 3. */
function Marca({ forma }: { forma: number }) {
  const estilo = { stroke: "var(--color-asfalto)", strokeWidth: 1 };
  if (forma === 0) return <circle r={RADIO} {...estilo} />;
  if (forma === 1)
    return (
      <rect
        x={-RADIO}
        y={-RADIO}
        width={2 * RADIO}
        height={2 * RADIO}
        {...estilo}
      />
    );
  return (
    <path
      d={`M0 ${-RADIO - 1}L${RADIO + 1} ${RADIO}L${-RADIO - 1} ${RADIO}Z`}
      {...estilo}
    />
  );
}

/** El mismo símbolo, chico, para la leyenda. */
export function MarcaLeyenda({ forma }: { forma: number }) {
  return (
    <svg aria-hidden="true" viewBox="-8 -8 16 16" className="h-4 w-4">
      <g fill="var(--color-texto)">
        <Marca forma={forma} />
      </g>
    </svg>
  );
}

/**
 * Dispersión de tiempo de vuelta contra edad de la goma, en SVG propio: un punto por vuelta
 * limpia y una recta por stint (la misma que da la pendiente de las tablas).
 *
 * Los puntos son `<g>` con `transform`, así el interruptor de combustible los **mueve** a su
 * nuevo lugar con una transición en vez de redibujarlos.
 */
export default function DispersionGomas({
  analisis,
  elegidos,
  corregir,
  descripcion,
}: {
  analisis: AnalisisGomas;
  elegidos: number[];
  corregir: boolean;
  descripcion: string;
}) {
  const t = useTranslations("Gomas.dispersion");
  const idioma = useLocale();

  const vueltas = analisis.vueltas.filter((v) => elegidos.includes(v.piloto));
  const tiempo = (v: (typeof vueltas)[number]) =>
    corregir ? v.tiempo_corregido_s : v.tiempo_s;
  const rectas = analisis.degradacion
    .filter((d) => elegidos.includes(d.piloto))
    .flatMap((d) => {
      const ajuste = corregir ? d.corregido : d.sin_corregir;
      return ajuste ? [{ d, ajuste }] : [];
    });

  if (vueltas.length === 0)
    return <p className="text-suave">{t("sinVueltas")}</p>;

  const tiempos = [
    ...vueltas.map(tiempo),
    ...rectas.flatMap(({ d, ajuste }) => [
      ajuste.intercepto + ajuste.pendiente_s_por_vuelta * d.edad_inicial,
      ajuste.intercepto + ajuste.pendiente_s_por_vuelta * d.edad_final,
    ]),
  ];
  const edadMax = Math.max(...vueltas.map((v) => v.edad_goma));
  const relleno = Math.max(
    (Math.max(...tiempos) - Math.min(...tiempos)) * 0.08,
    0.1,
  );
  const yMin = Math.min(...tiempos) - relleno;
  const yMax = Math.max(...tiempos) + relleno;

  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;
  const px = (edad: number) =>
    MARGEN.izquierda + (edad / Math.max(edadMax, 1)) * anchoUtil;
  const py = (s: number) =>
    MARGEN.arriba + (1 - (s - yMin) / (yMax - yMin)) * altoUtil;

  const marcasX = marcasEje(0, edadMax, 6);
  const marcasY = marcasEje(yMin, yMax, 5);

  return (
    // En pantallas angostas la gráfica conserva un ancho mínimo y se desplaza, para que los textos se lean.
    <div
      className="overflow-x-auto rounded-lg bg-panel"
      tabIndex={0}
      role="region"
      aria-label={t("region")}
    >
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label={descripcion}
        className="w-full min-w-[40rem]"
      >
        <g className="text-suave" fill="currentColor" fontSize={15}>
          {marcasY.map((m) => (
            <g key={m}>
              <line
                x1={MARGEN.izquierda}
                x2={ANCHO - MARGEN.derecha}
                y1={py(m)}
                y2={py(m)}
                stroke="var(--color-linea)"
              />
              <text
                x={MARGEN.izquierda - 10}
                y={py(m)}
                textAnchor="end"
                dominantBaseline="central"
              >
                {formatearTiempoVuelta(m, idioma, 1)}
              </text>
            </g>
          ))}
          {marcasX.map((m) => (
            <text
              key={m}
              x={px(m)}
              y={ALTO - MARGEN.abajo + 20}
              textAnchor="middle"
            >
              {m}
            </text>
          ))}
          <text
            x={MARGEN.izquierda + anchoUtil / 2}
            y={ALTO - 10}
            textAnchor="middle"
            fontSize={16}
          >
            {t("ejeX")}
          </text>
          <text
            transform={`translate(16 ${MARGEN.arriba + altoUtil / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={16}
          >
            {t("ejeY")}
          </text>
        </g>

        {/* Las rectas llevan la corrección en la clave: al cambiarla se vuelven a dibujar. */}
        <g
          key={corregir ? "con" : "sin"}
          data-testid="rectas"
          strokeWidth={2.5}
          strokeLinecap="round"
        >
          {rectas.map(({ d, ajuste }) => (
            <line
              key={`${d.piloto}-${d.stint}`}
              className="recta-goma"
              x1={px(d.edad_inicial)}
              x2={px(d.edad_final)}
              y1={py(
                ajuste.intercepto +
                  ajuste.pendiente_s_por_vuelta * d.edad_inicial,
              )}
              y2={py(
                ajuste.intercepto +
                  ajuste.pendiente_s_por_vuelta * d.edad_final,
              )}
              stroke={colorCompuesto(d.compuesto)}
            />
          ))}
        </g>

        <g data-testid="puntos">
          {vueltas.map((v, i) => (
            <g
              key={`${v.piloto}-${v.vuelta}`}
              className="punto-goma"
              data-piloto={v.piloto}
              style={{
                transform: `translate(${px(v.edad_goma)}px, ${py(tiempo(v))}px)`,
                animationDelay: `${Math.min(i * 0.012, 0.8).toFixed(3)}s`,
                fill: colorCompuesto(v.compuesto),
              }}
            >
              <Marca forma={Math.max(0, elegidos.indexOf(v.piloto))} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
