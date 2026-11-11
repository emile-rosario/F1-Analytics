"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import BotonDescargarPng from "@/components/BotonDescargarPng";
import type { AnalisisTelemetria } from "@/lib/api";
import { COLORES_PILOTO } from "@/lib/colores";
import { UMBRAL_EMPATE_S } from "@/hooks/useConclusionTelemetria";
import { nombreArchivo } from "@/lib/exportar";
import { sectorDe } from "@/lib/telemetria";

/** Si la vuelta empieza y termina a menos de esto (décimas de metro) se cierra el circuito. */
const CIERRE_DECIMAS_M = 1_000;

/**
 * El circuito pintado por minisectores: cada tramo del color del piloto que lo recorrió más
 * rápido (gris si fue un empate). Un punto blanco marca dónde está el cursor de las gráficas.
 *
 * Los datos llegan con `y` hacia arriba y ya girados como en la transmisión; el SVG tiene `y`
 * hacia abajo, así que aquí solo se invierte.
 */
export default function MapaMinisectores({
  analisis,
  indice,
  descripcion,
}: {
  analisis: AnalisisTelemetria;
  indice: number;
  descripcion: string;
}) {
  const t = useTranslations("Telemetria");
  const te = useTranslations("Exportar");
  const figura = useRef<HTMLElement>(null);
  const { canales, curvas, minisectores } = analisis;
  const codigos = { a: analisis.piloto_a.piloto.codigo, b: analisis.piloto_b.piloto.codigo };

  const todos = [
    ...canales.x.map((x, i) => ({ x, y: canales.y[i] })),
    ...curvas.map(({ x, y }) => ({ x, y })),
  ];
  const minX = Math.min(...todos.map((p) => p.x));
  const maxX = Math.max(...todos.map((p) => p.x));
  const minY = Math.min(...todos.map((p) => p.y));
  const maxY = Math.max(...todos.map((p) => p.y));
  const unidad = Math.max(maxX - minX, maxY - minY) / 100; // 1 % del lado mayor
  const margen = 6 * unidad;
  const px = (x: number) => x - minX + margen;
  const py = (y: number) => maxY - y + margen;

  const cierra =
    Math.hypot(canales.x[0] - canales.x.at(-1)!, canales.y[0] - canales.y.at(-1)!) < CIERRE_DECIMAS_M;

  // Una línea por minisector (no una por muestra): cada una repite el último punto de la
  // anterior para que no queden huecos entre tramos.
  const puntosPorSector = minisectores.map(() => [] as [number, number][]);
  canales.distancia_m.forEach((distancia, i) => {
    const sector = sectorDe(minisectores, distancia);
    const punto: [number, number] = [px(canales.x[i]), py(canales.y[i])];
    const lista = puntosPorSector[sector];
    if (lista.length === 0 && sector > 0) {
      lista.push(puntosPorSector[sector - 1].at(-1) ?? punto);
    }
    lista.push(punto);
  });
  if (cierra) puntosPorSector.at(-1)!.push([px(canales.x[0]), py(canales.y[0])]);

  const colorDe = (ganador: string) =>
    COLORES_PILOTO[ganador as keyof typeof COLORES_PILOTO] ?? COLORES_PILOTO.empate;
  const cuentas = analisis.resumen.sectores_ganados;
  const leyenda = [
    { clave: "a", color: COLORES_PILOTO.a, texto: t("mapa.ganados", { piloto: codigos.a, tramos: cuentas.a }) },
    { clave: "b", color: COLORES_PILOTO.b, texto: t("mapa.ganados", { piloto: codigos.b, tramos: cuentas.b }) },
    ...(cuentas.empate > 0
      ? [{ clave: "empate", color: COLORES_PILOTO.empate, texto: t("mapa.empate", { tramos: cuentas.empate }) }]
      : []),
  ];

  return (
    <div className="space-y-2">
      <BotonDescargarPng
        nodo={figura}
        grafico={te("graficos.minisectores")}
        archivo={nombreArchivo("tramos", analisis.sesion, codigos.a, codigos.b)}
      />
      <figure ref={figura} className="space-y-3">
        <svg
          viewBox={`0 0 ${maxX - minX + 2 * margen} ${maxY - minY + 2 * margen}`}
          role="img"
          aria-label={descripcion}
          className="max-h-[70vh] w-full rounded-lg bg-panel"
        >
          <g data-testid="tramos" fill="none" strokeWidth={1.1 * unidad} strokeLinecap="round" strokeLinejoin="round">
            {puntosPorSector.map((puntos, i) => (
              <polyline
                key={minisectores[i].sector}
                data-ganador={minisectores[i].ganador}
                points={puntos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
                stroke={colorDe(minisectores[i].ganador)}
              />
            ))}
          </g>

          <g className="font-titulo font-bold" textAnchor="middle">
            {curvas.map((c) => (
              <g key={c.etiqueta}>
                <circle cx={px(c.x)} cy={py(c.y)} r={2 * unidad} fill="var(--color-texto)" />
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

          <circle
            data-testid="punto-cursor"
            data-no-exportar
            cx={px(canales.x[indice])}
            cy={py(canales.y[indice])}
            r={2.2 * unidad}
            fill="var(--color-texto)"
            stroke="var(--color-asfalto)"
            strokeWidth={0.5 * unidad}
          />
        </svg>

        <figcaption className="space-y-2 text-sm text-suave">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label={t("mapa.leyenda")}>
            {leyenda.map(({ clave, color, texto }) => (
              <li key={clave} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-6 rounded-full" style={{ background: color }} />
                {texto}
              </li>
            ))}
          </ul>
          <p className="max-w-3xl">
            {t("mapa.ayuda", { tramos: minisectores.length, umbral: UMBRAL_EMPATE_S })}
          </p>
        </figcaption>
      </figure>
    </div>
  );
}
