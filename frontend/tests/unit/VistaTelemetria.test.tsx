import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VistaTelemetria from "@/components/VistaTelemetria";
import { ErrorApi } from "@/lib/api";
import { COLORES_PILOTO } from "@/lib/colores";
import { SESION_DESTACADA_TELEMETRIA } from "@/lib/telemetria";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { crearAnalisisTelemetria } from "./datos";

const reemplazar = vi.fn();
let parametros = new URLSearchParams();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: reemplazar }),
  usePathname: () => "/telemetria",
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => parametros }));

const api = vi.hoisted(() => ({
  pedirCalendario: vi.fn(),
  pedirSesiones: vi.fn(),
  pedirPilotos: vi.fn(),
  pedirAnalisisTelemetria: vi.fn(),
}));
vi.mock("@/lib/api", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

const pintar = (idioma: "es" | "en" = "es") =>
  render(
    <NextIntlClientProvider locale={idioma} messages={idioma === "es" ? es : en}>
      <VistaTelemetria />
    </NextIntlClientProvider>,
  );

const URL_COMPLETA = "anio=2024&evento=1229&sesion=9468&piloto_a=1&piloto_b=16&segmento=Q3";

beforeEach(() => {
  vi.clearAllMocks();
  parametros = new URLSearchParams(URL_COMPLETA);
  api.pedirCalendario.mockResolvedValue([]);
  api.pedirSesiones.mockResolvedValue([]);
  api.pedirPilotos.mockResolvedValue([]);
  api.pedirAnalisisTelemetria.mockResolvedValue(crearAnalisisTelemetria());
});

const esperarAnalisis = () => screen.findByRole("heading", { name: "Las dos vueltas, metro a metro" });
const cursor = () => screen.getByRole("slider", { name: "Posición en la vuelta" });

describe("VistaTelemetria", () => {
  it("sin ninguna elección abre la sesión destacada", async () => {
    parametros = new URLSearchParams();
    pintar();

    await waitFor(() =>
      expect(reemplazar).toHaveBeenCalledWith({
        pathname: "/telemetria",
        query: SESION_DESTACADA_TELEMETRIA,
      }),
    );
    expect(api.pedirAnalisisTelemetria).not.toHaveBeenCalled();
  });

  it("la sesión destacada es Bahréin 2024, VER contra LEC en la Q3", () => {
    expect(SESION_DESTACADA_TELEMETRIA).toEqual({
      anio: "2024",
      evento: "1229",
      sesion: "9468",
      piloto_a: "1",
      piloto_b: "16",
      segmento: "Q3",
    });
  });

  it("con todo en la URL pide el análisis con el segmento y lo muestra", async () => {
    pintar();

    await esperarAnalisis();
    expect(api.pedirAnalisisTelemetria).toHaveBeenCalledWith(9468, 1, 16, "Q3");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "¿Dónde le gana tiempo un piloto a otro?",
    );
    expect(screen.getByText("Referencia")).toBeInTheDocument();
    expect(screen.getByText("Comparado")).toBeInTheDocument();
    expect(screen.getByText("1:29,179")).toBeInTheDocument();
    expect(screen.getByText("1:29,407")).toBeInTheDocument();
  });

  it("sin segmento en la URL no manda ninguno", async () => {
    parametros = new URLSearchParams("anio=2024&evento=1229&sesion=9468&piloto_a=1&piloto_b=16");
    pintar();

    await esperarAnalisis();
    expect(api.pedirAnalisisTelemetria).toHaveBeenCalledWith(9468, 1, 16, null);
  });

  it.each([
    ["falta el piloto B", "anio=2024&evento=1229&sesion=9468&piloto_a=1"],
    ["falta el piloto A", "anio=2024&evento=1229&sesion=9468&piloto_b=16"],
    ["falta la sesión", "anio=2024&piloto_a=1&piloto_b=16"],
    ["los dos pilotos son el mismo", "anio=2024&evento=1229&sesion=9468&piloto_a=1&piloto_b=1"],
  ])("no pide nada si %s", async (_, consulta) => {
    parametros = new URLSearchParams(consulta);
    pintar();

    await waitFor(() => expect(api.pedirCalendario).toHaveBeenCalled());
    expect(api.pedirAnalisisTelemetria).not.toHaveBeenCalled();
  });

  it("un error de la API se explica y se puede reintentar", async () => {
    api.pedirAnalisisTelemetria.mockRejectedValueOnce(new ErrorApi("sin_telemetria", 404));
    pintar();

    expect(await screen.findByRole("alert")).toHaveTextContent("No hay telemetría para esa selección.");
    api.pedirAnalisisTelemetria.mockResolvedValue(crearAnalisisTelemetria());
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await esperarAnalisis();
    expect(api.pedirAnalisisTelemetria).toHaveBeenCalledTimes(2);
  });
});

