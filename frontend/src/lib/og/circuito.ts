import {
  pedirAnalisisCircuito,
  pedirCalendario,
  pedirSesiones,
  type AnalisisCircuito,
  type OpcionesPedir,
} from "@/lib/api";
import { leerEntero } from "@/lib/parametros";

/** Cuánto se espera al backend antes de dar la tarjeta de marca. Vercel corta la función a los 10 s. */
export const PLAZO_BACKEND_MS = 8_000;

export type ParametrosCircuito = {
  sesion: number;
  piloto: number;
  /** Con año y evento la tarjeta lleva «Gran Premio · sesión · año»; sin ellos, solo la vuelta. */
  anio: number | null;
  evento: number | null;
};

/**
 * Los parámetros de la tarjeta del circuito, o `null` si falta alguno o no es un entero. Año y
 * evento son opcionales, pero si vienen tienen que ser válidos.
 */
export function leerParametrosCircuito(consulta: URLSearchParams): ParametrosCircuito | null {
  const sesion = leerEntero(consulta.get("sesion"));
  const piloto = leerEntero(consulta.get("piloto"));
  const anio = leerEntero(consulta.get("anio"));
  const evento = leerEntero(consulta.get("evento"));
  if (sesion === null || piloto === null) return null;
  if ((consulta.has("anio") && anio === null) || (consulta.has("evento") && evento === null)) return null;
  return { sesion, piloto, anio, evento };
}

export type ContextoSesion = { evento: string; sesion: string };

/** Falla si pasa de `ms`: la petición sigue su curso, pero la tarjeta ya no la espera. */
export async function conPlazo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error("plazo_agotado")), ms);
  });
  try {
    return await Promise.race([promesa, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

/** El nombre del Gran Premio y de la sesión, o `null` si no se encuentran (la tarjeta sale sin esa línea). */
async function pedirContexto(
  { sesion, anio, evento }: ParametrosCircuito,
  opciones: OpcionesPedir,
): Promise<ContextoSesion | null> {
  if (anio === null || evento === null) return null;
  try {
    const [calendario, sesiones] = await Promise.all([
      pedirCalendario(anio, opciones),
      pedirSesiones(anio, evento, opciones),
    ]);
    const nombreEvento = calendario.find((e) => e.evento === evento)?.nombre;
    const nombreSesion = sesiones.find((s) => s.sesion === sesion)?.nombre;
    return nombreEvento && nombreSesion ? { evento: nombreEvento, sesion: nombreSesion } : null;
  } catch {
    return null;
  }
}

/**
 * Lo que dibuja la tarjeta del circuito. Lanza si la vuelta no llega a tiempo: sin ella no hay
 * tarjeta de datos y la ruta cae a la de marca.
 */
export async function cargarDatosCircuito(
  parametros: ParametrosCircuito,
  plazoMs = PLAZO_BACKEND_MS,
): Promise<{ analisis: AnalisisCircuito; contexto: ContextoSesion | null }> {
  const opciones: OpcionesPedir = { timeoutMs: plazoMs, esperaReintentoMs: 500 };
  const [analisis, contexto] = await conPlazo(
    Promise.all([
      pedirAnalisisCircuito(parametros.sesion, parametros.piloto, opciones),
      pedirContexto(parametros, opciones),
    ]),
    plazoMs,
  );
  return { analisis, contexto };
}
