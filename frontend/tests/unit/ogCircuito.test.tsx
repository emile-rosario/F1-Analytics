// @vitest-environment node
import { createFormatter, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/og/route";
import { conclusionCircuito } from "@/lib/conclusionCircuito";
import { cargarDatosCircuito, leerParametrosCircuito } from "@/lib/og/circuito";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { crearAnalisis } from "./datos";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: locale === "es" ? es : en, namespace } as never),
}));

const CALENDARIO = [{ evento: 1244, nombre: "Italian Grand Prix" }];
const SESIONES = [{ sesion: 9586, nombre: "Qualifying" }];
const CONSULTA = "?idioma=es&tarjeta=circuito&sesion=9586&piloto=4&anio=2024&evento=1244";

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });

const fetchReal = globalThis.fetch;

/** Un backend de mentira: responde según la ruta que le piden. Lo demás (Satori carga su WASM con fetch) pasa. */
function simularBackend(fallos: { calendario?: boolean; analisis?: boolean } = {}) {
  const peticiones: string[] = [];
  const simulado = vi.fn(async (url: string | URL | Request, opciones?: RequestInit) => {
    const ruta = String(url);
    if (!ruta.includes("/api/")) return fetchReal(url, opciones);
    peticiones.push(ruta);
    if (ruta.includes("/api/analisis/circuito")) {
      return fallos.analisis ? json({ codigo: "fallo" }, 500) : json(crearAnalisis());
    }
    if (ruta.includes("/api/calendario/")) {
      return fallos.calendario ? json({ codigo: "fallo" }, 500) : json(CALENDARIO);
    }
    if (ruta.includes("/api/sesiones/")) return json(SESIONES);
    return json({}, 404);
  });
  vi.stubGlobal("fetch", simulado);
  return { peticiones, simulado };
}

const pedir = (consulta: string) => GET(new Request(`http://localhost:3000/api/og${consulta}`));
const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/og?tarjeta=circuito", () => {
  it("dibuja la vuelta del piloto: un PNG de 1200×630 distinto al de marca y con caché larga", async () => {
    const backend = simularBackend();

    const respuesta = await pedir(CONSULTA);
    const png = await bytes(respuesta);
    const marca = await bytes(await pedir("?idioma=es"));

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("image/png");
    expect(respuesta.headers.get("cache-control")).toContain("s-maxage=604800");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.equals(marca)).toBe(false);
    // Pide la vuelta, el calendario del año y las sesiones del evento, nada más.
    expect([...backend.peticiones].sort()).toEqual([
      expect.stringContaining("/api/analisis/circuito?sesion=9586&piloto=4"),
      expect.stringContaining("/api/calendario/2024"),
      expect.stringContaining("/api/sesiones/2024/1244"),
    ]);
  });

  it("en inglés dibuja otra imagen que en español", async () => {
    simularBackend();

    const espanol = await bytes(await pedir(CONSULTA));
    const ingles = await bytes(await pedir(CONSULTA.replace("idioma=es", "idioma=en")));

    expect(ingles.equals(espanol)).toBe(false);
  });

  it("sin año ni evento dibuja la vuelta sin la línea del Gran Premio y no pide el calendario", async () => {
    const backend = simularBackend();

    const respuesta = await pedir("?idioma=es&tarjeta=circuito&sesion=9586&piloto=4");

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("cache-control")).toContain("s-maxage=604800");
    expect(backend.peticiones).toHaveLength(1);
  });

  it("si el calendario falla la tarjeta sale igual, sin la línea del Gran Premio", async () => {
    simularBackend({ calendario: true });

    const respuesta = await pedir(CONSULTA);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("cache-control")).toContain("s-maxage=604800");
  });

  it("si no llega la vuelta cae a la tarjeta de marca con caché corta, para no quedar guardada", async () => {
    simularBackend({ analisis: true });

    const respuesta = await pedir(CONSULTA);
    const png = await bytes(respuesta);
    const marca = await bytes(await pedir("?idioma=es"));

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60");
    expect(png.equals(marca)).toBe(true);
  });

  it("si el backend no es alcanzable también cae a la de marca", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, opciones?: RequestInit) => {
        if (String(url).includes("/api/")) throw new TypeError("fetch failed");
        return fetchReal(url, opciones);
      }),
    );

    const respuesta = await pedir(CONSULTA);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("cache-control")).toContain("max-age=60");
  });

  const invalidos = [
    ["falta el piloto", "?tarjeta=circuito&sesion=9586"],
    ["la sesión no es un número", "?tarjeta=circuito&sesion=abc&piloto=4"],
    ["intenta colar otro parámetro en la sesión", "?tarjeta=circuito&sesion=9586%26x%3D1&piloto=4"],
    ["intenta subir de ruta", "?tarjeta=circuito&sesion=..%2F..%2Fsalud&piloto=4"],
    ["un número negativo", "?tarjeta=circuito&sesion=-1&piloto=4"],
    ["un año que no es un número", "?tarjeta=circuito&sesion=9586&piloto=4&anio=20x4&evento=1244"],
    ["un número demasiado largo", "?tarjeta=circuito&sesion=12345678901&piloto=4"],
  ];
  for (const [caso, consulta] of invalidos) {
    it(`responde 400 y no llama al backend cuando ${caso}`, async () => {
      const backend = simularBackend();

      const respuesta = await pedir(consulta);

      expect(respuesta.status).toBe(400);
      expect(await respuesta.json()).toEqual({ detail: "parametros_no_validos" });
      expect(backend.simulado).not.toHaveBeenCalled();
    });
  }

  it("rechaza una tarjeta que no existe", async () => {
    const respuesta = await pedir("?tarjeta=gomas&sesion=9586");

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toEqual({ detail: "tarjeta_no_valida" });
  });
});

