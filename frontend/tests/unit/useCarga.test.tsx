import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DESPERTANDO_TRAS_MS, useCarga } from "@/hooks/useCarga";
import { ErrorApi } from "@/lib/api";

afterEach(() => {
  vi.useRealTimers();
});

describe("useCarga", () => {
  it("queda inactivo y no pide nada cuando la clave es null", () => {
    const cargar = vi.fn();

    const { result } = renderHook(() => useCarga(null, cargar));

    expect(result.current.estado).toEqual({ fase: "inactivo" });
    expect(cargar).not.toHaveBeenCalled();
  });

  it("pasa de cargando a listo con los datos", async () => {
    const { result } = renderHook(() => useCarga("a", () => Promise.resolve([1, 2])));

    expect(result.current.estado.fase).toBe("cargando");
    await waitFor(() => expect(result.current.estado).toEqual({ fase: "listo", datos: [1, 2] }));
  });

  it("guarda el código del error de la API", async () => {
    const { result } = renderHook(() =>
      useCarga("a", () => Promise.reject(new ErrorApi("openf1_en_vivo", 503))),
    );

    await waitFor(() =>
      expect(result.current.estado).toEqual({ fase: "error", codigo: "openf1_en_vivo" }),
    );
  });

  it("usa fallo_api cuando falla algo que no es de la API", async () => {
    const { result } = renderHook(() => useCarga("a", () => Promise.reject(new Error("x"))));

    await waitFor(() =>
      expect(result.current.estado).toEqual({ fase: "error", codigo: "fallo_api" }),
    );
  });

  it("pasa a despertando si tarda más de unos segundos", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCarga("a", () => new Promise(() => {})));

    act(() => {
      vi.advanceTimersByTime(DESPERTANDO_TRAS_MS + 1);
    });

    expect(result.current.estado.fase).toBe("despertando");
  });

  it("al cambiar la clave vuelve a cargar y no muestra los datos anteriores", async () => {
    const { result, rerender } = renderHook(
      ({ clave }) => useCarga(clave, () => Promise.resolve(clave)),
      { initialProps: { clave: "a" } },
    );
    await waitFor(() => expect(result.current.estado).toEqual({ fase: "listo", datos: "a" }));

    rerender({ clave: "b" });

    expect(result.current.estado.fase).toBe("cargando");
    await waitFor(() => expect(result.current.estado).toEqual({ fase: "listo", datos: "b" }));
  });

  it("reintentar vuelve a pedir lo mismo", async () => {
    const cargar = vi
      .fn()
      .mockRejectedValueOnce(new ErrorApi("fallo_openf1", 503))
      .mockResolvedValueOnce("ok");
    const { result } = renderHook(() => useCarga("a", cargar));
    await waitFor(() => expect(result.current.estado.fase).toBe("error"));

    act(() => result.current.reintentar());

    await waitFor(() => expect(result.current.estado).toEqual({ fase: "listo", datos: "ok" }));
    expect(cargar).toHaveBeenCalledTimes(2);
  });
});
