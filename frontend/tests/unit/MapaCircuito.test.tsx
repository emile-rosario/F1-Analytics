import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import MapaCircuito, { type ModoMapa } from "@/components/MapaCircuito";
import { COLORES_MARCHA } from "@/lib/colores";

import es from "../../messages/es.json";
import { crearAnalisis } from "./datos";

function pintar(modo: ModoMapa = "velocidad", analisis = crearAnalisis()) {
  return render(
    <NextIntlClientProvider locale="es" messages={es}>
      <MapaCircuito analisis={analisis} modo={modo} descripcion="Mapa de prueba" />
    </NextIntlClientProvider>,
  );
}

const trazos = (contenedor: HTMLElement) => contenedor.querySelectorAll("line.tramo");

describe("MapaCircuito", () => {
  it("es una imagen con su descripción para los lectores de pantalla", () => {
    pintar();

    expect(screen.getByRole("img", { name: "Mapa de prueba" })).toBeInTheDocument();
  });

  it("dibuja un tramo entre cada par de puntos y cierra el circuito en la meta", () => {
    // 6 puntos = 5 tramos, más el cierre porque el primero y el último quedan a 40 m.
    const { container } = pintar();

    expect(trazos(container)).toHaveLength(6);
  });

  it("no cierra el circuito si la vuelta termina lejos de donde empezó", () => {
    const abierto = crearAnalisis();
    abierto.puntos[0] = { ...abierto.puntos[0], x: -50_000 };

    const { container } = pintar("velocidad", abierto);

    expect(trazos(container)).toHaveLength(5);
  });

  it("no dibuja los tramos de largo cero que deja OpenF1 al repetir la posición", () => {
    const analisis = crearAnalisis();
    analisis.puntos.splice(2, 0, { ...analisis.puntos[1] });

    const { container } = pintar("velocidad", analisis);

    expect(trazos(container)).toHaveLength(6);
  });

  it("los tramos aparecen uno tras otro", () => {
    const { container } = pintar();

    const retrasos = [...trazos(container)].map((t) =>
      parseFloat((t as SVGElement).style.animationDelay),
    );
    expect(retrasos[0]).toBe(0);
    expect(retrasos).toEqual([...retrasos].sort((a, b) => a - b));
    expect(new Set(retrasos).size).toBe(retrasos.length);
  });

  it("en velocidad el tramo más lento y el más rápido tienen colores distintos", () => {
    const { container } = pintar("velocidad");

    const colores = [...trazos(container)].map((t) => t.getAttribute("stroke"));
    expect(colores[3]).toBe("rgb(61 123 255)"); // 90 km/h, la más lenta
    expect(colores[1]).toBe("rgb(255 90 54)"); // 320 km/h, la más rápida
  });

  it("en marchas cada tramo lleva el color de su marcha", () => {
    const { container } = pintar("marchas");

    const colores = [...trazos(container)].map((t) => t.getAttribute("stroke"));
    expect(colores.slice(0, 5)).toEqual([8, 8, 3, 2, 5].map((m) => COLORES_MARCHA[m]));
  });

  it("dibuja las curvas con su etiqueta, también con letra", () => {
    pintar();

    const curvas = screen.getByTestId("curvas");
    expect(within(curvas).getByText("1")).toBeInTheDocument();
    expect(within(curvas).getByText("2A")).toBeInTheDocument();
  });

  it("marca con un rombo cada inicio de frenada", () => {
    pintar();

    expect(screen.getByTestId("frenadas").querySelectorAll("path")).toHaveLength(1);
  });

  it("la leyenda de velocidad muestra el rango de la vuelta", () => {
    pintar("velocidad");

    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("320 km/h")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Marchas usadas" })).not.toBeInTheDocument();
  });

  it("la leyenda de marchas lista solo las marchas que se usaron", () => {
    pintar("marchas");

    const lista = screen.getByRole("list", { name: "Marchas usadas" });
    const marchas = within(lista)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(marchas).toEqual(["Marcha 2", "Marcha 3", "Marcha 5", "Marcha 7", "Marcha 8"]);
  });

  it("sin frenadas no muestra la leyenda del rombo", () => {
    pintar("velocidad", crearAnalisis({ frenadas: [] }));

    expect(screen.queryByText("Inicio de frenada")).not.toBeInTheDocument();
  });

  it("el mapa respeta la proporción del circuito", () => {
    pintar();

    const caja = screen.getByRole("img").getAttribute("viewBox") ?? "";
    const [, , ancho, alto] = caja.split(" ").map(Number);
    // El circuito mide 4000 × 1500: más ancho que alto, y los márgenes iguales lo acercan a 1.
    expect(ancho).toBeGreaterThan(alto);
    expect(ancho / alto).toBeLessThan(4000 / 1500);
  });
});
