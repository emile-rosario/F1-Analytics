/**
 * Tiempo de vuelta como `1:19.327` en inglés y `1:19,327` en español.
 * Los milisegundos se redondean al más cercano.
 */
export function formatearTiempoVuelta(segundos: number, idioma: string): string {
  const totalMs = Math.round(segundos * 1000);
  const minutos = Math.floor(totalMs / 60_000);
  const resto = totalMs - minutos * 60_000;
  const decimales = new Intl.NumberFormat(idioma, {
    minimumIntegerDigits: 2,
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(resto / 1000);
  return `${minutos}:${decimales}`;
}
