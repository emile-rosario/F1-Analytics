import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import AyudaTerminos from "@/components/AyudaTerminos";
import Termino, { ConTerminos } from "@/components/Termino";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function pintar(elemento: ReactNode, idioma: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={idioma} messages={idioma === "es" ? es : en}>
      {elemento}
    </NextIntlClientProvider>,
  );
}

describe("Termino", () => {
  const palabra = () => screen.getByRole("button", { name: "stint" });

  it("empieza cerrado: es un botón sin definición a la vista", () => {
    pintar(
      <p>
        <ConTerminos>
          Cada <Termino clave="stint">stint</Termino> cuenta.
        </ConTerminos>
      </p>,
    );

    expect(palabra()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/mismo juego de gomas/)).not.toBeInTheDocument();
  });

  it("al pulsarlo muestra la definición y el enlace a su ficha, y al volver a pulsar la oculta", async () => {
    pintar(
      <p>
        <ConTerminos>
          Cada <Termino clave="stint">stint</Termino> cuenta.
        </ConTerminos>
      </p>,
    );

    await userEvent.click(palabra());

    expect(palabra()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/mismo juego de gomas/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver en el glosario" })).toHaveAttribute("href", "/glosario#stint");
    // El botón apunta a lo que despliega.
    const panel = screen.getByText(/mismo juego de gomas/).closest("span[id]")!;
    expect(palabra()).toHaveAttribute("aria-controls", panel.id);

    await userEvent.click(palabra());

    expect(palabra()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/mismo juego de gomas/)).not.toBeInTheDocument();
  });

  it("Esc lo cierra y devuelve el foco al botón", async () => {
    pintar(
      <p>
        <ConTerminos>
          Cada <Termino clave="stint">stint</Termino> cuenta.
        </ConTerminos>
      </p>,
    );
    await userEvent.click(palabra());
    await userEvent.click(screen.getByRole("link", { name: "Ver en el glosario" }));

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText(/mismo juego de gomas/)).not.toBeInTheDocument();
    expect(palabra()).toHaveFocus();
  });

  it("se maneja con el teclado", async () => {
    pintar(
      <p>
        <ConTerminos>
          Cada <Termino clave="stint">stint</Termino> cuenta.
        </ConTerminos>
      </p>,
    );

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    expect(screen.getByText(/mismo juego de gomas/)).toBeInTheDocument();
  });

  it("la definición va en el idioma de la página y con los números del análisis", async () => {
    pintar(
      <p>
        <ConTerminos>
          <Termino clave="combustible">fuel</Termino>
        </ConTerminos>
      </p>,
      "en",
    );

    await userEvent.click(screen.getByRole("button", { name: "fuel" }));

    expect(screen.getByText(/fixed approximation of 0\.06 s per lap/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it in the glossary" })).toHaveAttribute(
      "href",
      "/glosario#combustible",
    );
  });
});

describe("AyudaTerminos", () => {
  const grupo = () => screen.getByRole("group", { name: "Qué significa" });

  it("ofrece un botón por término, todos cerrados", () => {
    pintar(<AyudaTerminos claves={["degradacion", "r2"]} />);

    const botones = Array.from(grupo().querySelectorAll("button"));
    expect(botones.map((boton) => boton.textContent)).toEqual(["Degradación", "R²"]);
    expect(botones.every((boton) => boton.getAttribute("aria-expanded") === "false")).toBe(true);
  });

  it("al pulsar uno abre su definición, y pulsar otro cierra la anterior", async () => {
    pintar(<AyudaTerminos claves={["degradacion", "r2"]} />);

    await userEvent.click(screen.getByRole("button", { name: "Degradación" }));
    expect(screen.getByText(/pendiente de la recta/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver en el glosario" })).toHaveAttribute(
      "href",
      "/glosario#degradacion",
    );

    await userEvent.click(screen.getByRole("button", { name: "R²" }));
    expect(screen.queryByText(/pendiente de la recta/)).not.toBeInTheDocument();
    expect(screen.getByText(/número de 0 a 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Degradación" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "R²" })).toHaveAttribute("aria-expanded", "true");
  });

  it("pulsar el abierto lo cierra", async () => {
    pintar(<AyudaTerminos claves={["frenada"]} />);

    await userEvent.click(screen.getByRole("button", { name: "Frenada" }));
    await userEvent.click(screen.getByRole("button", { name: "Frenada" }));

    expect(screen.queryByText(/freno pisado/)).not.toBeInTheDocument();
  });

  it("Esc lo cierra y el foco vuelve al botón que lo abrió", async () => {
    pintar(<AyudaTerminos claves={["degradacion", "r2"]} />);
    await userEvent.click(screen.getByRole("button", { name: "R²" }));
    await userEvent.click(screen.getByRole("link", { name: "Ver en el glosario" }));

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText(/número de 0 a 1/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "R²" })).toHaveFocus();
  });

  it("en inglés usa el nombre del término en inglés", () => {
    pintar(<AyudaTerminos claves={["tramo"]} />, "en");

    expect(screen.getByRole("group", { name: "What it means" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stretch" })).toBeInTheDocument();
  });
});
