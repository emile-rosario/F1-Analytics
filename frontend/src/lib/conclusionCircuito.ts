import type { AnalisisCircuito } from "@/lib/api";

/** Lo mínimo que hace falta de un traductor de next-intl, sea el de un componente o el del servidor. */
export type Traductor = (clave: string, valores?: Record<string, string | number>) => string;
export type Formateador = {
  number: (
    valor: number,
    opciones?: { style?: "percent"; maximumFractionDigits?: number; useGrouping?: boolean },
  ) => string;
};

/**
 * Textos de la conclusión del circuito, armados con plantillas a partir de los datos del resumen.
 * `t` es el traductor del espacio `Circuito.conclusion`. Es una función pura para poder usarla
 * tanto en la página (`useConclusionCircuito`) como en la tarjeta para compartir, que se dibuja
 * en el servidor.
 */
export function conclusionCircuito(analisis: AnalisisCircuito, t: Traductor, formato: Formateador) {
  const { resumen, piloto } = analisis;
  const frenada = resumen.frenada_mas_fuerte;

  const titulo = frenada
    ? t("titulo", {
        curva: `${frenada.curva}${frenada.letra}`,
        entrada: frenada.vel_entrada,
        salida: frenada.vel_salida,
      })
    : // Sin curvas numeradas (circuito nuevo) no es que no se frenara: no se puede medir.
      t(analisis.curvas.length === 0 ? "tituloSinCurvas" : "tituloSinFrenadas");

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
