import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ALTO, ANCHO } from "@/lib/og/tarjetas";

/** El `locale` de Open Graph de cada idioma de la web. */
const LOCALE_OG: Record<string, string> = { es: "es_ES", en: "en_US" };

/** La dirección de la imagen para compartir de una página, relativa a `metadataBase`. */
export function rutaTarjeta(idioma: string): string {
  return `/api/og?idioma=${idioma}`;
}

/**
 * Título, descripción y etiquetas para compartir (Open Graph y Twitter) de una página.
 *
 * Una página que declara su propio `openGraph` reemplaza al del layout entero, así que cada una
 * pasa por aquí en vez de repetir las etiquetas.
 */
export async function metadatos(
  locale: string,
  titulo: string,
  descripcion: string,
): Promise<Metadata> {
  const compartir = await getTranslations({ locale, namespace: "Compartir" });
  const imagen = {
    url: rutaTarjeta(locale),
    width: ANCHO,
    height: ALTO,
    alt: compartir("alt"),
  };

  return {
    title: titulo,
    description: descripcion,
    openGraph: {
      type: "website",
      siteName: "F1 Analytics",
      locale: LOCALE_OG[locale] ?? LOCALE_OG.es,
      title: titulo,
      description: descripcion,
      images: [imagen],
    },
    twitter: { card: "summary_large_image", title: titulo, description: descripcion, images: [imagen.url] },
  };
}

/** Lo mismo para una página con su propio título y subtítulo en `messages` (`Circuito`, `Gomas`…). */
export async function metadatosDePagina(
  locale: string,
  namespace: "Circuito" | "Gomas" | "Telemetria" | "Glosario",
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace });
  return metadatos(locale, `${t("titulo")} · F1 Analytics`, t("subtitulo"));
}
