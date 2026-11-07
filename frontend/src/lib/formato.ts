/**
 * Tiempo de vuelta como `1:19.327` en inglés y `1:19,327` en español.
 * Los milisegundos (o la fracción de `decimales`) se redondean al más cercano.
 */
export function formatearTiempoVuelta(segundos: number, idioma: string, decimales = 3): string {
  const factor = 10 ** decimales;
  const total = Math.round(segundos * factor);
  const minutos = Math.floor(total / (60 * factor));
  const resto = total - minutos * 60 * factor;
  const fraccion = new Intl.NumberFormat(idioma, {
    minimumIntegerDigits: 2,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: false,
  }).format(resto / factor);
  return `${minutos}:${fraccion}`;
}
