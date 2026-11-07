import { useTranslations } from "next-intl";

import type { AnalisisGomas } from "@/lib/api";
import { claveCompuesto } from "@/lib/colores";
import { sinDegradacionMedible } from "@/lib/gomas";

/** Diferencia (s por vuelta) por debajo de la cual dos compuestos «se gastaron igual». */
export const DIFERENCIA_MINIMA_S = 0.02;

export type TipoConclusion = "normal" | "unico" | "parecidas" | "sinMedida";

/**
 * Textos de la conclusión de gomas, armados con plantillas a partir del resumen.
 *
 * Solo afirma qué compuesto se gastó más cuando los datos lo permiten: si la mayoría de los
 * stints no muestra desgaste, o la diferencia es mínima, lo dice en lugar de inventarlo.
 */
export function useConclusionGomas(analisis: AnalisisGomas, corregir: boolean) {
  const t = useTranslations("Gomas.conclusion");
  const compuestos = useTranslations("Gomas.compuestos");
  const resumen = corregir ? analisis.resumen : analisis.resumen_sin_corregir;
  const { compuesto_mas_degradante: mas, compuesto_menos_degradante: menos } =
    resumen;
  const nombre = (compuesto: string) =>
    compuestos(`${claveCompuesto(compuesto)}.nombre`).toLowerCase();

  const datosComunes = {
    validos: resumen.n_stints_validos,
    insuficientes: resumen.n_stints_insuficientes,
  };

  let tipo: TipoConclusion;
  let titulo: string;
  let detalle: string;

  if (!mas || sinDegradacionMedible(resumen)) {
    tipo = "sinMedida";
    titulo = t("tituloSinMedida");
    detalle = t("detalleSinMedida", {
      sin: resumen.n_stints_sin_degradacion,
      validos: resumen.n_stints_validos,
    });
  } else if (!menos || menos.compuesto === mas.compuesto) {
    tipo = "unico";
    titulo = t("tituloUnico", {
      compuesto: nombre(mas.compuesto),
      pendiente: mas.pendiente_s_por_vuelta,
    });
    detalle = t("detalleUnico", datosComunes);
  } else if (
    mas.pendiente_s_por_vuelta - menos.pendiente_s_por_vuelta <
    DIFERENCIA_MINIMA_S
  ) {
    tipo = "parecidas";
    titulo = t("tituloParecidas");
    detalle = t("detalleParecidas", {
      mas: nombre(mas.compuesto),
      menos: nombre(menos.compuesto),
      diferencia: mas.pendiente_s_por_vuelta - menos.pendiente_s_por_vuelta,
      validos: resumen.n_stints_validos,
    });
  } else {
    tipo = "normal";
    titulo = t("titulo", {
      compuesto: nombre(mas.compuesto),
      pendiente: mas.pendiente_s_por_vuelta,
    });
    detalle = t("detalle", {
      menos: nombre(menos.compuesto),
      pendienteMenos: menos.pendiente_s_por_vuelta,
      ...datosComunes,
    });
  }

  const largo = resumen.stint_mas_largo;
  const piloto = largo
    ? analisis.estrategias.find((e) => e.piloto.numero === largo.piloto)?.piloto
        .codigo
    : undefined;
  const extra =
    tipo === "sinMedida"
      ? null
      : [
          t("paradas", { paradas: resumen.paradas_por_piloto }),
          largo && piloto
            ? t("masLargo", {
                piloto,
                compuesto: nombre(largo.compuesto),
                vueltas: largo.vueltas,
              })
            : null,
        ]
          .filter(Boolean)
          .join(" ");

  return { tipo, titulo, detalle, extra };
}
