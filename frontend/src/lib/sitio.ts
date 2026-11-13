/** La web en producción; se usa si Vercel no dice cuál es la dirección del despliegue. */
export const URL_PRODUCCION = "https://f1-analytics-eta.vercel.app";

/**
 * La dirección pública de la web, para las etiquetas que piden una URL completa (`og:image`).
 *
 * En orden: `NEXT_PUBLIC_URL_SITIO` si se define (por ejemplo con un dominio propio); la dirección
 * del despliegue en las previsualizaciones de Vercel, para poder probar la tarjeta antes de
 * mergear; la de producción al construir para producción; y `localhost` en desarrollo.
 */
export function urlDelSitio(entorno: NodeJS.ProcessEnv = process.env): URL {
  if (entorno.NEXT_PUBLIC_URL_SITIO) return new URL(entorno.NEXT_PUBLIC_URL_SITIO);
  if (entorno.VERCEL_ENV === "preview" && entorno.VERCEL_URL) return new URL(`https://${entorno.VERCEL_URL}`);
  if (entorno.NODE_ENV === "production") return new URL(URL_PRODUCCION);
  return new URL("http://localhost:3000");
}
