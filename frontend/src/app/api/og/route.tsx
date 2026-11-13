import { createFormatter, hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ImageResponse } from "next/og";

import { routing } from "@/i18n/routing";
import { conclusionCircuito } from "@/lib/conclusionCircuito";
import { formatearTiempoVuelta } from "@/lib/formato";
import { cargarFuentes } from "@/lib/og/fuentes";
import { cargarDatosCircuito, leerParametrosCircuito } from "@/lib/og/circuito";
import { ALTO, ANCHO, TarjetaCircuito, TarjetaMarca } from "@/lib/og/tarjetas";

/** Las tarjetas no cambian entre despliegues; los rastreadores de las redes las guardan de todas formas. */
const CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";
/** La tarjeta de marca que sale cuando el backend no respondió: si se guardara una semana, el enlace quedaría sin datos. */
const CACHE_CORTA = "public, max-age=60, s-maxage=60";

async function cargarRecursos(idioma: string) {
  return Promise.all([
    cargarFuentes(),
    getTranslations({ locale: idioma, namespace: "Meta" }),
    getTranslations({ locale: idioma, namespace: "Compartir" }),
    getTranslations({ locale: idioma, namespace: "Circuito" }),
    getTranslations({ locale: idioma, namespace: "Circuito.conclusion" }),
    getTranslations({ locale: idioma, namespace: "Sesiones" }),
  ]);
}

type Recursos = Awaited<ReturnType<typeof cargarRecursos>>;

function tarjetaMarca([fuentes, meta, compartir]: Recursos, cache: string) {
  return new ImageResponse(
    (
      <TarjetaMarca
        nombre={meta("titulo")}
        lema={meta("eslogan")}
        descripcion={meta("descripcion")}
        credito={compartir("credito")}
      />
    ),
    { width: ANCHO, height: ALTO, fonts: fuentes, headers: { "cache-control": cache } },
  );
}

/**
 * La imagen que sale al compartir un enlace.
 *
 * - `/api/og?idioma=es`: la tarjeta de marca.
 * - `/api/og?idioma=es&tarjeta=circuito&sesion=9586&piloto=4&anio=2024&evento=1244`: la vuelta de
 *   un piloto. Si el backend no responde a tiempo sale la de marca, con caché corta.
 *
 * Solo recibe códigos y números, nunca texto: lo que se dibuja sale de `messages` o de la API.
 */
export async function GET(peticion: Request) {
  const consulta = new URL(peticion.url).searchParams;
  const idioma = consulta.get("idioma") ?? routing.defaultLocale;
  if (!hasLocale(routing.locales, idioma)) {
    return Response.json({ detail: "idioma_no_valido" }, { status: 400 });
  }

  const tarjeta = consulta.get("tarjeta");
  if (tarjeta !== null && tarjeta !== "circuito") {
    return Response.json({ detail: "tarjeta_no_valida" }, { status: 400 });
  }
  const parametros = tarjeta === "circuito" ? leerParametrosCircuito(consulta) : null;
  if (tarjeta === "circuito" && parametros === null) {
    return Response.json({ detail: "parametros_no_validos" }, { status: 400 });
  }

  let recursos: Recursos;
  try {
    recursos = await cargarRecursos(idioma);
  } catch (error) {
    console.error("No se pudo preparar la tarjeta para compartir", error);
    return Response.json({ detail: "tarjeta_no_disponible" }, { status: 500, headers: { "cache-control": "no-store" } });
  }

  if (parametros === null) return tarjetaMarca(recursos, CACHE);

  let datos;
  try {
    datos = await cargarDatosCircuito(parametros);
  } catch (error) {
    console.error("La tarjeta del circuito cae a la de marca: el backend no respondió", error);
    return tarjetaMarca(recursos, CACHE_CORTA);
  }

  const [fuentes, meta, compartir, circuito, conclusion, sesiones] = recursos;
  const { analisis, contexto } = datos;
  const velocidades = analisis.puntos.map((p) => p.velocidad);
  const { titulo } = conclusionCircuito(analisis, conclusion, createFormatter({ locale: idioma }));

  return new ImageResponse(
    (
      <TarjetaCircuito
        marca={meta("titulo")}
        contexto={
          contexto
            ? [contexto.evento, sesiones.has(contexto.sesion) ? sesiones(contexto.sesion) : contexto.sesion, parametros.anio].join(" · ")
            : ""
        }
        analisis={analisis}
        tiempo={formatearTiempoVuelta(analisis.tiempo_vuelta_s, idioma)}
        vuelta={circuito("vuelta", { vuelta: analisis.vuelta })}
        titulo={titulo}
        leyendaMinima={String(Math.min(...velocidades))}
        leyendaMaxima={circuito("leyendaVelocidadMaxima", { velocidad: Math.max(...velocidades) })}
        credito={compartir("credito")}
      />
    ),
    { width: ANCHO, height: ALTO, fonts: fuentes, headers: { "cache-control": CACHE } },
  );
}
