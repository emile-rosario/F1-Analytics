import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ImageResponse } from "next/og";

import { routing } from "@/i18n/routing";
import { cargarFuentes } from "@/lib/og/fuentes";
import { ALTO, ANCHO, TarjetaMarca } from "@/lib/og/tarjetas";

/** La tarjeta no cambia entre despliegues; los rastreadores de las redes la guardan de todas formas. */
const CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

/**
 * La imagen que sale al compartir un enlace: `/api/og?idioma=es`.
 *
 * Solo recibe un código de idioma, nunca texto: lo que se dibuja sale de `messages`.
 */
export async function GET(peticion: Request) {
  const idioma = new URL(peticion.url).searchParams.get("idioma") ?? routing.defaultLocale;
  if (!hasLocale(routing.locales, idioma)) {
    return Response.json({ detail: "idioma_no_valido" }, { status: 400 });
  }

  let recursos;
  try {
    recursos = await Promise.all([
      cargarFuentes(),
      getTranslations({ locale: idioma, namespace: "Meta" }),
      getTranslations({ locale: idioma, namespace: "Inicio" }),
      getTranslations({ locale: idioma, namespace: "Compartir" }),
    ]);
  } catch (error) {
    console.error("No se pudo preparar la tarjeta para compartir", error);
    return Response.json({ detail: "tarjeta_no_disponible" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
  const [fuentes, meta, inicio, compartir] = recursos;

  return new ImageResponse(
    (
      <TarjetaMarca
        nombre={meta("titulo")}
        lema={inicio("titulo")}
        descripcion={meta("descripcion")}
        credito={compartir("credito")}
      />
    ),
    { width: ANCHO, height: ALTO, fonts: fuentes, headers: { "cache-control": CACHE } },
  );
}
