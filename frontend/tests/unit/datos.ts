import type { AnalisisCircuito, AnalisisGomas } from "@/lib/api";

/** Un circuito de juguete: un rectángulo recorrido en sentido horario, con una frenada. */
export function crearAnalisis(cambios: Partial<AnalisisCircuito> = {}): AnalisisCircuito {
  const vertices = [
    [0, 0, 300, 8],
    [2000, 0, 320, 8],
    [4000, 0, 150, 3],
    [4000, 1500, 90, 2],
    [2000, 1500, 200, 5],
    [0, 400, 280, 7],
  ];
  const puntos = vertices.map(([x, y, velocidad, marcha], i) => ({
    x,
    y,
    velocidad,
    marcha,
    distancia_m: i * 100,
  }));
  return {
    sesion: 9586,
    piloto: { numero: 4, codigo: "NOR", nombre: "Lando NORRIS", equipo: "McLaren", color: "#FF8000" },
    vuelta: 11,
    tiempo_vuelta_s: 79.327,
    longitud_m: 5764.7,
    puntos,
    curvas: [
      { numero: 1, letra: "", etiqueta: "1", x: 4000, y: 0 },
      { numero: 2, letra: "A", etiqueta: "2A", x: 4000, y: 1500 },
    ],
    frenadas: [
      {
        curva: 1,
        letra: "",
        inicio_m: 120,
        fin_m: 235.5,
        longitud_m: 115.5,
        vel_entrada: 319,
        vel_salida: 94,
        x_inicio: 3000,
        y_inicio: 0,
      },
    ],
    resumen: {
      pct_a_fondo: 83.08,
      vel_maxima: { kmh: 347, distancia_m: 652.7 },
      vel_minima: { kmh: 73, distancia_m: 935.3 },
      frenada_mas_fuerte: { curva: 1, letra: "", vel_entrada: 319, vel_salida: 94 },
    },
    ...cambios,
  };
}

/** Un análisis de gomas de juguete: 4 pilotos (uno abandona), blanda y dura, con rectas. */
export function crearAnalisisGomas(
  cambios: Partial<AnalisisGomas> = {},
): AnalisisGomas {
  const piloto = (numero: number, codigo: string, color: string) => ({
    numero,
    codigo,
    nombre: `Piloto ${codigo}`,
    equipo: `Equipo ${codigo}`,
    color,
  });
  const stint = (
    n: number,
    compuesto: string,
    inicio: number,
    fin: number,
    edad = 0,
  ) => ({
    stint: n,
    compuesto,
    vuelta_inicio: inicio,
    vuelta_fin: fin,
    edad_inicial: edad,
  });
  const ajuste = (pendiente: number) => ({
    pendiente_s_por_vuelta: pendiente,
    intercepto: 80,
    r2: 0.8,
  });
  const vuelta = (
    p: number,
    v: number,
    s: number,
    c: string,
    edad: number,
  ) => ({
    piloto: p,
    vuelta: v,
    stint: s,
    compuesto: c,
    edad_goma: edad,
    tiempo_s: 80 + 0.04 * edad,
    tiempo_corregido_s: 80 + 0.1 * edad,
  });
  const resumen = (blanda: number, dura: number) => ({
    n_stints_validos: 4,
    n_stints_insuficientes: 1,
    n_stints_sin_degradacion: 0,
    compuesto_mas_degradante: {
      compuesto: "SOFT",
      pendiente_s_por_vuelta: blanda,
    },
    compuesto_menos_degradante: {
      compuesto: "HARD",
      pendiente_s_por_vuelta: dura,
    },
    stint_mas_largo: { piloto: 1, compuesto: "HARD", vueltas: 30 },
    paradas_por_piloto: 1.5,
  });
  return {
    sesion: 9539,
    n_vueltas: 50,
    segundos_combustible_por_vuelta: 0.06,
    estrategias: [
      {
        piloto: piloto(1, "VER", "#3671C6"),
        posicion: 1,
        vueltas: 50,
        abandono: false,
        stints: [stint(1, "SOFT", 1, 20), stint(2, "HARD", 21, 50)],
      },
      {
        piloto: piloto(4, "NOR", "#FF8000"),
        posicion: 2,
        vueltas: 50,
        abandono: false,
        stints: [stint(1, "SOFT", 1, 15, 2), stint(2, "HARD", 16, 50)],
      },
      {
        piloto: piloto(44, "HAM", "#27F4D2"),
        posicion: 3,
        vueltas: 50,
        abandono: false,
        stints: [stint(1, "HARD", 1, 28), stint(2, "SOFT", 29, 50)],
      },
      {
        piloto: piloto(16, "LEC", "#E8002D"),
        posicion: null,
        vueltas: 12,
        abandono: true,
        // OpenF1 deja abierta la última vuelta de quien abandona.
        stints: [stint(1, "SOFT", 1, 50)],
      },
    ],
    pilotos_elegidos: [1, 4, 44],
    vueltas: [
      ...[2, 6, 10, 14, 18].map((e, i) => vuelta(1, 2 + i * 4, 1, "SOFT", e)),
      ...[3, 9].map((e, i) => vuelta(4, 3 + i * 6, 1, "SOFT", e)),
      ...[1, 5, 9].map((e, i) => vuelta(44, 2 + i * 4, 1, "HARD", e)),
    ],
    degradacion: [
      {
        piloto: 1,
        stint: 1,
        compuesto: "SOFT",
        n_vueltas: 18,
        edad_inicial: 2,
        edad_final: 18,
        insuficiente: false,
        corregido: ajuste(0.1),
        sin_corregir: ajuste(0.04),
      },
      {
        piloto: 4,
        stint: 1,
        compuesto: "SOFT",
        n_vueltas: 3,
        edad_inicial: 3,
        edad_final: 9,
        insuficiente: true,
        corregido: null,
        sin_corregir: null,
      },
      {
        piloto: 44,
        stint: 1,
        compuesto: "HARD",
        n_vueltas: 20,
        edad_inicial: 1,
        edad_final: 9,
        insuficiente: false,
        corregido: ajuste(-0.01),
        sin_corregir: ajuste(-0.07),
      },
    ],
    compuestos: [
      {
        compuesto: "SOFT",
        n_stints: 2,
        n_vueltas: 30,
        pendiente_s_por_vuelta: 0.1,
        pendiente_sin_corregir_s_por_vuelta: 0.04,
      },
      {
        compuesto: "HARD",
        n_stints: 2,
        n_vueltas: 40,
        pendiente_s_por_vuelta: 0.05,
        pendiente_sin_corregir_s_por_vuelta: -0.01,
      },
    ],
    resumen: resumen(0.1, 0.05),
    resumen_sin_corregir: resumen(0.04, 0.0),
    ...cambios,
  };
}