describe("conclusión", () => {
  it("nombra al ganador, su diferencia y cuántos tramos ganó cada uno", async () => {
    pintar();
    await esperarAnalisis();

    expect(screen.getByText("VER fue 0,228 s más rápido que LEC")).toBeInTheDocument();
    expect(
      screen.getByText("VER ganó 12 de los 25 tramos, LEC ganó 7 y 6 quedaron empatados."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/VER sacó más tiempo entre los 120 y los 160 m \(0,196 s en ese tramo\)\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/LEC sacó más tiempo entre los 560 y los 600 m/)).toBeInTheDocument();
  });

  it("si gana B, lo nombra a él primero", async () => {
    const base = crearAnalisisTelemetria();
    api.pedirAnalisisTelemetria.mockResolvedValue({
      ...base,
      resumen: {
        ...base.resumen,
        delta_final_s: -0.114,
        ganador: "b",
        sectores_ganados: { a: 5, b: 15, empate: 5 },
      },
    });
    pintar();
    await esperarAnalisis();

    expect(screen.getByText("LEC fue 0,114 s más rápido que VER")).toBeInTheDocument();
    expect(
      screen.getByText("LEC ganó 15 de los 25 tramos, VER ganó 5 y 5 quedaron empatados."),
    ).toBeInTheDocument();
  });

  it("un tramo ganado por uno solo se dice en singular", async () => {
    const base = crearAnalisisTelemetria();
    api.pedirAnalisisTelemetria.mockResolvedValue({
      ...base,
      resumen: { ...base.resumen, sectores_ganados: { a: 12, b: 12, empate: 1 } },
    });
    pintar();
    await esperarAnalisis();

    expect(screen.getByText(/y uno quedó empatado\./)).toBeInTheDocument();
  });

  it("cuando la diferencia es mínima no nombra ganador, lo avisa y abre las salvedades", async () => {
    const base = crearAnalisisTelemetria();
    api.pedirAnalisisTelemetria.mockResolvedValue({
      ...base,
      resumen: { ...base.resumen, delta_final_s: 0.004, ganador: "empate" },
    });
    pintar();
    await esperarAnalisis();

    const nota = screen.getByRole("note");
    expect(nota).toHaveTextContent("Las dos vueltas fueron casi iguales");
    expect(nota).toHaveTextContent("La diferencia fue de 0,004 s");
    expect(screen.queryByText(/fue .* s más rápido que/)).not.toBeInTheDocument();
    expect(screen.getByText("Qué no mide este análisis").closest("details")).toHaveAttribute("open");
  });

  it("en inglés usa sus plantillas y el punto decimal", async () => {
    parametros = new URLSearchParams(URL_COMPLETA);
    pintar("en");

    expect(await screen.findByText("VER was 0.228 s faster than LEC")).toBeInTheDocument();
    expect(
      screen.getByText("VER won 12 of the 25 stretches, LEC won 7 and 6 were ties."),
    ).toBeInTheDocument();
    expect(screen.getByText("Reference")).toBeInTheDocument();
  });

  it("las salvedades empiezan cerradas cuando hay un ganador", async () => {
    pintar();
    await esperarAnalisis();

    const detalles = screen.getByText("Qué no mide este análisis").closest("details");
    expect(detalles).not.toHaveAttribute("open");
    expect(within(detalles!).getByText(/unos 0,04 s de media/)).toBeInTheDocument();
  });
});

