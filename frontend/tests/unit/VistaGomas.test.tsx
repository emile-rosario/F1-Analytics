import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import VistaGomas from "@/components/VistaGomas";
import { ErrorApi } from "@/lib/api";
import { SESION_DESTACADA_GOMAS } from "@/lib/gomas";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { crearAnalisisGomas } from "./datos";

const reemplazar = vi.fn();
let parametros = new URLSearchParams();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: reemplazar }),
  usePathname: () => "/gomas",
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => parametros }));

const api = vi.hoisted(() => ({
  pedirCalendario: vi.fn(),
  pedirSesiones: vi.fn(),
  pedirPilotos: vi.fn(),
  pedirAnalisisGomas: vi.fn(),
}));
vi.mock("@/lib/api", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

const arbol = (idioma: "es" | "en" = "es") => (
  <NextIntlClientProvider locale={idioma} messages={idioma === "es" ? es : en}>
    <VistaGomas />
  </NextIntlClientProvider>
);

const pintar = (idioma: "es" | "en" = "es") => render(arbol(idioma));

const URL_COMPLETA = "anio=2024&evento=1238&sesion=9539";

beforeEach(() => {
  vi.clearAllMocks();
  parametros = new URLSearchParams(URL_COMPLETA);
  api.pedirCalendario.mockResolvedValue([]);
  api.pedirSesiones.mockResolvedValue([]);
  api.pedirPilotos.mockResolvedValue([]);
  api.pedirAnalisisGomas.mockResolvedValue(crearAnalisisGomas());
});

const fila = (nombre: RegExp) => screen.getByRole("button", { name: nombre });

describe("VistaGomas", () => {
  it("sin ninguna elección abre la carrera destacada", async () => {
    parametros = new URLSearchParams();
    pintar();

    await waitFor(() =>
      expect(reemplazar).toHaveBeenCalledWith({
        pathname: "/gomas",
        query: SESION_DESTACADA_GOMAS,
      }),
    );
    expect(api.pedirAnalisisGomas).not.toHaveBeenCalled();
  });

  it("con la sesión en la URL pide el análisis (sin pilotos, el podio) y lo muestra", async () => {
    pintar();

    expect(
      await screen.findByRole("heading", {
        name: "Estrategia de todos los pilotos",
      }),
    ).toBeInTheDocument();
    expect(api.pedirAnalisisGomas).toHaveBeenCalledWith(9539, []);
    const lista = screen.getByRole("list", {
      name: "Estrategias de gomas por piloto",
    });
    expect(within(lista).getAllByRole("button")).toHaveLength(4);
    expect(screen.getAllByTestId("barra-stint")).toHaveLength(7);
  });

  it("pide al servidor los pilotos de la URL", async () => {
    parametros = new URLSearchParams(`${URL_COMPLETA}&pilotos=16,44`);
    pintar();

    await screen.findByRole("heading", {
      name: "Estrategia de todos los pilotos",
    });
    expect(api.pedirAnalisisGomas).toHaveBeenCalledWith(9539, [16, 44]);
  });

  it("los pilotos elegidos quedan marcados: el podio si la URL no trae ninguno", async () => {
    pintar();
    await screen.findByRole("heading", {
      name: "Estrategia de todos los pilotos",
    });

    expect(fila(/^VER/)).toHaveAttribute("aria-pressed", "true");
    expect(fila(/^NOR/)).toHaveAttribute("aria-pressed", "true");
    expect(fila(/^HAM/)).toHaveAttribute("aria-pressed", "true");
    expect(fila(/^LEC/)).toHaveAttribute("aria-pressed", "false");
  });

  it("cada fila describe la estrategia con texto, no solo con colores", async () => {
    pintar();
    await screen.findByRole("heading", {
      name: "Estrategia de todos los pilotos",
    });

    expect(fila(/^VER/)).toHaveAccessibleName(
      "VER, puesto 1. Blanda, 20 vueltas; Dura, 30 vueltas",
    );
    expect(fila(/^LEC/)).toHaveAccessibleName(
      "LEC, abandonó. Blanda, 12 vueltas",
    );
  });

  it("quien abandona tiene la barra cortada en su última vuelta y una ✕", async () => {
    pintar();
    await screen.findByRole("heading", {
      name: "Estrategia de todos los pilotos",
    });

    const barras = within(fila(/^LEC/)).getAllByTestId("barra-stint");
    expect(barras).toHaveLength(1);
    expect(barras[0].style.width).toBe("24%"); // 12 de 50 vueltas, no las 50 que dice OpenF1
    expect(
      within(fila(/^LEC/)).getByTestId("marca-abandono"),
    ).toHaveTextContent("✕");
    expect(
      within(fila(/^VER/)).queryByTestId("marca-abandono"),
    ).not.toBeInTheDocument();
  });

  it("al elegir un piloto lo agrega a la URL conservando lo demás", async () => {
    parametros = new URLSearchParams(`${URL_COMPLETA}&pilotos=1`);
    pintar();
    await screen.findByRole("heading", {
      name: "Estrategia de todos los pilotos",
    });

    await userEvent.click(fila(/^HAM/));

    expect(reemplazar).toHaveBeenCalledWith({
      pathname: "/gomas",
      query: { anio: "2024", evento: "1238", sesion: "9539", pilotos: "1,44" },
    });
  });

  it("al quitar un piloto del podio escribe los que quedan", async () => {
    pintar();
    await screen.findByRole("heading", {
      name: "Estrategia de todos los pilotos",
    });

    await userEvent.click(fila(/^NOR/));

    expect(reemplazar).toHaveBeenCalledWith({
      pathname: "/gomas",
      query: expect.objectContaining({ pilotos: "1,44" }),
    });
  });

  it("con tres pilotos elegidos no deja agregar otro y lo explica", async () => {
    pintar();
    await screen.findByRole("heading", {
      name: "Estrategia de todos los pilotos",
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Ya hay 3 pilotos elegidos",
    );
    await userEvent.click(fila(/^LEC/));

    expect(reemplazar).not.toHaveBeenCalled();
    expect(fila(/^LEC/)).toHaveAttribute("aria-disabled", "true");
  });

  it("mientras llegan los pilotos nuevos sigue mostrando el análisis anterior", async () => {
    const { rerender } = pintar();
    await screen.findByRole("heading", {
      name: "Estrategia de todos los pilotos",
    });

    let llegar: (
      analisis: ReturnType<typeof crearAnalisisGomas>,
    ) => void = () => {};
    api.pedirAnalisisGomas.mockReturnValue(
      new Promise((resolver) => (llegar = resolver)),
    );
    parametros = new URLSearchParams(`${URL_COMPLETA}&pilotos=16`);
    rerender(arbol());

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Actualizando la gráfica",
    );
    expect(
      screen.getByRole("heading", { name: "Estrategia de todos los pilotos" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("barra-stint")).toHaveLength(7);

    llegar(crearAnalisisGomas({ pilotos_elegidos: [16] }));
    await waitFor(() =>
      expect(
        screen.queryByText("Actualizando la gráfica…"),
      ).not.toBeInTheDocument(),
    );
  });

  it("al cambiar de sesión no deja ver el análisis de la anterior", async () => {
    const { rerender } = pintar();
    await screen.findByRole("heading", {
      name: "Estrategia de todos los pilotos",
    });

    api.pedirAnalisisGomas.mockReturnValue(new Promise(() => {}));
    parametros = new URLSearchParams("anio=2024&evento=1240&sesion=9600");
    rerender(arbol());

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: "Estrategia de todos los pilotos",
        }),
      ).not.toBeInTheDocument(),
    );
  });

  it("muestra el error de la API con su traducción", async () => {
    api.pedirAnalisisGomas.mockRejectedValue(
      new ErrorApi("analisis_no_disponible", 422),
    );
    pintar();

    expect(
      await screen.findByText(
        "Este análisis no está disponible para esa sesión.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Estrategia de todos los pilotos",
      }),
    ).not.toBeInTheDocument();
  });
});

