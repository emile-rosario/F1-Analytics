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

function pintar(idioma: "es" | "en" = "es", conPiloto = false) {
  return render(
    <NextIntlClientProvider locale={idioma} messages={idioma === "es" ? es : en}>
      <SelectorSesion conPiloto={conPiloto} />
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

  it("sin piloto en el selector no se piden los pilotos", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1244&sesion=9586");
    pintar();
    await screen.findByRole("option", { name: "Clasificación" });

    expect(api.pedirPilotos).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Piloto")).not.toBeInTheDocument();
  });

  it("con piloto lista los pilotos de la sesión elegida", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1244&sesion=9586");
    pintar("es", true);

    expect(await screen.findByRole("option", { name: "VER · Max VERSTAPPEN" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "LEC · Charles LECLERC" })).toBeInTheDocument();
    expect(api.pedirPilotos).toHaveBeenCalledWith(9586);
  });

  it("el piloto de la URL queda elegido", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1244&sesion=9586&piloto=16");
    pintar("es", true);

    await screen.findByRole("option", { name: "LEC · Charles LECLERC" });

    expect(screen.getByLabelText("Piloto")).toHaveValue("16");
  });

  it("al elegir un piloto lo guarda en la URL junto al resto", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1244&sesion=9586");
    pintar("es", true);
    await screen.findByRole("option", { name: "VER · Max VERSTAPPEN" });

    await userEvent.selectOptions(screen.getByLabelText("Piloto"), "1");

    expect(reemplazar).toHaveBeenCalledWith({
      pathname: "/",
      query: { anio: "2024", evento: "1244", sesion: "9586", piloto: "1" },
    });
  });

  it("al cambiar de sesión se borra el piloto", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1244&sesion=9586&piloto=1");
    api.pedirSesiones.mockResolvedValue([...SESIONES, sesion(9591, "Practice 1", true)]);
    pintar("es", true);
    await screen.findByRole("option", { name: "Libres 1" });

    await userEvent.selectOptions(screen.getByLabelText("Sesión"), "9591");

    expect(reemplazar).toHaveBeenCalledWith({
      pathname: "/",
      query: { anio: "2024", evento: "1244", sesion: "9591" },
    });
  });

  it("el selector sin piloto no guarda el piloto en la URL", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1244&sesion=9586&piloto=1");
    pintar();
    await screen.findByRole("option", { name: "Clasificación" });

    await userEvent.selectOptions(screen.getByLabelText("Gran Premio"), "1244");

    expect(reemplazar).toHaveBeenCalledWith({
      pathname: "/",
      query: { anio: "2024", evento: "1244" },
    });
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
