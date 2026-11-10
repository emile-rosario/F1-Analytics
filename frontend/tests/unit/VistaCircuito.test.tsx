import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TarjetasPreguntas from "@/components/TarjetasPreguntas";
import VistaCircuito, { SESION_DESTACADA } from "@/components/VistaCircuito";
import { ErrorApi } from "@/lib/api";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { crearAnalisis } from "./datos";

const reemplazar = vi.fn();
let parametros = new URLSearchParams();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: reemplazar }),
  usePathname: () => "/circuito",
  Link: ({
    href,
    children,
    ...resto
  }: {
    href: { pathname: string; query: Record<string, string> };
    children: ReactNode;
  }) => (
    <a href={`${href.pathname}?${new URLSearchParams(href.query)}`} {...resto}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => parametros }));

const api = vi.hoisted(() => ({
  pedirCalendario: vi.fn(),
  pedirSesiones: vi.fn(),
  pedirPilotos: vi.fn(),
  pedirAnalisisCircuito: vi.fn(),
}));
vi.mock("@/lib/api", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

function pintar(elemento: ReactNode, idioma: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={idioma} messages={idioma === "es" ? es : en}>
      {elemento}
    </NextIntlClientProvider>,
  );
}

const URL_COMPLETA = "anio=2024&evento=1244&sesion=9586&piloto=4";

beforeEach(() => {
  vi.clearAllMocks();
  parametros = new URLSearchParams(URL_COMPLETA);
  api.pedirCalendario.mockResolvedValue([]);
  api.pedirSesiones.mockResolvedValue([]);
  api.pedirPilotos.mockResolvedValue([]);
  api.pedirAnalisisCircuito.mockResolvedValue(crearAnalisis());
});

describe("VistaCircuito", () => {
  it("con sesión y piloto en la URL pide el análisis y muestra el resultado", async () => {
    pintar(<VistaCircuito />);

    expect(await screen.findByText("NOR")).toBeInTheDocument();
    expect(api.pedirAnalisisCircuito).toHaveBeenCalledWith(9586, 4);
    expect(screen.getByText("McLaren")).toBeInTheDocument();
    expect(screen.getByText("1:19,327")).toBeInTheDocument();
    expect(screen.getByText("Vuelta 11")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /vuelta más rápida de NOR coloreada por velocidad/ })).toBeInTheDocument();
    expect(screen.getByText(/La frenada más fuerte es la de la curva 1/)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("en inglés usa el punto decimal en el tiempo de vuelta", async () => {
    pintar(<VistaCircuito />, "en");

    expect(await screen.findByText("1:19.327")).toBeInTheDocument();
    expect(screen.getByText("Lap 11")).toBeInTheDocument();
  });

  it("sin ninguna elección abre la sesión destacada y no pide nada todavía", () => {
    parametros = new URLSearchParams();

    pintar(<VistaCircuito />);

    expect(reemplazar).toHaveBeenCalledWith({ pathname: "/circuito", query: SESION_DESTACADA });
    expect(api.pedirAnalisisCircuito).not.toHaveBeenCalled();
  });

  it("la sesión destacada es la pole de Monza 2024", () => {
    expect(SESION_DESTACADA).toEqual({ anio: "2024", evento: "1244", sesion: "9586", piloto: "4" });
  });

  it("con una elección incompleta no reemplaza la URL ni pide el análisis", () => {
    parametros = new URLSearchParams("anio=2024&evento=1244");

    pintar(<VistaCircuito />);

    expect(reemplazar).not.toHaveBeenCalled();
    expect(api.pedirAnalisisCircuito).not.toHaveBeenCalled();
  });

  it.each([
    ["es", "Hay una sesión de F1 en vivo"],
    ["en", "A live F1 session is in progress"],
  ] as const)("si OpenF1 está bloqueado por una sesión en vivo lo explica en %s", async (idioma, texto) => {
    api.pedirAnalisisCircuito.mockRejectedValue(new ErrorApi("openf1_en_vivo", 503));

    pintar(<VistaCircuito />, idioma);

    expect(await screen.findByRole("alert")).toHaveTextContent(texto);
  });

  it("avisa cuando se pasó el límite de peticiones y deja reintentar", async () => {
    api.pedirAnalisisCircuito.mockRejectedValueOnce(new ErrorApi("limite_peticiones", 429));
    pintar(<VistaCircuito />);
    expect(await screen.findByRole("alert")).toHaveTextContent("demasiadas consultas");

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("NOR")).toBeInTheDocument();
    expect(api.pedirAnalisisCircuito).toHaveBeenCalledTimes(2);
  });

  it("un circuito sin datos propios muestra el mensaje de análisis no disponible", async () => {
    api.pedirAnalisisCircuito.mockRejectedValue(new ErrorApi("analisis_no_disponible", 422));

    pintar(<VistaCircuito />);

    expect(await screen.findByRole("alert")).toHaveTextContent("no está disponible");
  });
});

