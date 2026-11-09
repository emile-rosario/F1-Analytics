import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SelectorSesion from "@/components/SelectorSesion";
import type { Evento, Piloto, Sesion } from "@/lib/api";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

const reemplazar = vi.fn();
let parametros = new URLSearchParams();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: reemplazar }),
  usePathname: () => "/telemetria",
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => parametros }));

const api = vi.hoisted(() => ({
  pedirCalendario: vi.fn(),
  pedirSesiones: vi.fn(),
  pedirPilotos: vi.fn(),
}));
vi.mock("@/lib/api", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

const BAHREIN: Evento = {
  evento: 1229,
  nombre: "Bahrain Grand Prix",
  nombre_oficial: "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2024",
  pais: "Bahrain",
  circuito: "Sakhir",
  circuito_clave: 63,
  inicio: "2024-02-29T11:30:00Z",
};
const sesion = (id: number, nombre: string): Sesion => ({
  sesion: id,
  nombre,
  tipo: nombre,
  inicio: "2024-03-01T16:00:00Z",
  fin: "2024-03-01T17:00:00Z",
  evento: 1229,
  anio: 2024,
  terminada: true,
});
const SESIONES = [
  sesion(9468, "Qualifying"),
  sesion(9472, "Race"),
  sesion(9400, "Sprint Qualifying"),
];
const PILOTOS: Piloto[] = [
  { numero: 1, codigo: "VER", nombre: "Max VERSTAPPEN", equipo: "Red Bull Racing", color: "#3671C6" },
  { numero: 16, codigo: "LEC", nombre: "Charles LECLERC", equipo: "Ferrari", color: "#E80020" },
  { numero: 55, codigo: "SAI", nombre: "Carlos SAINZ", equipo: "Ferrari", color: "#E80020" },
];

function pintar(idioma: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={idioma} messages={idioma === "es" ? es : en}>
      <SelectorSesion conComparacion />
    </NextIntlClientProvider>,
  );
}

const CLASIFICACION = "anio=2024&evento=1229&sesion=9468";

beforeEach(() => {
  vi.clearAllMocks();
  parametros = new URLSearchParams(CLASIFICACION);
  api.pedirCalendario.mockResolvedValue([BAHREIN]);
  api.pedirSesiones.mockResolvedValue(SESIONES);
  api.pedirPilotos.mockResolvedValue(PILOTOS);
});

describe("SelectorSesion en modo comparación", () => {
  it("pide los pilotos y ofrece dos selectores con los mismos pilotos", async () => {
    pintar();

    expect(await screen.findAllByRole("option", { name: "SAI · Carlos SAINZ" })).toHaveLength(2);
    expect(api.pedirPilotos).toHaveBeenCalledWith(9468);
    expect(screen.getByLabelText("Piloto A (referencia)")).toBeInTheDocument();
    expect(screen.getByLabelText("Piloto B (comparado)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Piloto")).not.toBeInTheDocument();
  });

  it("sin sesión elegida no muestra los pilotos ni el segmento", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1229");
    pintar();
    await screen.findByRole("option", { name: "Clasificación" });

    expect(screen.queryByLabelText("Piloto A (referencia)")).not.toBeInTheDocument();
    expect(api.pedirPilotos).not.toHaveBeenCalled();
  });

  it("los pilotos de la URL quedan elegidos", async () => {
    parametros = new URLSearchParams(`${CLASIFICACION}&piloto_a=1&piloto_b=16`);
    pintar();
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    expect(screen.getByLabelText("Piloto A (referencia)")).toHaveValue("1");
    expect(screen.getByLabelText("Piloto B (comparado)")).toHaveValue("16");
  });

  it("el piloto elegido en un selector no se puede elegir en el otro", async () => {
    parametros = new URLSearchParams(`${CLASIFICACION}&piloto_a=1&piloto_b=16`);
    pintar();
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    const [opcionVerEnA, opcionVerEnB] = screen.getAllByRole("option", { name: "VER · Max VERSTAPPEN" });
    expect(opcionVerEnA).toBeEnabled();
    expect(opcionVerEnB).toBeDisabled();
    const [opcionLecEnA, opcionLecEnB] = screen.getAllByRole("option", { name: "LEC · Charles LECLERC" });
    expect(opcionLecEnA).toBeDisabled();
    expect(opcionLecEnB).toBeEnabled();
  });

  it("al elegir el piloto A lo guarda en la URL sin perder el resto", async () => {
    parametros = new URLSearchParams(`${CLASIFICACION}&piloto_b=16&segmento=Q3`);
    pintar();
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    await userEvent.selectOptions(screen.getByLabelText("Piloto A (referencia)"), "55");

    expect(reemplazar).toHaveBeenCalledWith({
      pathname: "/telemetria",
      query: {
        anio: "2024",
        evento: "1229",
        sesion: "9468",
        piloto_a: "55",
        piloto_b: "16",
        segmento: "Q3",
      },
    });
  });

  it("pide elegir dos pilotos mientras falte alguno", async () => {
    parametros = new URLSearchParams(`${CLASIFICACION}&piloto_a=1`);
    pintar();

    expect(await screen.findByText("Elige dos pilotos distintos para comparar su vuelta.")).toBeInTheDocument();
  });
});

