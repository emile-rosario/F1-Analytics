import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import Conclusion from "@/components/Conclusion";
import TablaFrenadas from "@/components/TablaFrenadas";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { crearAnalisis } from "./datos";

function pintar(elemento: React.ReactNode, idioma: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={idioma} messages={idioma === "es" ? es : en}>
      {elemento}
    </NextIntlClientProvider>,
  );
}

describe("Conclusion", () => {
  it("en español: titular con la frenada más fuerte y detalle con los números", () => {
    pintar(<Conclusion analisis={crearAnalisis()} />);

    expect(
      screen.getByText("La frenada más fuerte es la de la curva 1: de 319 a 94 km/h"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /^NOR fue a fondo el 83\s?% de la vuelta, llegó a 347 km\/h a los 653 m de la meta y bajó hasta 73 km\/h\.$/,
      ),
    ).toBeInTheDocument();
  });

  it("en inglés usa sus propias plantillas y su formato de porcentaje", () => {
    pintar(<Conclusion analisis={crearAnalisis()} />, "en");

    expect(
      screen.getByText("The hardest braking is at turn 1: from 319 to 94 km/h"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "NOR was flat out for 83% of the lap, reached 347 km/h 653 m after the line and dropped to 73 km/h.",
      ),
    ).toBeInTheDocument();
  });

  it("la curva con letra se escribe junta (2A)", () => {
    const analisis = crearAnalisis();
    analisis.resumen.frenada_mas_fuerte = { curva: 2, letra: "A", vel_entrada: 200, vel_salida: 90 };

    pintar(<Conclusion analisis={analisis} />);

    expect(screen.getByText(/curva 2A: de 200 a 90 km\/h/)).toBeInTheDocument();
  });

  it("sin frenadas no inventa una", () => {
    const analisis = crearAnalisis();
    analisis.resumen.frenada_mas_fuerte = null;

    pintar(<Conclusion analisis={analisis} />);

    expect(screen.getByText("En esta vuelta no se detectaron frenadas fuertes")).toBeInTheDocument();
  });
});

describe("TablaFrenadas", () => {
  it("una fila por frenada con la curva, las distancias y las velocidades", () => {
    pintar(<TablaFrenadas frenadas={crearAnalisis().frenadas} />);

    const tabla = screen.getByRole("table", { name: "Zonas de frenado de la vuelta, en orden" });
    const fila = within(tabla).getAllByRole("row")[1];
    const celdas = [...fila.querySelectorAll("th, td")].map((c) => c.textContent);
    // Curva, empieza, dura, entrada, salida y cuánto pierde.
    expect(celdas).toEqual(["1", "120", "116", "319", "94", "225"]);
  });

  it("las cabeceras son de columna y la curva es la cabecera de su fila", () => {
    pintar(<TablaFrenadas frenadas={crearAnalisis().frenadas} />);

    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    expect(screen.getByRole("rowheader", { name: "1" })).toBeInTheDocument();
  });

  it("la región con scroll se puede recorrer con el teclado", () => {
    pintar(<TablaFrenadas frenadas={crearAnalisis().frenadas} />);

    expect(screen.getByRole("region", { name: /Tabla de frenadas/ })).toHaveAttribute("tabindex", "0");
  });

  it("en inglés traduce las columnas", () => {
    pintar(<TablaFrenadas frenadas={crearAnalisis().frenadas} />, "en");

    expect(screen.getByRole("columnheader", { name: "Entry (km/h)" })).toBeInTheDocument();
  });

  it("sin frenadas dice que no hubo", () => {
    pintar(<TablaFrenadas frenadas={[]} />);

    expect(screen.getByText("No se detectaron frenadas en esta vuelta.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