describe("leerParametrosCircuito", () => {
  const leer = (consulta: string) => leerParametrosCircuito(new URLSearchParams(consulta));

  it("lee sesión y piloto, con año y evento opcionales", () => {
    expect(leer("sesion=9586&piloto=4")).toEqual({ sesion: 9586, piloto: 4, anio: null, evento: null });
    expect(leer("sesion=9586&piloto=4&anio=2024&evento=1244")).toEqual({
      sesion: 9586,
      piloto: 4,
      anio: 2024,
      evento: 1244,
    });
  });

  it("un año o un evento inválidos invalidan la consulta; si no vienen, no importa", () => {
    expect(leer("sesion=1&piloto=2&anio=")).toBeNull();
    expect(leer("sesion=1&piloto=2&evento=x")).toBeNull();
  });
});

describe("cargarDatosCircuito", () => {
  it("falla si el backend tarda más que el plazo, aunque la petición siga abierta", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    await expect(
      cargarDatosCircuito({ sesion: 1, piloto: 2, anio: null, evento: null }, 30),
    ).rejects.toThrow("plazo_agotado");
  });

  it("devuelve el nombre del Gran Premio y de la sesión, o null si la sesión no es de ese evento", async () => {
    simularBackend();

    const encontrado = await cargarDatosCircuito({ sesion: 9586, piloto: 4, anio: 2024, evento: 1244 });
    const ajeno = await cargarDatosCircuito({ sesion: 777, piloto: 4, anio: 2024, evento: 1244 });

    expect(encontrado.contexto).toEqual({ evento: "Italian Grand Prix", sesion: "Qualifying" });
    expect(ajeno.contexto).toBeNull();
  });
});

describe("conclusionCircuito", () => {
  const conclusion = (analisis = crearAnalisis(), idioma: "es" | "en" = "es") =>
    conclusionCircuito(
      analisis,
      createTranslator({
        locale: idioma,
        messages: idioma === "es" ? es : en,
        namespace: "Circuito.conclusion",
      } as never) as never,
      createFormatter({ locale: idioma }),
    );

  it("el titular nombra la frenada más fuerte, en cada idioma", () => {
    expect(conclusion().titulo).toBe("La frenada más fuerte es la de la curva 1: de 319 a 94 km/h");
    expect(conclusion(crearAnalisis(), "en").titulo).toBe(
      "The hardest braking is at turn 1: from 319 to 94 km/h",
    );
  });

  it("un circuito nuevo (sin curvas) dice que no se puede medir, no que no se frenó", () => {
    const nuevo = crearAnalisis({ curvas: [], frenadas: [] });
    nuevo.resumen.frenada_mas_fuerte = null;

    expect(conclusion(nuevo).titulo).toBe(es.Circuito.conclusion.tituloSinCurvas);
  });

  it("con curvas pero sin frenadas dice que no se detectaron", () => {
    const suave = crearAnalisis({ frenadas: [] });
    suave.resumen.frenada_mas_fuerte = null;

    expect(conclusion(suave).titulo).toBe(es.Circuito.conclusion.tituloSinFrenadas);
  });

  it("el detalle da los números del resumen con el formato del idioma", () => {
    expect(conclusion().detalle).toMatch(
      /^NOR fue a fondo el 83\s?% de la vuelta, llegó a 347 km\/h a los 653 m/,
    );
  });
});