describe("segmento", () => {
  it("en una clasificación ofrece la mejor vuelta y Q1, Q2 y Q3", async () => {
    pintar();
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    const segmento = screen.getByLabelText("Vuelta");
    expect(segmento).toHaveValue("");
    expect([...segmento.querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "Mejor de la sesión",
      "Q1",
      "Q2",
      "Q3",
    ]);
  });

  it("en la clasificación sprint ofrece SQ1, SQ2 y SQ3", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1229&sesion=9400");
    pintar();
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    const opciones = [...screen.getByLabelText("Vuelta").querySelectorAll("option")];
    expect(opciones.map((o) => o.textContent)).toEqual(["Mejor de la sesión", "SQ1", "SQ2", "SQ3"]);
  });

  it("en una carrera no hay selector de segmento", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1229&sesion=9472");
    pintar();
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    expect(screen.queryByLabelText("Vuelta")).not.toBeInTheDocument();
  });

  it("el segmento de la URL queda elegido", async () => {
    parametros = new URLSearchParams(`${CLASIFICACION}&segmento=Q2`);
    pintar();
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    expect(screen.getByLabelText("Vuelta")).toHaveValue("Q2");
  });

  it("un segmento que no es de esta sesión se muestra como mejor vuelta", async () => {
    parametros = new URLSearchParams(`${CLASIFICACION}&segmento=SQ1`);
    pintar();
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    expect(screen.getByLabelText("Vuelta")).toHaveValue("");
  });

  it("elegir un segmento lo guarda en la URL con los pilotos", async () => {
    parametros = new URLSearchParams(`${CLASIFICACION}&piloto_a=1&piloto_b=16`);
    pintar();
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    await userEvent.selectOptions(screen.getByLabelText("Vuelta"), "Q1");

    expect(reemplazar).toHaveBeenCalledWith({
      pathname: "/telemetria",
      query: { anio: "2024", evento: "1229", sesion: "9468", piloto_a: "1", piloto_b: "16", segmento: "Q1" },
    });
  });

  it("volver a «mejor de la sesión» quita el segmento de la URL", async () => {
    parametros = new URLSearchParams(`${CLASIFICACION}&piloto_a=1&piloto_b=16&segmento=Q3`);
    pintar();
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    await userEvent.selectOptions(screen.getByLabelText("Vuelta"), "");

    expect(reemplazar).toHaveBeenCalledWith({
      pathname: "/telemetria",
      query: { anio: "2024", evento: "1229", sesion: "9468", piloto_a: "1", piloto_b: "16" },
    });
  });

  it("al cambiar de sesión se borran los pilotos y el segmento", async () => {
    parametros = new URLSearchParams(`${CLASIFICACION}&piloto_a=1&piloto_b=16&segmento=Q3`);
    pintar();
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    await userEvent.selectOptions(screen.getByLabelText("Sesión"), "9472");

    expect(reemplazar).toHaveBeenCalledWith({
      pathname: "/telemetria",
      query: { anio: "2024", evento: "1229", sesion: "9472" },
    });
  });

  it("los nombres están traducidos al inglés", async () => {
    pintar("en");
    await screen.findAllByRole("option", { name: "VER · Max VERSTAPPEN" });

    expect(screen.getByLabelText("Driver A (reference)")).toBeInTheDocument();
    expect(screen.getByLabelText("Lap")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Best of the session" })).toBeInTheDocument();
  });
});