describe("compuestos raros de OpenF1", () => {
  it("un stint UNKNOWN se muestra como «Desconocida» y no rompe la página", async () => {
    const base = crearAnalisisGomas();
    const estrategias = structuredClone(base.estrategias);
    estrategias[0].stints[0].compuesto = "UNKNOWN";
    api.pedirAnalisisGomas.mockResolvedValue({ ...base, estrategias });
    pintar();

    await screen.findByRole("heading", { name: "Estrategia de todos los pilotos" });

    expect(fila(/^VER/)).toHaveAccessibleName(expect.stringContaining("Desconocida, 20 vueltas"));
    expect(screen.getByText("Desconocida", { selector: "li" })).toBeInTheDocument();
  });
});

describe("dispersión y combustible", () => {
  async function abrir() {
    pintar();
    await screen.findByRole("heading", {
      name: "Estrategia de todos los pilotos",
    });
    return screen.getByTestId("puntos");
  }

  it("dibuja un punto por vuelta de los pilotos elegidos y una recta por stint medido", async () => {
    const puntos = await abrir();

    expect(puntos.querySelectorAll(".punto-goma")).toHaveLength(10);
    const rectas = screen.getAllByTestId("rectas");
    expect(rectas.flatMap((g) => [...g.querySelectorAll("line")])).toHaveLength(
      2,
    ); // el stint de NOR es insuficiente
  });

  describe("un panel por piloto", () => {
    const paneles = () =>
      screen.getAllByRole("img", { name: /Tiempos de vuelta limpios de/ });

    it("con tres pilotos hay tres paneles, cada uno con solo sus puntos", async () => {
      await abrir();

      expect(paneles().map((p) => p.getAttribute("aria-label"))).toEqual([
        expect.stringContaining("de VER"),
        expect.stringContaining("de NOR"),
        expect.stringContaining("de HAM"),
      ]);
      const pilotosPorPanel = paneles().map((panel) => [
        ...new Set(
          [...panel.querySelectorAll<SVGGElement>(".punto-goma")].map(
            (g) => g.dataset.piloto,
          ),
        ),
      ]);
      expect(pilotosPorPanel).toEqual([["1"], ["4"], ["44"]]);
      // El código de cada piloto titula su panel.
      for (const codigo of ["VER", "NOR", "HAM"])
        expect(
          screen.getAllByText(codigo, { selector: "svg text" }),
        ).toHaveLength(1);
    });

    it("todos los paneles usan la misma escala de tiempo y de edad", async () => {
      await abrir();

      const marcas = paneles().map((panel) =>
        [...panel.querySelectorAll("text")]
          .map((texto) => texto.textContent)
          .filter((texto) => /^(\d+|\d:\d\d,\d)$/.test(texto ?? "")),
      );
      expect(marcas[0].length).toBeGreaterThan(4);
      expect(marcas[1]).toEqual(marcas[0]);
      expect(marcas[2]).toEqual(marcas[0]);
    });

    it("la posición horizontal sigue la misma escala en todos los paneles", async () => {
      await abrir();
      const xs = (piloto: string) =>
        [
          ...screen
            .getByTestId("puntos")
            .querySelectorAll<SVGGElement>(`[data-piloto="${piloto}"]`),
        ].map((g) => Number(/translate\(([\d.]+)px/.exec(g.style.transform)?.[1]));
      // NOR tiene edades 3 y 9 (6 vueltas de diferencia) y VER 2 y 6 (4 de diferencia).
      const [nor3, nor9] = xs("4");
      const [ver2, ver6] = xs("1");

      expect((nor9 - nor3) / 6).toBeCloseTo((ver6 - ver2) / 4, 5);
    });

    it("con un solo piloto hay un único panel, sin título de piloto", async () => {
      parametros = new URLSearchParams(`${URL_COMPLETA}&pilotos=1`);
      await abrir();

      expect(paneles()).toHaveLength(1);
      expect(
        screen.queryByText("VER", { selector: "svg text" }),
      ).not.toBeInTheDocument();
    });

    it("un piloto sin vueltas limpias no tiene panel y se avisa", async () => {
      const base = crearAnalisisGomas();
      api.pedirAnalisisGomas.mockResolvedValue({
        ...base,
        vueltas: base.vueltas.filter((v) => v.piloto !== 4),
      });

      await abrir();

      expect(paneles()).toHaveLength(2);
      expect(
        screen.getByText("NOR no tiene vueltas limpias para dibujar."),
      ).toBeInTheDocument();
    });
  });

  it("el interruptor empieza encendido y mueve los puntos al apagarlo", async () => {
    const puntos = await abrir();
    const interruptor = screen.getByRole("switch", {
      name: "Corregir por combustible",
    });
    const posiciones = () =>
      [...puntos.querySelectorAll<SVGGElement>(".punto-goma")].map(
        (g) => g.style.transform,
      );
    expect(interruptor).toBeChecked();
    const con = posiciones();

    await userEvent.click(interruptor);

    expect(interruptor).not.toBeChecked();
    const sin = posiciones();
    expect(sin).toHaveLength(con.length);
    expect(sin).not.toEqual(con);
    // Los mismos elementos: se mueven, no se vuelven a dibujar.
    expect(puntos.querySelectorAll(".punto-goma")).toHaveLength(10);
  });

  it("quitar un piloto de la elección saca sus puntos de la gráfica", async () => {
    parametros = new URLSearchParams(`${URL_COMPLETA}&pilotos=1,44`);
    const puntos = await abrir();

    // El servidor mandó vueltas de VER, NOR y HAM; solo se dibujan las de la elección.
    expect(
      new Set(
        [...puntos.querySelectorAll<SVGGElement>(".punto-goma")].map(
          (g) => g.dataset.piloto,
        ),
      ),
    ).toEqual(new Set(["1", "44"]));
  });

  it("la tabla por stint cambia de pendiente con el interruptor", async () => {
    await abrir();
    const tabla = screen.getByRole("table", {
      name: /Stints de los pilotos elegidos/,
    });
    expect(within(tabla).getByText("0,100")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("switch", { name: "Corregir por combustible" }),
    );

    expect(within(tabla).getByText("0,040")).toBeInTheDocument();
  });

  it("un stint con muy pocas vueltas lo dice y uno que no se gasta lo marca", async () => {
    await abrir();
    const tabla = screen.getByRole("table", {
      name: /Stints de los pilotos elegidos/,
    });

    expect(within(tabla).getByText("Muy pocas vueltas")).toBeInTheDocument();
    expect(within(tabla).getByText("No se gasta")).toBeInTheDocument();
  });

  it("la tabla por compuesto muestra las dos versiones", async () => {
    await abrir();
    const tabla = screen.getByRole("table", {
      name: /Promedio de todos los pilotos/,
    });

    const blanda = within(tabla).getByRole("row", { name: /Blanda/ });
    expect(within(blanda).getByText("0,100")).toBeInTheDocument();
    expect(within(blanda).getByText("0,040")).toBeInTheDocument();
  });

  it("las gráficas tienen un nombre que incluye a los pilotos y la conclusión", async () => {
    await abrir();

    const grafica = screen.getByRole("group", { name: /VER, NOR, HAM/ });
    expect(grafica).toHaveAccessibleName(
      expect.stringContaining("La blanda fue la que más se gastó"),
    );
  });
});

describe("conclusión", () => {
  async function conAnalisis(
    cambios: Parameters<typeof crearAnalisisGomas>[0],
    idioma: "es" | "en" = "es",
  ) {
    api.pedirAnalisisGomas.mockResolvedValue(crearAnalisisGomas(cambios));
    pintar(idioma);
    await screen.findByRole("heading", {
      name:
        idioma === "es"
          ? "Estrategia de todos los pilotos"
          : "Every driver's strategy",
    });
  }

  it("nombra el compuesto que más se gasta, con tres decimales", async () => {
    await conAnalisis({});

    expect(
      screen.getByText("La blanda fue la que más se gastó: 0,100 s por vuelta"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /La que mejor aguantó fue la dura, con 0,050 s por vuelta/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Hicieron 1,5 paradas en promedio/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/El stint más largo fue de VER, con dura: 30 vueltas/),
    ).toBeInTheDocument();
  });

  it("con corrección apagada usa el otro resumen", async () => {
    await conAnalisis({});

    await userEvent.click(
      screen.getByRole("switch", { name: "Corregir por combustible" }),
    );

    expect(
      screen.getByText("La blanda fue la que más se gastó: 0,040 s por vuelta"),
    ).toBeInTheDocument();
  });

  it("si casi todos los stints no se gastan, avisa y no elige un compuesto (Qatar)", async () => {
    const base = crearAnalisisGomas();
    await conAnalisis({
      resumen: {
        ...base.resumen,
        n_stints_validos: 20,
        n_stints_sin_degradacion: 17,
      },
    });

    const aviso = screen.getByRole("note");
    expect(aviso).toHaveTextContent(
      "En esta carrera no se puede medir cuánto se gastó cada goma",
    );
    expect(aviso).toHaveTextContent(
      "En 17 de 20 stints la goma no perdió tiempo",
    );
    expect(
      screen.queryByText(/fue la que más se gastó/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/paradas en promedio/)).not.toBeInTheDocument();
  });

  it("en el aviso la nota de limitaciones ya viene abierta", async () => {
    const base = crearAnalisisGomas();
    await conAnalisis({
      resumen: {
        ...base.resumen,
        n_stints_validos: 20,
        n_stints_sin_degradacion: 17,
      },
    });

    expect(
      screen.getByText("Qué no mide este análisis").closest("details"),
    ).toHaveAttribute("open");
  });

  it("la nota de limitaciones empieza cerrada cuando sí se pudo medir", async () => {
    await conAnalisis({});

    expect(
      screen.getByText("Qué no mide este análisis").closest("details"),
    ).not.toHaveAttribute("open");
  });

  it("si los compuestos se gastaron casi igual, lo dice en vez de elegir uno", async () => {
    const base = crearAnalisisGomas();
    await conAnalisis({
      resumen: {
        ...base.resumen,
        compuesto_mas_degradante: {
          compuesto: "SOFT",
          pendiente_s_por_vuelta: 0.099,
        },
        compuesto_menos_degradante: {
          compuesto: "HARD",
          pendiente_s_por_vuelta: 0.086,
        },
      },
    });

    expect(screen.getByRole("note")).toHaveTextContent(
      "Los compuestos se gastaron casi igual",
    );
    expect(screen.getByRole("note")).toHaveTextContent("0,013 s por vuelta");
  });

  it("si solo se pudo medir un compuesto no compara", async () => {
    const base = crearAnalisisGomas();
    await conAnalisis({
      resumen: {
        ...base.resumen,
        compuesto_menos_degradante: {
          compuesto: "SOFT",
          pendiente_s_por_vuelta: 0.1,
        },
      },
    });

    expect(
      screen.getByText(
        "Solo se pudo medir la goma blanda: pierde 0,100 s por vuelta",
      ),
    ).toBeInTheDocument();
  });

  it("en inglés usa punto decimal y los nombres en inglés", async () => {
    await conAnalisis({}, "en");

    expect(
      screen.getByText("The soft wore out the most: 0.100 s per lap"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Correct for fuel" }),
    ).toBeInTheDocument();
    expect(fila(/^VER/)).toHaveAccessibleName(
      "VER, position 1. Soft, 20 laps; Hard, 30 laps",
    );
  });
});
