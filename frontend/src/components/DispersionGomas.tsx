"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";

import BotonDescargarPng from "@/components/BotonDescargarPng";
import type { AnalisisGomas } from "@/lib/api";
import { claveCompuesto, colorCompuesto } from "@/lib/colores";
import { nombreArchivo } from "@/lib/exportar";
import { formatearTiempoVuelta } from "@/lib/formato";
import { marcasEje } from "@/lib/gomas";

const ANCHO = 800;
const RADIO = 5;
const MARGEN = { izquierda: 84, derecha: 20 };
// Con un solo piloto la gráfica es alta, como siempre; con varios cada panel es más bajo y
// lleva el código del piloto arriba. Todos usan la misma escala, así se comparan a simple vista.
const ALTO_UTIL_SOLO = 348;
const ALTO_UTIL_VARIOS = 190;
const ARRIBA_SOLO = 16;
const ARRIBA_VARIOS = 34;
// Debajo de cada panel van los números de la edad; el título del eje, solo en el último.
const ABAJO_PANEL = 26;
const ABAJO_ULTIMO = 56;

type Vuelta = AnalisisGomas["vueltas"][number];
type Degradacion = AnalisisGomas["degradacion"][number];

/**
 * Dispersión de tiempo de vuelta contra edad de la goma, en SVG propio: un punto por vuelta
 * limpia y una recta por stint (la misma que da la pendiente de las tablas).
 *
 * Cada piloto elegido tiene su propio panel, con el mismo rango de tiempo y de edad en todos:
 * en una sola gráfica, tres pilotos con las mismas gomas se confunden. El color es siempre el
 * compuesto.
 *
 * Los puntos son `<g>` con `transform`, así el interruptor de combustible los **mueve** a su
 * nuevo lugar con una transición en vez de redibujarlos.
 */
