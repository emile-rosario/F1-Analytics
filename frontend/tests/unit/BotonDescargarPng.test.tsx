import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BotonDescargarPng from "@/components/BotonDescargarPng";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

const exportar = vi.hoisted(() => ({ descargarPng: vi.fn() }));
vi.mock("@/lib/exportar", () => exportar);

function pintar(idioma: "es" | "en" = "es", nodo: { current: HTMLElement | null } = { current: document.createElement("div") }) {
  render(
    <NextIntlClientProvider locale={idioma} messages={idioma === "es" ? es : en}>
      <BotonDescargarPng
        nodo={nodo}
        grafico={idioma === "es" ? "del mapa del circuito" : "the circuit map"}
        archivo="f1analytics-circuito-9586-nor-velocidad.png"
      />
    </NextIntlClientProvider>,
  );
  return nodo;
}

beforeEach(() => {
  vi.clearAllMocks();
  exportar.descargarPng.mockResolvedValue(undefined);
});

describe("BotonDescargarPng", () => {
  it("dice en su nombre accesible qué gráfico baja", () => {
    pintar();

    expect(screen.getByRole("button", { name: "Descargar PNG del mapa del circuito" })).toBeInTheDocument();
    // El texto visible está contenido en el nombre accesible (WCAG 2.5.3).
    expect(screen.getByRole("button")).toHaveTextContent("Descargar PNG");
  });

  it("al pulsarlo baja el nodo con su nombre de archivo y el crédito, y avisa cuando termina", async () => {
    const nodo = pintar();

    await userEvent.click(screen.getByRole("button"));

    expect(exportar.descargarPng).toHaveBeenCalledWith(
      nodo.current,
      "f1analytics-circuito-9586-nor-velocidad.png",
      "F1 Analytics · Datos de OpenF1",
    );
    expect(await screen.findByText("Imagen descargada.")).toBeInTheDocument();
  });

  it("mientras prepara la imagen se desactiva para que no se pida dos veces", async () => {
    let terminar!: () => void;
    exportar.descargarPng.mockReturnValue(new Promise<void>((resolver) => (terminar = resolver)));
    pintar();

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent("Preparando…");
    terminar();
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  });

  it("si falla lo dice y deja volver a intentar", async () => {
    exportar.descargarPng.mockRejectedValueOnce(new Error("sin lienzo"));
    pintar();

    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("No se pudo crear la imagen. Prueba de nuevo.")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeEnabled();

    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Imagen descargada.")).toBeInTheDocument();
  });

  it("en inglés todo el texto va en inglés", async () => {
    pintar("en");

    expect(screen.getByRole("button", { name: "Download PNG of the circuit map" })).toHaveTextContent("Download PNG");
    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("Image downloaded.")).toBeInTheDocument();
    expect(exportar.descargarPng).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "F1 Analytics · Data from OpenF1",
    );
  });

  it("sin gráfico al que apuntar no hace nada", async () => {
    pintar("es", { current: null });

    await userEvent.click(screen.getByRole("button"));

    expect(exportar.descargarPng).not.toHaveBeenCalled();
  });
});