describe("gráficas y cursor", () => {
  const lectura = () => screen.getByRole("group", { name: "Valores en la posición elegida" });

  it("el cursor empieza en la meta, donde el delta es la diferencia oficial", async () => {
    pintar();
    await esperarAnalisis();

    expect(cursor()).toHaveValue("40");
    expect(lectura()).toHaveTextContent("A 1000 m de la meta");
    expect(lectura()).toHaveTextContent("Diferencia: 0,228 s · VER por delante");
  });

  it("mover el deslizador cambia los valores de los dos pilotos y el delta", async () => {
    pintar();
    await esperarAnalisis();

    fireEvent.change(cursor(), { target: { value: "0" } });

    expect(lectura()).toHaveTextContent("A 0 m de la meta");
    expect(lectura()).toHaveTextContent("Diferencia: ninguna");
    const tabla = within(lectura()).getByRole("table");
    const filas = within(tabla).getAllByRole("row");
    expect(filas).toHaveLength(3); // encabezado, VER y LEC
    expect(filas[1]).toHaveTextContent("VER");
    expect(filas[1]).toHaveTextContent("200 km/h");
    expect(filas[2]).toHaveTextContent("LEC");
    expect(filas[2]).toHaveTextContent("198 km/h");
  });

  it("la lectura dice si cada piloto está frenando", async () => {
    pintar();
    await esperarAnalisis();

    fireEvent.change(cursor(), { target: { value: "10" } }); // frena VER, LEC todavía no

    const filas = within(within(lectura()).getByRole("table")).getAllByRole("row");
    expect(filas[1]).toHaveTextContent("Sí");
    expect(filas[2]).toHaveTextContent("No");
  });

  it("el deslizador anuncia el punto con las velocidades y el delta", async () => {
    pintar();
    await esperarAnalisis();

    fireEvent.change(cursor(), { target: { value: "20" } });

    expect(cursor()).toHaveAttribute(
      "aria-valuetext",
      expect.stringMatching(/^500 m desde la meta: VER \d+ km\/h, LEC \d+ km\/h, diferencia \+0,114 s$/),
    );
  });

  it("dibuja un tramo de freno por piloto y cada uno con su color", async () => {
    pintar();
    await esperarAnalisis();

    const tramos = [...screen.getByTestId("frenos").querySelectorAll("rect")];
    expect(tramos).toHaveLength(2);
    expect(tramos.map((r) => r.getAttribute("fill"))).toEqual([COLORES_PILOTO.a, COLORES_PILOTO.b]);
  });

  it("las gráficas tienen un nombre que incluye a los pilotos y la conclusión", async () => {
    pintar();
    await esperarAnalisis();

    const grafica = screen.getByRole("img", { name: /VER y LEC a lo largo de la vuelta/ });
    expect(grafica).toHaveAccessibleName(expect.stringContaining("VER fue 0,228 s más rápido que LEC"));
    expect(screen.getByRole("region", { name: "Gráficas con desplazamiento horizontal" })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });
});

/**
 * El desplazamiento del tooltip como [x, y], sin depender de cómo lo escribe jsdom: según la
 * versión `translate(0, 0)` sale como `translate(0px)` o `translate(-100%, 0)` como `translate(-100%)`.
 */
function desplazamientoDelTooltip(): string[] {
  const dentro = /^translate\((.*)\)$/.exec(screen.getByTestId("tooltip-telemetria").style.transform);
  const [x, y = "0"] = (dentro?.[1] ?? "").split(",").map((p) => p.trim().replace(/^0px$/, "0"));
  return [x, y];
}

describe("tooltip al pasar el mouse", () => {
  const canales = crearAnalisisTelemetria().canales;
  // La gráfica mide 800 × 600 px en pantalla, así que un píxel es una unidad del SVG (ANCHO = 800).
  // El eje va de x = 84 (0 m) a x = 780 (1000 m): cada 25 m son 17,4 px.
  const xDe = (metros: number) => 84 + (metros / 1000) * 696;

  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const zona = () => screen.getByTestId("zona-cursor");
  const mouse = (metros: number, y = 100) =>
    fireEvent.pointerMove(zona(), { pointerType: "mouse", clientX: xDe(metros), clientY: y });

  it("no se ve hasta que el mouse pasa por la gráfica", async () => {
    pintar();
    await esperarAnalisis();

    expect(screen.queryByTestId("tooltip-telemetria")).not.toBeInTheDocument();
  });

  it("muestra la distancia, los dos pilotos y la diferencia del punto", async () => {
    pintar();
    await esperarAnalisis();

    mouse(500);

    const tooltip = screen.getByTestId("tooltip-telemetria");
    expect(tooltip).toHaveTextContent("A 500 m de la meta");
    expect(tooltip).toHaveTextContent(`VER${canales.velocidad_a[20]} km/h · ${canales.acelerador_a[20]} %`);
    expect(tooltip).toHaveTextContent(`LEC${canales.velocidad_b[20]} km/h · ${canales.acelerador_b[20]} %`);
    expect(tooltip).toHaveTextContent("Diferencia: 0,114 s · VER por delante");
    expect(cursor()).toHaveValue("20");
  });

  it("está oculto para los lectores de pantalla, que ya tienen el deslizador y la tabla", async () => {
    pintar();
    await esperarAnalisis();

    mouse(500);

    expect(screen.getByTestId("tooltip-telemetria")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("sigue al mouse y se actualiza con cada punto", async () => {
    pintar();
    await esperarAnalisis();

    mouse(250);
    expect(screen.getByTestId("tooltip-telemetria")).toHaveTextContent("A 250 m de la meta");
    mouse(750);
    expect(screen.getByTestId("tooltip-telemetria")).toHaveTextContent("A 750 m de la meta");
  });

  it("dice qué piloto está frenando y no menciona al que no frena", async () => {
    pintar();
    await esperarAnalisis();

    mouse(250); // frena VER (i = 10), LEC todavía no

    const filas = within(screen.getByTestId("tooltip-telemetria")).getAllByText(/km\/h/);
    expect(filas[0].parentElement).toHaveTextContent("frenando");
    expect(filas[1].parentElement).not.toHaveTextContent("frenando");
  });

  it("desaparece al sacar el mouse de la gráfica", async () => {
    pintar();
    await esperarAnalisis();
    mouse(500);

    fireEvent.pointerLeave(zona());

    expect(screen.queryByTestId("tooltip-telemetria")).not.toBeInTheDocument();
  });

  it("con el tacto mueve el cursor pero no muestra el tooltip", async () => {
    pintar();
    await esperarAnalisis();

    fireEvent.pointerDown(zona(), { pointerType: "touch", clientX: xDe(500), clientY: 100 });

    expect(cursor()).toHaveValue("20");
    expect(screen.queryByTestId("tooltip-telemetria")).not.toBeInTheDocument();
  });

  it("queda a la derecha y debajo del puntero, y se voltea cerca de los bordes derecho e inferior", async () => {
    pintar();
    await esperarAnalisis();

    mouse(100, 100);
    expect(desplazamientoDelTooltip()).toEqual(["0", "0"]);

    mouse(950, 100);
    expect(desplazamientoDelTooltip()).toEqual(["-100%", "0"]);

    mouse(100, 500);
    expect(desplazamientoDelTooltip()).toEqual(["0", "-100%"]);
  });

  it("está traducido al inglés", async () => {
    pintar("en");
    await screen.findByRole("heading", { name: "The two laps, metre by metre" });

    mouse(250);

    expect(screen.getByTestId("tooltip-telemetria")).toHaveTextContent("250 m from the line");
    expect(screen.getByTestId("tooltip-telemetria")).toHaveTextContent("braking");
  });
});

describe("zoom por rango", () => {
  // Misma caja simulada que en el tooltip: 800 × 600 px, un píxel por unidad del SVG.
  const xDe = (metros: number, desde = 0, hasta = 1000) => 84 + ((metros - desde) / (hasta - desde)) * 696;

  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const desde = () => screen.getByRole("slider", { name: "Desde" });
  const hasta = () => screen.getByRole("slider", { name: "Hasta" });
  const estado = () => screen.getByRole("status");
  const restablecer = () => screen.getByRole("button", { name: "Toda la vuelta" });
  const zona = () => screen.getByTestId("zona-cursor");
  const marcas = () => screen.getAllByTestId("marca-x").map((m) => m.textContent);
  const mouse = (tipo: "pointerDown" | "pointerMove" | "pointerUp", metros: number) =>
    fireEvent[tipo](zona(), { pointerType: "mouse", button: 0, clientX: xDe(metros), clientY: 100 });

  it("empieza con la vuelta entera y el botón de restablecer apagado", async () => {
    pintar();
    await esperarAnalisis();

    expect(estado()).toHaveTextContent("Mostrando la vuelta entera (1000 m)");
    expect(restablecer()).toBeDisabled();
    expect(desde()).toHaveValue("0");
    expect(hasta()).toHaveValue("1000");
    expect(marcas().at(0)).toBe("0");
    expect(marcas().at(-1)).toBe("1000");
  });

  it("los deslizadores tienen nombre y dicen los metros", async () => {
    pintar();
    await esperarAnalisis();

    fireEvent.change(desde(), { target: { value: "400" } });

    expect(desde()).toHaveAttribute("aria-valuetext", "400 m de la meta");
    expect(hasta()).toHaveAttribute("aria-valuetext", "1000 m de la meta");
  });

  it("elegir «desde» acerca el eje y lo dice", async () => {
    pintar();
    await esperarAnalisis();

    fireEvent.change(desde(), { target: { value: "400" } });

    expect(estado()).toHaveTextContent("Mostrando de 400 a 1000 m de la meta");
    expect(marcas()).toEqual(["400", "500", "600", "700", "800", "900", "1000"]);
    expect(restablecer()).toBeEnabled();
  });

  it("el cursor se queda dentro del tramo y su deslizador solo recorre ese tramo", async () => {
    pintar();
    await esperarAnalisis();
    expect(cursor()).toHaveValue("40"); // en la meta, a 1000 m

    fireEvent.change(hasta(), { target: { value: "600" } });

    expect(cursor()).toHaveValue("24"); // 600 m
    expect(cursor()).toHaveAttribute("min", "0");
    expect(cursor()).toHaveAttribute("max", "24");

    fireEvent.change(desde(), { target: { value: "400" } });
    expect(cursor()).toHaveAttribute("min", "16");
    expect(cursor()).toHaveAttribute("max", "24");
    fireEvent.change(cursor(), { target: { value: "16" } });
    expect(screen.getByRole("group", { name: "Valores en la posición elegida" })).toHaveTextContent(
      "A 400 m de la meta",
    );
  });

  it("no deja acercar a menos de 100 m", async () => {
    pintar();
    await esperarAnalisis();
    fireEvent.change(desde(), { target: { value: "500" } });

    fireEvent.change(hasta(), { target: { value: "520" } });

    expect(estado()).toHaveTextContent("Mostrando de 500 a 600 m de la meta");
  });

  it("si «desde» pasa a «hasta», cede «desde»", async () => {
    pintar();
    await esperarAnalisis();
    fireEvent.change(hasta(), { target: { value: "600" } });

    fireEvent.change(desde(), { target: { value: "590" } });

    expect(estado()).toHaveTextContent("Mostrando de 500 a 600 m de la meta");
  });

  it("«Toda la vuelta» vuelve a la vuelta entera sin mover el cursor", async () => {
    pintar();
    await esperarAnalisis();
    fireEvent.change(desde(), { target: { value: "400" } });
    fireEvent.change(hasta(), { target: { value: "600" } });
    fireEvent.change(cursor(), { target: { value: "18" } });

    fireEvent.click(restablecer());

    expect(estado()).toHaveTextContent("Mostrando la vuelta entera (1000 m)");
    expect(restablecer()).toBeDisabled();
    expect(marcas().at(0)).toBe("0");
    expect(cursor()).toHaveValue("18");
    expect(cursor()).toHaveAttribute("max", "40");
  });

  it("al acercar, la gráfica recorta lo que queda fuera del tramo", async () => {
    pintar();
    await esperarAnalisis();

    fireEvent.change(desde(), { target: { value: "400" } });

    const recorte = document.querySelector("clipPath");
    expect(recorte).not.toBeNull();
    // Las líneas de velocidad y de acelerador, los frenos y el delta usan ese recorte.
    expect(document.querySelectorAll(`[clip-path="url(#${recorte!.id})"]`).length).toBeGreaterThanOrEqual(4);
  });

  it("arrastrar con el mouse dibuja una banda y al soltar acerca ese tramo", async () => {
    pintar();
    await esperarAnalisis();

    mouse("pointerDown", 250);
    mouse("pointerMove", 500);
    expect(screen.getByTestId("banda-zoom")).toBeInTheDocument();
    expect(estado()).toHaveTextContent("Mostrando la vuelta entera (1000 m)");
    mouse("pointerUp", 500);

    expect(screen.queryByTestId("banda-zoom")).not.toBeInTheDocument();
    expect(estado()).toHaveTextContent("Mostrando de 250 a 500 m de la meta");
    expect(desde()).toHaveValue("250");
    expect(hasta()).toHaveValue("500");
  });

  it("arrastrar de derecha a izquierda da el mismo tramo", async () => {
    pintar();
    await esperarAnalisis();

    mouse("pointerDown", 500);
    mouse("pointerMove", 250);
    mouse("pointerUp", 250);

    expect(estado()).toHaveTextContent("Mostrando de 250 a 500 m de la meta");
  });

  it("un arrastre muy corto se ensancha hasta el mínimo de 100 m", async () => {
    pintar();
    await esperarAnalisis();

    mouse("pointerDown", 250);
    mouse("pointerMove", 264); // unos 10 px
    mouse("pointerUp", 264);

    expect(estado()).toHaveTextContent("Mostrando de 250 a 350 m de la meta");
  });

  it("un clic sin arrastrar solo mueve el cursor", async () => {
    pintar();
    await esperarAnalisis();

    mouse("pointerDown", 500);
    mouse("pointerMove", 502); // 2 px: menos que el umbral
    mouse("pointerUp", 502);

    expect(estado()).toHaveTextContent("Mostrando la vuelta entera (1000 m)");
    expect(cursor()).toHaveValue("20");
  });

  it("durante el arrastre no se muestra el tooltip", async () => {
    pintar();
    await esperarAnalisis();
    mouse("pointerMove", 100);
    expect(screen.getByTestId("tooltip-telemetria")).toBeInTheDocument();

    mouse("pointerDown", 100);
    mouse("pointerMove", 400);

    expect(screen.queryByTestId("tooltip-telemetria")).not.toBeInTheDocument();
  });

  it("con el tacto no hay arrastre: no dibuja banda ni acerca", async () => {
    pintar();
    await esperarAnalisis();

    fireEvent.pointerDown(zona(), { pointerType: "touch", clientX: xDe(250), clientY: 100 });
    fireEvent.pointerMove(zona(), { pointerType: "touch", clientX: xDe(500), clientY: 100 });
    fireEvent.pointerUp(zona(), { pointerType: "touch", clientX: xDe(500), clientY: 100 });

    expect(screen.queryByTestId("banda-zoom")).not.toBeInTheDocument();
    expect(estado()).toHaveTextContent("Mostrando la vuelta entera (1000 m)");
  });

  it("con el tramo acercado, el mouse y el tooltip usan la escala del tramo", async () => {
    pintar();
    await esperarAnalisis();
    fireEvent.change(desde(), { target: { value: "400" } });
    fireEvent.change(hasta(), { target: { value: "600" } });

    fireEvent.pointerMove(zona(), { pointerType: "mouse", clientX: xDe(500, 400, 600), clientY: 100 });

    expect(screen.getByTestId("tooltip-telemetria")).toHaveTextContent("A 500 m de la meta");
    expect(cursor()).toHaveValue("20");
  });

  it("está traducido al inglés", async () => {
    pintar("en");
    await screen.findByRole("heading", { name: "The two laps, metre by metre" });

    expect(screen.getByRole("status")).toHaveTextContent("Showing the whole lap (1,000 m)");
    fireEvent.change(screen.getByRole("slider", { name: "From" }), { target: { value: "400" } });

    expect(screen.getByRole("status")).toHaveTextContent("Showing 400 to 1,000 m from the line");
    expect(screen.getByRole("button", { name: "Whole lap" })).toBeEnabled();
  });
});

describe("descarga de las gráficas", () => {
  it("ofrece bajar las gráficas y el mapa de tramos como PNG", async () => {
    pintar();
    await esperarAnalisis();

    expect(screen.getByRole("button", { name: "Descargar PNG de las gráficas de telemetría" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar PNG del mapa de tramos" })).toBeInTheDocument();
  });

  it("las marcas del cursor, el tooltip y la banda no van a la imagen", async () => {
    pintar();
    await esperarAnalisis();

    // Marcados para que `descargarPng` los esconda mientras captura.
    expect(screen.getByTestId("cursor")).toHaveAttribute("data-no-exportar");
    expect(screen.getByTestId("punto-cursor")).toHaveAttribute("data-no-exportar");
  });
});

describe("circuito nuevo, sin curvas numeradas", () => {
  it("avisa que el mapa no lleva números de curva y sigue mostrando la comparación", async () => {
    api.pedirAnalisisTelemetria.mockResolvedValue(crearAnalisisTelemetria({ curvas: [] }));
    pintar();
    await esperarAnalisis();

    expect(screen.getByTestId("aviso-circuito-nuevo")).toHaveTextContent(
      "Este circuito es nuevo y todavía no tenemos sus curvas numeradas",
    );
    expect(screen.getByText("VER fue 0,228 s más rápido que LEC")).toBeInTheDocument();
    expect(screen.getByTestId("tramos").querySelectorAll("polyline")).toHaveLength(25);
  });

  it("en inglés el aviso sale en inglés", async () => {
    api.pedirAnalisisTelemetria.mockResolvedValue(crearAnalisisTelemetria({ curvas: [] }));
    pintar("en");

    expect(await screen.findByTestId("aviso-circuito-nuevo")).toHaveTextContent(
      "This circuit is new and we do not have its numbered turns yet",
    );
  });

  it("con las curvas numeradas no aparece el aviso", async () => {
    pintar();
    await esperarAnalisis();

    expect(screen.queryByTestId("aviso-circuito-nuevo")).not.toBeInTheDocument();
  });
});

describe("mapa de minisectores", () => {
  it("pinta un tramo por minisector con el color de su ganador", async () => {
    pintar();
    await esperarAnalisis();

    const tramos = [...screen.getByTestId("tramos").querySelectorAll("polyline")];
    expect(tramos).toHaveLength(25);
    const colores = (ganador: string) =>
      tramos.filter((t) => t.dataset.ganador === ganador).map((t) => t.getAttribute("stroke"));
    expect(colores("a")).toEqual(Array(12).fill(COLORES_PILOTO.a));
    expect(colores("b")).toEqual(Array(7).fill(COLORES_PILOTO.b));
    expect(colores("empate")).toEqual(Array(6).fill(COLORES_PILOTO.empate));
  });

  it("la leyenda cuenta los tramos ganados por cada piloto", async () => {
    pintar();
    await esperarAnalisis();

    const leyenda = screen.getByRole("list", { name: "Tramos ganados" });
    expect(within(leyenda).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "VER: 12",
      "LEC: 7",
      "Empate: 6",
    ]);
  });

  it("sin empates la leyenda no los menciona", async () => {
    const base = crearAnalisisTelemetria();
    api.pedirAnalisisTelemetria.mockResolvedValue({
      ...base,
      resumen: { ...base.resumen, sectores_ganados: { a: 13, b: 12, empate: 0 } },
    });
    pintar();
    await esperarAnalisis();

    expect(screen.queryByText(/Empate: /)).not.toBeInTheDocument();
  });

  it("el punto del mapa sigue al cursor de las gráficas", async () => {
    pintar();
    await esperarAnalisis();
    const punto = screen.getByTestId("punto-cursor");
    const alFinal = [punto.getAttribute("cx"), punto.getAttribute("cy")];

    fireEvent.change(cursor(), { target: { value: "10" } });

    expect([punto.getAttribute("cx"), punto.getAttribute("cy")]).not.toEqual(alFinal);
  });

  it("explica cómo se reparten los tramos y el empate", async () => {
    pintar();
    await esperarAnalisis();

    expect(
      screen.getByText(/La vuelta se parte en 25 tramos iguales\..*menor de 0,010 s se cuenta como empate\./),
    ).toBeInTheDocument();
  });
});

describe("ayuda del glosario", () => {
  it("las dos secciones ofrecen sus términos", async () => {
    pintar();
    await esperarAnalisis();

    const gruposEtiquetados = screen.getAllByRole("group", { name: "Qué significa" });
    expect(gruposEtiquetados.map((g) => Array.from(g.querySelectorAll("button")).map((b) => b.textContent))).toEqual([
      ["Diferencia de tiempo (delta)", "Telemetría"],
      ["Tramo"],
    ]);
  });

  it("las salvedades explican el delta, la telemetría y los tramos", async () => {
    pintar();
    await esperarAnalisis();

    await userEvent.click(screen.getByRole("button", { name: "delta" }));
    await userEvent.click(screen.getByRole("button", { name: "telemetría" }));
    await userEvent.click(screen.getByRole("button", { name: "tramos" }));

    expect(screen.getByText(/acumulado desde la meta/)).toBeInTheDocument();
    expect(screen.getByText(/OpenF1 los publica unas 3,7 veces por segundo/)).toBeInTheDocument();
    expect(screen.getByText(/25 partes de igual longitud/)).toBeInTheDocument();
  });
});
