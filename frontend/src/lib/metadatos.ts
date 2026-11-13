import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { leerEntero } from "@/lib/parametros";
import { ALTO, ANCHO } from "@/lib/og/tarjetas";

/** El `locale` de Open Graph de cada idioma de la web. */
const LOCALE_OG: Record<string, string> = { es: "es_ES", en: "en_US" };

/** La dirección de la imagen para compartir de una página, relativa a `metadataBase`. */
export function rutaTarjeta(idioma: string): string {
  return `/api/og?idioma=${idioma}`;
}

/** Los parámetros de búsqueda de una página, como los entrega Next. */
export type Consulta = Record<string, string | string[] | undefined>;

/**
 * La imagen de la vuelta de un piloto si la URL de la página trae sesión y piloto válidos, y si no
 * `null` (la página usa entonces la tarjeta de marca). Solo pasan enteros: nada de lo que escriba
 * quien arma el enlace llega a la imagen como texto.
 */
export function rutaTarjetaCircuito(idioma: string, consulta: Consulta): string | null {
  const valor = (clave: string) => {
    const v = consulta[clave];
    return leerEntero(typeof v === "string" ? v : null);
  };
  const sesion = valor("sesion");
  const piloto = valor("piloto");
  if (sesion === null || piloto === null) return null;

  const partes = [`idioma=${idioma}`, "tarjeta=circuito", `sesion=${sesion}`, `piloto=${piloto}`];
  const anio = valor("anio");
  const evento = valor("evento");
  if (anio !== null && evento !== null) partes.push(`anio=${anio}`, `evento=${evento}`);
  return `/api/og?${partes.join("&")}`;
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
  /** La imagen propia de la página (la vuelta de un piloto); sin ella, la tarjeta de marca. */
  tarjeta?: { ruta: string; alt: "altCircuito" },
): Promise<Metadata> {
  const compartir = await getTranslations({ locale, namespace: "Compartir" });
  const nombre = (await getTranslations({ locale, namespace: "Meta" }))("titulo");
  const imagen = {
    url: tarjeta?.ruta ?? rutaTarjeta(locale),
    width: ANCHO,
    height: ALTO,
    alt: compartir(tarjeta?.alt ?? "alt"),
  };

  return {
    title: titulo,
    description: descripcion,
    openGraph: {
      type: "website",
      siteName: nombre,
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
  /** Con los parámetros de la URL, la página del circuito comparte la vuelta elegida. */
  consulta?: Consulta,
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace });
  const nombre = (await getTranslations({ locale, namespace: "Meta" }))("titulo");
  const ruta = namespace === "Circuito" && consulta ? rutaTarjetaCircuito(locale, consulta) : null;
  return metadatos(
    locale,
    `${t("titulo")} · ${nombre}`,
    t("subtitulo"),
    ruta ? { ruta, alt: "altCircuito" } : undefined,
  );
}
