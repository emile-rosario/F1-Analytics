import type { components } from "./tipos-api";

export const URL_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Render gratis se duerme y la primera respuesta puede tardar cerca de un minuto. */
const TIMEOUT_MS = 90_000;
const ESPERA_REINTENTO_MS = 3_000;

export type CodigoErrorApi = "tiempo_agotado" | "sin_conexion" | "fallo_api";

export class ErrorApi extends Error {
  constructor(
    public readonly codigo: CodigoErrorApi | string,
    public readonly estadoHttp?: number,
  ) {
    super(codigo);
    this.name = "ErrorApi";
  }
}

export type OpcionesPedir = {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  esperaReintentoMs?: number;
};

const dormir = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

async function intentar(ruta: string, fetchFn: typeof fetch, timeoutMs: number) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), timeoutMs);

  try {
    return await fetchFn(`${URL_API}${ruta}`, { signal: control.signal });
  } catch {
    if (control.signal.aborted) throw new ErrorApi("tiempo_agotado");
    throw new ErrorApi("sin_conexion");
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Pide datos a la API. Si llega un 502 (servidor dormido que está despertando)
 * espera un poco y reintenta una vez.
 */
export async function pedir<T>(ruta: string, opciones: OpcionesPedir = {}): Promise<T> {
  const {
    fetchFn = fetch,
    timeoutMs = TIMEOUT_MS,
    esperaReintentoMs = ESPERA_REINTENTO_MS,
  } = opciones;

  let respuesta = await intentar(ruta, fetchFn, timeoutMs);
  if (respuesta.status === 502) {
    await dormir(esperaReintentoMs);
    respuesta = await intentar(ruta, fetchFn, timeoutMs);
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    throw new ErrorApi(cuerpo?.codigo ?? "fallo_api", respuesta.status);
  }
  return (await respuesta.json()) as T;
}

export type RespuestaSalud = components["schemas"]["Salud"];

export const pedirSalud = (opciones?: OpcionesPedir) =>
  pedir<RespuestaSalud>("/api/salud", opciones);

export type Evento = components["schemas"]["Evento"];
export type Sesion = components["schemas"]["Sesion"];
export type Piloto = components["schemas"]["Piloto"];

export const pedirCalendario = (anio: number, opciones?: OpcionesPedir) =>
  pedir<Evento[]>(`/api/calendario/${anio}`, opciones);

export const pedirSesiones = (anio: number, evento: number, opciones?: OpcionesPedir) =>
  pedir<Sesion[]>(`/api/sesiones/${anio}/${evento}`, opciones);

export const pedirPilotos = (sesion: number, opciones?: OpcionesPedir) =>
  pedir<Piloto[]>(`/api/sesiones/${sesion}/pilotos`, opciones);