describe("circuito nuevo, sin curvas numeradas", () => {
  function sinCurvas() {
    const base = crearAnalisis();
    return crearAnalisis({
      curvas: [],
      frenadas: [],
      resumen: { ...base.resumen, frenada_mas_fuerte: null },
    });
  }

  it("avisa que no hay curvas y reemplaza la tabla de frenadas", async () => {
    api.pedirAnalisisCircuito.mockResolvedValue(sinCurvas());
    pintar(<VistaCircuito />);

    expect(await screen.findByText("NOR")).toBeInTheDocument();
    expect(screen.getByTestId("aviso-circuito-nuevo")).toHaveTextContent(
      "Este circuito es nuevo y todavía no tenemos sus curvas numeradas",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    // No es que no se frenara: no se puede medir.
    expect(screen.getByText(/sin sus curvas numeradas no se pueden medir las frenadas/)).toBeInTheDocument();
    expect(screen.queryByText(/no se detectaron frenadas fuertes/)).not.toBeInTheDocument();
  });

  it("el mapa y el resumen siguen ahí", async () => {
    api.pedirAnalisisCircuito.mockResolvedValue(sinCurvas());
    pintar(<VistaCircuito />);

    expect(await screen.findByText("NOR")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /vuelta más rápida de NOR coloreada por velocidad/ })).toBeInTheDocument();
    expect(screen.getByText(/NOR fue a fondo el/)).toBeInTheDocument();
  });

  it("en inglés el aviso sale en inglés", async () => {
    api.pedirAnalisisCircuito.mockResolvedValue(sinCurvas());
    pintar(<VistaCircuito />, "en");

    expect(await screen.findByTestId("aviso-circuito-nuevo")).toHaveTextContent(
      "This circuit is new and we do not have its numbered turns yet",
    );
  });

  it("con las curvas numeradas no aparece el aviso y sí la tabla", async () => {
    pintar(<VistaCircuito />);

    expect(await screen.findByText("NOR")).toBeInTheDocument();
    expect(screen.queryByTestId("aviso-circuito-nuevo")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("pestañas del mapa", () => {
  async function conResultado() {
    pintar(<VistaCircuito />);
    await screen.findByText("NOR");
    return {
      velocidad: screen.getByRole("tab", { name: "Velocidad" }),
      marchas: screen.getByRole("tab", { name: "Marchas" }),
    };
  }

  it("empieza en velocidad", async () => {
    const { velocidad, marchas } = await conResultado();

    expect(velocidad).toHaveAttribute("aria-selected", "true");
    expect(marchas).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Velocidad");
  });

  it("al elegir marchas cambia el mapa y su descripción", async () => {
    const { marchas } = await conResultado();

    await userEvent.click(marchas);

    expect(marchas).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByRole("img", { name: /coloreada por marcha/ })).toBeInTheDocument();
    expect(within(panel).getByRole("list", { name: "Marchas usadas" })).toBeInTheDocument();
  });

  it("las flechas del teclado pasan de una pestaña a la otra", async () => {
    const { velocidad, marchas } = await conResultado();
    velocidad.focus();

    await userEvent.keyboard("{ArrowRight}");

    expect(marchas).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(marchas).toHaveFocus());

    await userEvent.keyboard("{ArrowLeft}");

    expect(velocidad).toHaveAttribute("aria-selected", "true");
  });

  it("solo la pestaña activa entra en el orden del tabulador", async () => {
    const { velocidad, marchas } = await conResultado();

    expect(velocidad).toHaveAttribute("tabindex", "0");
    expect(marchas).toHaveAttribute("tabindex", "-1");
  });
});

describe("TarjetasPreguntas", () => {
  it("la primera pregunta lleva al circuito conservando la elección de la URL", () => {
    pintar(<TarjetasPreguntas />);

    const enlace = screen.getByRole("link", { name: /¿Qué tan rápido va un F1/ });
    expect(enlace).toHaveAttribute("href", `/circuito?${URL_COMPLETA}`);
  });

  it("la segunda pregunta lleva a gomas conservando la elección de la URL", () => {
    pintar(<TarjetasPreguntas />);

    const enlace = screen.getByRole("link", { name: /¿Cuánto le costó a un piloto/ });
    expect(enlace).toHaveAttribute("href", `/gomas?${URL_COMPLETA}`);
  });

  it("la tercera pregunta lleva a telemetría conservando la elección de la URL", () => {
    pintar(<TarjetasPreguntas />);

    const enlace = screen.getByRole("link", { name: /¿Dónde le gana tiempo un piloto a otro/ });
    expect(enlace).toHaveAttribute("href", `/telemetria?${URL_COMPLETA}`);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByText("Próximamente")).not.toBeInTheDocument();
  });

  it("muestra el nivel de cada pregunta en el idioma elegido", () => {
    pintar(<TarjetasPreguntas />, "en");

    expect(screen.getByText("Level: Basic")).toBeInTheDocument();
    expect(screen.getByText("Level: Advanced")).toBeInTheDocument();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });
});
