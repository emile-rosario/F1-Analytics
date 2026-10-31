import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorApi, pedir } from "@/lib/api";

const SIN_ESPERA = { esperaReintentoMs: 0 };

function respuesta(estado: number, cuerpo: unknown = {}) {
  return new Response(JSON.stringify(cuerpo), { status: estado });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("pedir", () => {
  it("devuelve el JSON cuando la API responde bien", async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuesta(200, { estado: "ok" }));

    const datos = await pedir("/api/salud", { fetchFn, ...SIN_ESPERA });

    expect(datos).toEqual({ estado: "ok" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("reintenta una vez cuando llega un 502 y devuelve la segunda respuesta", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(respuesta(502))
      .mockResolvedValueOnce(respuesta(200, { estado: "ok" }));

    const datos = await pedir("/api/salud", { fetchFn, ...SIN_ESPERA });

    expect(datos).toEqual({ estado: "ok" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("no reintenta más de una vez", async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuesta(502));

    await expect(pedir("/api/salud", { fetchFn, ...SIN_ESPERA })).rejects.toMatchObject({
      codigo: "fallo_api",
      estadoHttp: 502,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("no reintenta ante otros errores y usa el código que manda la API", async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuesta(404, { codigo: "sesion_no_encontrada" }));

    await expect(pedir("/api/x", { fetchFn, ...SIN_ESPERA })).rejects.toMatchObject({
      codigo: "sesion_no_encontrada",
      estadoHttp: 404,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("usa fallo_api cuando el error no trae JSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));

    await expect(pedir("/api/x", { fetchFn, ...SIN_ESPERA })).rejects.toMatchObject({
      codigo: "fallo_api",
    });
  });

  it("lanza sin_conexion si no hay red", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(pedir("/api/x", { fetchFn, ...SIN_ESPERA })).rejects.toMatchObject({
      codigo: "sin_conexion",
    });
  });

  it("lanza tiempo_agotado si la API no responde a tiempo", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolver, rechazar) => {
          init?.signal?.addEventListener("abort", () => rechazar(new DOMException("", "AbortError")));
        }),
    );

    const resultado = pedir("/api/x", { fetchFn, timeoutMs: 90_000 });
    const esperado = expect(resultado).rejects.toBeInstanceOf(ErrorApi);
    await vi.advanceTimersByTimeAsync(90_000);

    await esperado;
    await expect(resultado).rejects.toMatchObject({ codigo: "tiempo_agotado" });
  });
});
