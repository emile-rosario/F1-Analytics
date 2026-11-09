import { useTranslations } from "next-intl";

import type { AnalisisTelemetria } from "@/lib/api";

/** Diferencia (s) por debajo de la cual dos vueltas se cuentan como iguales; la misma de la API. */
export const UMBRAL_EMPATE_S = 0.01;

export type TipoConclusionTelemetria = "normal" | "empate";

/**
 * Textos de la conclusión de telemetría, armados con plantillas a partir del resumen. La API
 * manda solo datos: aquí se elige el idioma y se decide qué decir.
 *
 * Si la diferencia es menor de lo que la telemetría permite distinguir, lo dice en lugar de
 * nombrar a un ganador.
 */
export function useConclusionTelemetria(analisis: AnalisisTelemetria) {
  const t = useTranslations("Telemetria.conclusion");
  const { resumen, minisectores } = analisis;
  const codigos = {
    a: analisis.piloto_a.piloto.codigo,
    b: analisis.piloto_b.piloto.codigo,
  };

  if (resumen.ganador === "empate") {
    return {
      tipo: "empate" as TipoConclusionTelemetria,
      titulo: t("tituloEmpate"),
      detalle: t("detalleEmpate", {
        diferencia: Math.abs(resumen.delta_final_s),
        umbral: UMBRAL_EMPATE_S,
      }),
      extra: null,
    };
  }

  const ganador = resumen.ganador;
  const perdedor = ganador === "a" ? "b" : "a";
  const ventajas = (["a", "b"] as const)
    .map((letra) => {
      const ventaja = resumen.mayor_ventaja[letra];
      return ventaja
        ? t("ventaja", {
            piloto: codigos[letra],
            inicio: Math.round(ventaja.inicio_m),
            fin: Math.round(ventaja.fin_m),
            ventaja: ventaja.ventaja_s,
          })
        : null;
    })
    .filter(Boolean)
    .join(" ");

  return {
    tipo: "normal" as TipoConclusionTelemetria,
    titulo: t("titulo", {
      ganador: codigos[ganador],
      perdedor: codigos[perdedor],
      diferencia: Math.abs(resumen.delta_final_s),
    }),
    detalle: t("detalle", {
      ganador: codigos[ganador],
      perdedor: codigos[perdedor],
      ganados: resumen.sectores_ganados[ganador],
      otros: resumen.sectores_ganados[perdedor],
      empates: resumen.sectores_ganados.empate,
      total: minisectores.length,
    }),
    extra: ventajas || null,
  };
}
