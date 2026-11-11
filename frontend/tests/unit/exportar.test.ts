import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { descargarPng, nombreArchivo, sinElementosInteractivos } from "@/lib/exportar";

const libreria = vi.hoisted(() => ({ toCanvas: vi.fn() }));
vi.mock("html-to-image", () => libreria);

describe("nombreArchivo", () => {
  it("junta las partes con guiones, en minúsculas, con el prefijo de la web", () => {
    expect(nombreArchivo("telemetria", 9468, "VER", "LEC")).toBe("f1analytics-telemetria-9468-ver-lec.png");
  });

  it("quita tildes, espacios y símbolos", () => {
    expect(nombreArchivo("Gran Premio de México", "sin corregir!")).toBe(
      "f1analytics-gran-premio-de-mexico-sin-corregir.png",
    );
  });

  it("ignora las partes vacías y no deja guiones sueltos", () => {
    expect(nombreArchivo("circuito", "", "  ", "--nor--")).toBe("f1analytics-circuito-nor.png");
  });

  it("siempre termina en .png", () => {
    expect(nombreArchivo("x")).toMatch(/\.png$/);
  });
});

describe("sinElementosInteractivos", () => {
  function nodoConCursor() {
    const raiz = document.createElement("div");
    raiz.innerHTML = `<span id="normal">dato</span><span id="tooltip" data-no-exportar>tip</span>`;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const cursor = document.createElementNS("http://www.w3.org/2000/svg", "g");
    cursor.setAttribute("data-no-exportar", "true");
    svg.appendChild(cursor);
    raiz.appendChild(svg);
    return { raiz, cursor: cursor as SVGGElement, tooltip: raiz.querySelector<HTMLElement>("#tooltip")!, normal: raiz.querySelector<HTMLElement>("#normal")! };
  }

  it("esconde los elementos marcados mientras dura la tarea, SVG incluidos, y no toca el resto", async () => {
    const { raiz, cursor, tooltip, normal } = nodoConCursor();
    const durante: string[] = [];

    await sinElementosInteractivos(raiz, async () => {
      durante.push(cursor.style.visibility, tooltip.style.visibility, normal.style.visibility);
    });

    expect(durante).toEqual(["hidden", "hidden", ""]);
  });

  it("al terminar devuelve cada elemento a lo que tenía antes", async () => {
    const { raiz, cursor, tooltip } = nodoConCursor();
    tooltip.style.visibility = "visible";

    await sinElementosInteractivos(raiz, async () => undefined);

    expect(cursor.style.visibility).toBe("");
    expect(tooltip.style.visibility).toBe("visible");
  });

  it("también los restaura si la tarea falla, y deja pasar el error", async () => {
    const { raiz, cursor } = nodoConCursor();

    await expect(
      sinElementosInteractivos(raiz, async () => {
        throw new Error("fallo al dibujar");
      }),
    ).rejects.toThrow("fallo al dibujar");

    expect(cursor.style.visibility).toBe("");
  });

  it("el gráfico no recibe el puntero mientras dura la captura y lo recupera después", async () => {
    const { raiz } = nodoConCursor();
    raiz.style.pointerEvents = "auto";
    const durante: string[] = [];

    await sinElementosInteractivos(raiz, async () => {
      durante.push(raiz.style.pointerEvents);
    });

    expect(durante).toEqual(["none"]);
    expect(raiz.style.pointerEvents).toBe("auto");
  });

  it("recupera el puntero también si la tarea falla", async () => {
    const { raiz } = nodoConCursor();

    await expect(
      sinElementosInteractivos(raiz, async () => {
        throw new Error("fallo");
      }),
    ).rejects.toThrow("fallo");

    expect(raiz.style.pointerEvents).toBe("");
  });

  it("devuelve lo que devuelve la tarea", async () => {
    const { raiz } = nodoConCursor();

    expect(await sinElementosInteractivos(raiz, async () => 42)).toBe(42);
  });
});

describe("descargarPng", () => {
  let revocar: Mock<(url: string) => void>;
  let clics: HTMLAnchorElement[];

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom no dibuja: se sustituyen el lienzo y la descarga por dobles que dejan comprobar el flujo.
    libreria.toCanvas.mockResolvedValue(Object.assign(document.createElement("canvas"), { width: 100, height: 50 }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((retorno) =>
      retorno(new Blob(["png"], { type: "image/png" })),
    );
    revocar = vi.fn<(url: string) => void>();
    URL.createObjectURL = vi.fn(() => "blob:prueba");
    URL.revokeObjectURL = revocar;
    clics = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clics.push(this);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    libreria.toCanvas.mockReset();
  });

  it("baja el archivo con el nombre pedido", async () => {
    await descargarPng(document.createElement("div"), "f1analytics-prueba.png", "crédito");

    expect(clics).toHaveLength(1);
    expect(clics[0].download).toBe("f1analytics-prueba.png");
    expect(clics[0].href).toContain("blob:prueba");
  });

  it("al doble de resolución y con el fondo de la web", async () => {
    await descargarPng(document.createElement("div"), "x.png", "crédito");

    expect(libreria.toCanvas).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pixelRatio: 2, backgroundColor: "#1a1c23" }),
    );
  });

  it("no libera el enlace al instante (Safari y Firefox descargan después) pero sí más tarde", async () => {
    await descargarPng(document.createElement("div"), "x.png", "crédito");

    expect(revocar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(revocar).toHaveBeenCalledWith("blob:prueba");
  });

  it("si no se puede dibujar el lienzo falla con un error, sin descargar nada", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    await expect(descargarPng(document.createElement("div"), "x.png", "crédito")).rejects.toThrow("sin_canvas");
    expect(clics).toHaveLength(0);
  });
});
