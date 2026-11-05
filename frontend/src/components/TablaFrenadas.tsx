"use client";

import { useFormatter, useTranslations } from "next-intl";

import type { AnalisisCircuito } from "@/lib/api";

/** Las zonas de frenado de la vuelta, una fila por curva. */
export default function TablaFrenadas({ frenadas }: { frenadas: AnalisisCircuito["frenadas"] }) {
  const t = useTranslations("Circuito.tabla");
  const formato = useFormatter();
  const numero = (valor: number) =>
    formato.number(Math.round(valor), { useGrouping: false });

  if (frenadas.length === 0) return <p className="text-suave">{t("vacia")}</p>;

  return (
    // Las tablas anchas tienen su propio scroll; el foco permite recorrerlas con el teclado.
    <div
      className="overflow-x-auto rounded-lg bg-panel"
      tabIndex={0}
      role="region"
      aria-label={t("region")}
    >
      <table className="w-full min-w-[34rem] text-right">
        <caption className="sr-only">{t("descripcion")}</caption>
        <thead className="text-sm text-suave">
          <tr className="border-b border-linea">
            <th scope="col" className="p-3 text-left font-normal">
              {t("curva")}
            </th>
            {(["empieza", "dura", "entrada", "salida", "pierde"] as const).map((columna) => (
              <th key={columna} scope="col" className="p-3 font-normal">
                {t(columna)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="cifras">
          {frenadas.map((f) => (
            <tr key={`${f.curva}${f.letra}`} className="border-b border-linea last:border-0">
              <th scope="row" className="p-3 text-left font-titulo text-xl font-bold">
                {f.curva}
                {f.letra}
              </th>
              <td className="p-3">{numero(f.inicio_m)}</td>
              <td className="p-3">{numero(f.longitud_m)}</td>
              <td className="p-3">{f.vel_entrada}</td>
              <td className="p-3">{f.vel_salida}</td>
              <td className="p-3">{f.vel_entrada - f.vel_salida}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
