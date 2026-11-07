"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { AnalisisGomas } from "@/lib/api";
import { claveCompuesto, colorCompuesto } from "@/lib/colores";

function Region({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: ReactNode;
}) {
  // Las tablas anchas tienen su propio scroll; el foco permite recorrerlas con el teclado.
  return (
    <div
      className="overflow-x-auto rounded-lg bg-panel"
      tabIndex={0}
      role="region"
      aria-label={etiqueta}
    >
      {children}
    </div>
  );
}

function Compuesto({ compuesto }: { compuesto: string }) {
  const t = useTranslations("Gomas.compuestos");
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3 w-3 rounded-full"
        style={{ background: colorCompuesto(compuesto) }}
      />
      {t(`${claveCompuesto(compuesto)}.nombre`)}
    </span>
  );
}

/** Degradación de cada stint de los pilotos elegidos, con la recta de la gráfica. */
export function TablaStints({
  analisis,
  elegidos,
  corregir,
}: {
  analisis: AnalisisGomas;
  elegidos: number[];
  corregir: boolean;
}) {
  const t = useTranslations("Gomas.tablas.stints");
  const formato = useFormatter();
  const decimales = (n: number, d: number) =>
    formato.number(n, { minimumFractionDigits: d, maximumFractionDigits: d });

  const codigos = new Map(
    analisis.estrategias.map((e) => [e.piloto.numero, e.piloto.codigo]),
  );
  const filas = elegidos.flatMap((piloto) =>
    analisis.degradacion.filter((d) => d.piloto === piloto),
  );

  if (filas.length === 0) return <p className="text-suave">{t("vacia")}</p>;

  return (
    <Region etiqueta={t("region")}>
      <table className="w-full min-w-[40rem] text-right">
        <caption className="sr-only">{t("descripcion")}</caption>
        <thead className="text-sm text-suave">
          <tr className="border-b border-linea">
            <th scope="col" className="p-3 text-left font-normal">
              {t("piloto")}
            </th>
            <th scope="col" className="p-3 text-right font-normal">
              {t("stint")}
            </th>
            <th scope="col" className="p-3 text-left font-normal">
              {t("compuesto")}
            </th>
            {(["vueltas", "edad", "pierde", "r2"] as const).map((columna) => (
              <th key={columna} scope="col" className="p-3 font-normal">
                {t(columna)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="cifras">
          {filas.map((d) => {
            const ajuste = corregir ? d.corregido : d.sin_corregir;
            const pendiente = ajuste?.pendiente_s_por_vuelta ?? null;
            return (
              <tr
                key={`${d.piloto}-${d.stint}`}
                className="border-b border-linea last:border-0"
              >
                <th
                  scope="row"
                  className="p-3 text-left font-titulo text-xl font-bold"
                >
                  {codigos.get(d.piloto) ?? d.piloto}
                </th>
                <td className="p-3">{d.stint}</td>
                <td className="p-3 text-left">
                  <Compuesto compuesto={d.compuesto} />
                </td>
                <td className="p-3">{d.n_vueltas}</td>
                <td className="p-3">
                  {d.edad_inicial}–{d.edad_final}
                </td>
                {pendiente === null ? (
                  <td colSpan={2} className="p-3 text-suave">
                    {t("insuficiente")}
                  </td>
                ) : (
                  <>
                    <td className="p-3">
                      {decimales(pendiente, 3)}
                      {pendiente <= 0 && (
                        <span className="ml-2 text-sm text-suave">
                          {t("sinDegradacion")}
                        </span>
                      )}
                    </td>
                    <td className="p-3">{decimales(ajuste?.r2 ?? 0, 2)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Region>
  );
}

/** Degradación promedio por compuesto de todos los pilotos, con y sin corrección de combustible. */
export function TablaCompuestos({
  compuestos,
}: {
  compuestos: AnalisisGomas["compuestos"];
}) {
  const t = useTranslations("Gomas.tablas.compuestos");
  const formato = useFormatter();
  const decimales = (n: number) =>
    formato.number(n, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  if (compuestos.length === 0)
    return <p className="text-suave">{t("vacia")}</p>;

  return (
    <Region etiqueta={t("region")}>
      <table className="w-full min-w-[34rem] text-right">
        <caption className="sr-only">{t("descripcion")}</caption>
        <thead className="text-sm text-suave">
          <tr className="border-b border-linea">
            <th scope="col" className="p-3 text-left font-normal">
              {t("compuesto")}
            </th>
            {(["stints", "vueltas", "corregida", "sinCorregir"] as const).map(
              (columna) => (
                <th key={columna} scope="col" className="p-3 font-normal">
                  {t(columna)}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="cifras">
          {compuestos.map((c) => (
            <tr
              key={c.compuesto}
              className="border-b border-linea last:border-0"
            >
              <th
                scope="row"
                className="p-3 text-left font-titulo text-xl font-bold"
              >
                <Compuesto compuesto={c.compuesto} />
              </th>
              <td className="p-3">{c.n_stints}</td>
              <td className="p-3">{c.n_vueltas}</td>
              <td className="p-3">{decimales(c.pendiente_s_por_vuelta)}</td>
              <td className="p-3">
                {decimales(c.pendiente_sin_corregir_s_por_vuelta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Region>
  );
}
