import { describe, expect, it } from "vitest";

import { nombreArchivo, sinElementosInteractivos } from "@/lib/exportar";

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

  it("devuelve lo que devuelve la tarea", async () => {
    const { raiz } = nodoConCursor();

    expect(await sinElementosInteractivos(raiz, async () => 42)).toBe(42);
  });
});
