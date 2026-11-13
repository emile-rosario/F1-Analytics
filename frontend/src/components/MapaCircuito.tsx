import { useTranslations } from "next-intl";
import { useRef } from "react";

import BotonDescargarPng from "@/components/BotonDescargarPng";
import type { AnalisisCircuito } from "@/lib/api";
import { COLORES_MARCHA, DEGRADADO_VELOCIDAD, colorVelocidad } from "@/lib/colores";
import { nombreArchivo } from "@/lib/exportar";
import { geometriaMapa } from "@/lib/mapa";

export type ModoMapa = "velocidad" | "marchas";

/** Segundos que tarda en dibujarse todo el trazado. */
const DURACION_DIBUJO_S = 1.6;

/**
 * Mapa de la vuelta en SVG: la pista coloreada por velocidad o por marcha, las curvas
 * numeradas y un rombo donde empieza cada frenada.
 *
 * La geometría (cuadro, escala y trazos) sale de `lib/mapa.ts`, compartida con la tarjeta
 * para compartir.
 */
export default function MapaCircuito({
  analisis,
  modo,
  descripcion,
}: {
  analisis: AnalisisCircuito;
  modo: ModoMapa;
  descripcion: string;
}) {
  const t = useTranslations("Circuito");
  const te = useTranslations("Exportar");
  const figura = useRef<HTMLElement>(null);
  const { puntos, curvas, frenadas } = analisis;

  const { ancho, alto, unidad, px, py, velMin, velMax, trazos } = geometriaMapa(analisis);
  const marchasUsadas = [...new Set(puntos.map((p) => p.marcha))].sort((a, b) => a - b);

  const retraso = DURACION_DIBUJO_S / trazos.length;
  const grosor = 1.1 * unidad;
  const radioCurva = 2 * unidad;

  return (
    <div className="space-y-2">
      <BotonDescargarPng
        nodo={figura}
        grafico={te("graficos.circuito")}
        archivo={nombreArchivo("circuito", analisis.sesion, analisis.piloto.codigo, modo)}
      />
      <figure ref={figura} className="space-y-3">
        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          role="img"
          aria-label={descripcion}
          className="max-h-[70vh] w-full rounded-lg bg-panel"
        >
          <g strokeWidth={grosor} strokeLinecap="round" fill="none">
            {trazos.map(({ desde, hasta }, i) => (
              <line
                key={i}
                className="tramo"
                style={{ animationDelay: `${(i * retraso).toFixed(3)}s` }}
                x1={px(desde.x)}
                y1={py(desde.y)}
                x2={px(hasta.x)}
                y2={py(hasta.y)}
                stroke={
                  modo === "velocidad"
                    ? colorVelocidad(desde.velocidad, velMin, velMax)
                    : (COLORES_MARCHA[desde.marcha] ?? "#ffffff")
                }
              />
            ))}
          </g>

          <g data-testid="frenadas">
            {frenadas.map((f) => {
              const r = 1.1 * unidad;
              const cx = px(f.x_inicio);
              const cy = py(f.y_inicio);
              return (
                <path
                  key={`${f.curva}${f.letra}`}
                  d={`M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`}
                  fill="var(--color-acento-claro)"
                  stroke="var(--color-asfalto)"
                  strokeWidth={0.25 * unidad}
                />
              );
            })}
          </g>

          <g data-testid="curvas" className="font-titulo font-bold" textAnchor="middle">
            {curvas.map((c) => (
              <g key={c.etiqueta}>
                <circle cx={px(c.x)} cy={py(c.y)} r={radioCurva} fill="var(--color-texto)" />
                <text
                  x={px(c.x)}
                  y={py(c.y)}
                  dominantBaseline="central"
                  fontSize={(c.etiqueta.length > 2 ? 1.5 : 2) * unidad}
                  fill="var(--color-asfalto)"
                >
                  {c.etiqueta}
                </text>
              </g>
            ))}
          </g>
        </svg>

        <figcaption className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-suave">
          {modo === "velocidad" ? (
            <div className="flex items-center gap-3">
              <span className="cifras">{velMin}</span>
              <span
                aria-hidden="true"
                className="h-3 w-40 rounded-full"
                style={{ background: DEGRADADO_VELOCIDAD }}
              />
              <span className="cifras">{t("leyendaVelocidadMaxima", { velocidad: velMax })}</span>
            </div>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label={t("leyendaMarchas")}>
              {marchasUsadas.map((marcha) => (
                <li key={marcha} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-3 w-6 rounded-full"
                    style={{ background: COLORES_MARCHA[marcha] }}
                  />
                  {t("marcha", { marcha })}
                </li>
              ))}
            </ul>
          )}
          {frenadas.length > 0 && (
            <span className="flex items-center gap-2">
              <svg aria-hidden="true" viewBox="-6 -6 12 12" className="h-3 w-3">
                <path
                  d="M0-5L5 0L0 5L-5 0Z"
                  fill="var(--color-acento-claro)"
                  stroke="var(--color-asfalto)"
                />
              </svg>
              {t("leyendaFrenada")}
            </span>
          )}
        </figcaption>
      </figure>
    </div>
  );
}