export default function DispersionGomas({
  analisis,
  elegidos,
  corregir,
  compuestos,
  descripcion,
}: {
  analisis: AnalisisGomas;
  elegidos: number[];
  corregir: boolean;
  /** Los compuestos que se usaron en la carrera, para la leyenda de colores. */
  compuestos: string[];
  descripcion: string;
}) {
  const t = useTranslations("Gomas.dispersion");
  const tc = useTranslations("Gomas.compuestos");
  const te = useTranslations("Exportar");
  const paneles = useRef<HTMLDivElement>(null);
  const idioma = useLocale();

  const tiempo = (v: Vuelta) => (corregir ? v.tiempo_corregido_s : v.tiempo_s);
  const pilotos = elegidos.map((numero) => {
    const datos = analisis.estrategias.find(
      (e) => e.piloto.numero === numero,
    )?.piloto;
    const rectas = analisis.degradacion
      .filter((d) => d.piloto === numero)
      .flatMap((d) => {
        const ajuste = corregir ? d.corregido : d.sin_corregir;
        return ajuste ? [{ d, ajuste }] : [];
      });
    return {
      numero,
      codigo: datos?.codigo ?? String(numero),
      color: datos?.color,
      vueltas: analisis.vueltas.filter((v) => v.piloto === numero),
      rectas,
    };
  });
  const conVueltas = pilotos.filter((p) => p.vueltas.length > 0);
  const sinVueltas = pilotos.filter((p) => p.vueltas.length === 0);

  if (conVueltas.length === 0)
    return <p className="text-suave">{t("sinVueltas")}</p>;

  // Una escala para todos los paneles.
  const todas = conVueltas.flatMap((p) => p.vueltas);
  const tiempos = [
    ...todas.map(tiempo),
    ...conVueltas.flatMap((p) =>
      p.rectas.flatMap(({ d, ajuste }) => [
        valorRecta(ajuste, d.edad_inicial),
        valorRecta(ajuste, d.edad_final),
      ]),
    ),
  ];
  const edadMax = Math.max(...todas.map((v) => v.edad_goma));
  const relleno = Math.max(
    (Math.max(...tiempos) - Math.min(...tiempos)) * 0.08,
    0.1,
  );
  const yMin = Math.min(...tiempos) - relleno;
  const yMax = Math.max(...tiempos) + relleno;
  const marcasX = marcasEje(0, edadMax, 6);
  const marcasY = marcasEje(yMin, yMax, 5);

  const varios = conVueltas.length > 1;
  const altoUtil = varios ? ALTO_UTIL_VARIOS : ALTO_UTIL_SOLO;
  const arriba = varios ? ARRIBA_VARIOS : ARRIBA_SOLO;
  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const px = (edad: number) =>
    MARGEN.izquierda + (edad / Math.max(edadMax, 1)) * anchoUtil;
  const py = (s: number) =>
    arriba + (1 - (s - yMin) / (yMax - yMin)) * altoUtil;

  return (
    // En pantallas angostas los paneles conservan un ancho mínimo y se desplazan juntos, para que
    // los textos se lean.
    <div className="space-y-2">
      <BotonDescargarPng
        nodo={paneles}
        grafico={te("graficos.dispersion")}
        archivo={nombreArchivo("dispersion", analisis.sesion, corregir ? "corregido" : "sin-corregir")}
      />
    <div
      className="overflow-x-auto rounded-lg bg-panel"
      tabIndex={0}
      role="region"
      aria-label={t("region")}
    >
      {/* Lo que se exporta: los paneles y la leyenda de colores. */}
      <div ref={paneles} className="min-w-[40rem]">
      <div
        role="group"
        aria-label={descripcion}
        data-testid="puntos"
        className="flex flex-col"
      >
        {conVueltas.map((p, indice) => {
          const ultimo = indice === conVueltas.length - 1;
          const abajo = ultimo ? ABAJO_ULTIMO : ABAJO_PANEL;
          const alto = arriba + altoUtil + abajo;
          return (
            <svg
              key={p.numero}
              viewBox={`0 0 ${ANCHO} ${alto}`}
              role="img"
              aria-label={t("descripcionPanel", { piloto: p.codigo })}
              className="w-full"
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
                    y={arriba + altoUtil + 20}
                    textAnchor="middle"
                  >
                    {m}
                  </text>
                ))}
                {ultimo && (
                  <text
                    x={MARGEN.izquierda + anchoUtil / 2}
                    y={alto - 10}
                    textAnchor="middle"
                    fontSize={16}
                  >
                    {t("ejeX")}
                  </text>
                )}
                <text
                  transform={`translate(16 ${arriba + altoUtil / 2}) rotate(-90)`}
                  textAnchor="middle"
                  fontSize={16}
                >
                  {t("ejeY")}
                </text>
              </g>

              {varios && (
                <g>
                  {/* La barra del color del equipo, como junto al código en la estrategia. */}
                  {p.color && (
                    <rect
                      x={MARGEN.izquierda}
                      y={6}
                      width={4}
                      height={20}
                      rx={2}
                      fill={p.color}
                    />
                  )}
                  <text
                    x={MARGEN.izquierda + (p.color ? 14 : 0)}
                    y={22}
                    fill="var(--color-texto)"
                    fontSize={20}
                    fontWeight={700}
                  >
                    {p.codigo}
                  </text>
                </g>
              )}

              {/* Las rectas llevan la corrección en la clave: al cambiarla se vuelven a dibujar. */}
              <g
                key={corregir ? "con" : "sin"}
                data-testid="rectas"
                strokeWidth={2.5}
                strokeLinecap="round"
              >
                {p.rectas.map(({ d, ajuste }) => (
                  <line
                    key={`${d.piloto}-${d.stint}`}
                    className="recta-goma"
                    x1={px(d.edad_inicial)}
                    x2={px(d.edad_final)}
                    y1={py(valorRecta(ajuste, d.edad_inicial))}
                    y2={py(valorRecta(ajuste, d.edad_final))}
                    stroke={colorCompuesto(d.compuesto)}
                  />
                ))}
              </g>

              <g>
                {p.vueltas.map((v, i) => (
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
                    <circle
                      r={RADIO}
                      stroke="var(--color-asfalto)"
                      strokeWidth={1}
                    />
                  </g>
                ))}
              </g>
            </svg>
          );
        })}
        {sinVueltas.map((p) => (
          <p key={p.numero} className="px-4 pb-3 text-sm text-suave">
            {t("sinVueltasPiloto", { piloto: p.codigo })}
          </p>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-sm text-suave">
        {compuestos.map((c) => (
          <li key={c} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full"
              style={{ background: colorCompuesto(c) }}
            />
            {tc(`${claveCompuesto(c)}.nombre`)}
          </li>
        ))}
      </ul>
      </div>
    </div>
    </div>
  );
}

type Ajuste = NonNullable<Degradacion["corregido"]>;

/** Tiempo (s) que da la recta de un stint a una edad de la goma. */
function valorRecta(ajuste: Ajuste, edad: number): number {
  return ajuste.intercepto + ajuste.pendiente_s_por_vuelta * edad;
}
