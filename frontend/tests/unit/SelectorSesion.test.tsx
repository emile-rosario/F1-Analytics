import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SelectorSesion from "@/components/SelectorSesion";
import { ErrorApi, type Evento, type Piloto, type Sesion } from "@/lib/api";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

const reemplazar = vi.fn();
let parametros = new URLSearchParams();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: reemplazar }),
  usePathname: () => "/",
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

const MONZA: Evento = {
  evento: 1244,
  nombre: "Italian Grand Prix",
  nombre_oficial: "FORMULA 1 PIRELLI GRAN PREMIO D ITALIA 2024",
  pais: "Italy",
  circuito: "Monza",
  circuito_clave: 39,
  inicio: "2024-08-30T11:30:00Z",
};
const sesion = (id: number, nombre: string, terminada: boolean): Sesion => ({
  sesion: id,
  nombre,
  tipo: nombre,
  inicio: "2024-08-31T14:00:00Z",
  fin: "2024-08-31T15:00:00Z",
  evento: 1244,
  anio: 2024,
  terminada,
});
const SESIONES = [sesion(9586, "Qualifying", true), sesion(9590, "Race", false)];
const PILOTOS: Piloto[] = [
  { numero: 1, codigo: "VER", nombre: "Max VERSTAPPEN", equipo: "Red Bull Racing", color: "#3671C6" },
  { numero: 16, codigo: "LEC", nombre: "Charles LECLERC", equipo: "Ferrari", color: "#E80020" },
];

function pintar(idioma: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={idioma} messages={idioma === "es" ? es : en}>
      <SelectorSesion />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  parametros = new URLSearchParams("anio=2024");
  api.pedirCalendario.mockResolvedValue([MONZA]);
  api.pedirSesiones.mockResolvedValue(SESIONES);
  api.pedirPilotos.mockResolvedValue(PILOTOS);
});

describe("SelectorSesion", () => {
  it("pide el calendario del año de la URL y lista los Grandes Premios", async () => {
    pintar();

    expect(await screen.findByRole("option", { name: "Italian Grand Prix" })).toBeInTheDocument();
    expect(api.pedirCalendario).toHaveBeenCalledWith(2024);
    expect(screen.getByLabelText("Sesión")).toBeDisabled();
  });

  it("al elegir un Gran Premio guarda la elección en la URL", async () => {
    pintar();
    await screen.findByRole("option", { name: "Italian Grand Prix" });

    await userEvent.selectOptions(screen.getByLabelText("Gran Premio"), "1244");

    expect(reemplazar).toHaveBeenCalledWith({
      pathname: "/",
      query: { anio: "2024", evento: "1244" },
    });
  });

  it("al cambiar de año se borran el Gran Premio y la sesión", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1244&sesion=9586");
    pintar();

    await userEvent.selectOptions(screen.getByLabelText("Año"), "2023");

    expect(reemplazar).toHaveBeenCalledWith({ pathname: "/", query: { anio: "2023" } });
  });

  it("deja elegir solo sesiones terminadas y traduce sus nombres", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1244");
    pintar();

    expect(await screen.findByRole("option", { name: "Clasificación" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "Carrera (sin terminar)" })).toBeDisabled();
  });

  it("muestra la sesión elegida y sus pilotos", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1244&sesion=9586");
    pintar();

    expect(
      await screen.findByRole("heading", { name: /Italian Grand Prix · Clasificación/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText("VER")).toBeInTheDocument();
    expect(screen.getByText("Ferrari")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pilotos (2)" })).toBeInTheDocument();
    expect(api.pedirPilotos).toHaveBeenCalledWith(9586);
  });

  it("no pide pilotos de una sesión que no terminó aunque venga en la URL", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1244&sesion=9590");
    pintar();
    await screen.findByRole("option", { name: "Clasificación" });

    expect(api.pedirPilotos).not.toHaveBeenCalled();
  });

  it("ignora un año fuera de rango", async () => {
    parametros = new URLSearchParams("anio=1999");
    pintar();

    await waitFor(() => expect(api.pedirCalendario).toHaveBeenCalled());
    expect(api.pedirCalendario).toHaveBeenCalledWith(new Date().getFullYear());
  });

  it.each([
    ["es", "Hay una sesión de F1 en vivo"],
    ["en", "A live F1 session is in progress"],
  ] as const)(
    "explica en %s que OpenF1 está bloqueado por una sesión en vivo",
    async (idioma, texto) => {
      api.pedirCalendario.mockRejectedValue(new ErrorApi("openf1_en_vivo", 503));
      pintar(idioma);

      expect(await screen.findByRole("alert")).toHaveTextContent(texto);
    },
  );

  it("permite reintentar cuando falla la carga", async () => {
    api.pedirCalendario.mockRejectedValueOnce(new ErrorApi("fallo_openf1", 503));
    pintar();
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("option", { name: "Italian Grand Prix" })).toBeInTheDocument();
  });
});
