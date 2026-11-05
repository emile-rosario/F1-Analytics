import { useFormatter, useTranslations } from "next-intl";

import type { AnalisisCircuito } from "@/lib/api";

/** Textos de la conclusión del circuito, armados con plantillas a partir de los datos del resumen. */
export function useConclusionCircuito(analisis: AnalisisCircuito) {
  const t = useTranslations("Circuito.conclusion");
  const formato = useFormatter();
  const { resumen, piloto } = analisis;
  const frenada = resumen.frenada_mas_fuerte;

  const titulo = frenada
    ? t("titulo", {
        curva: `${frenada.curva}${frenada.letra}`,
        entrada: frenada.vel_entrada,
        salida: frenada.vel_salida,
      })
    : t("tituloSinFrenadas");

  const detalle = t("detalle", {
    piloto: piloto.codigo,
    porcentaje: formato.number(resumen.pct_a_fondo / 100, {
      style: "percent",
      maximumFractionDigits: 0,
    }),
    maxima: resumen.vel_maxima.kmh,
    distanciaMaxima: formato.number(Math.round(resumen.vel_maxima.distancia_m), {
      useGrouping: false,
    }),
    minima: resumen.vel_minima.kmh,
  });

  return { titulo, detalle };
}
