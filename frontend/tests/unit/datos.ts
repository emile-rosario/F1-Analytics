import type { AnalisisCircuito, AnalisisGomas, AnalisisTelemetria } from "@/lib/api";

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

/**
 * Una comparación de juguete: VER (A) contra LEC (B) en 1000 m, 41 puntos cada 25 m. El delta
 * sube parejo hasta 0,228 s (gana A), cada piloto frena una vez y los 25 minisectores se
 * reparten 12 para A, 7 para B y 6 empates.
 */
export function crearAnalisisTelemetria(
  cambios: Partial<AnalisisTelemetria> = {},
): AnalisisTelemetria {
  const n = 41;
  const distancia_m = Array.from({ length: n }, (_, i) => i * 25);
  const piloto = (numero: number, codigo: string, equipo: string, color: string) => ({
    numero,
    codigo,
    nombre: `Piloto ${codigo}`,
    equipo,
    color,
  });
  const ganadores = [
    ...Array<"a">(12).fill("a"),
    ...Array<"b">(7).fill("b"),
    ...Array<"empate">(6).fill("empate"),
  ];
  return {
    sesion: 9468,
    segmento: "Q3",
    piloto_a: { piloto: piloto(1, "VER", "Red Bull Racing", "#3671C6"), vuelta: 16, tiempo_vuelta_s: 89.179 },
    piloto_b: { piloto: piloto(16, "LEC", "Ferrari", "#E80020"), vuelta: 18, tiempo_vuelta_s: 89.407 },
    longitud_m: 1000,
    paso_m: 5,
    canales: {
      distancia_m,
      velocidad_a: distancia_m.map((d) => Math.round(200 + 80 * Math.sin(d / 150))),
      velocidad_b: distancia_m.map((d) => Math.round(198 + 80 * Math.sin(d / 150))),
      acelerador_a: distancia_m.map((_, i) => (i >= 10 && i <= 14 ? 0 : 100)),
      acelerador_b: distancia_m.map((_, i) => (i >= 11 && i <= 15 ? 0 : 100)),
      freno_a: distancia_m.map((_, i) => i >= 10 && i <= 14),
      freno_b: distancia_m.map((_, i) => i >= 11 && i <= 15),
      delta_s: distancia_m.map((d) => Number(((0.228 * d) / 1000).toFixed(3))),
      x: distancia_m.map((d) => Math.round(2000 * Math.cos((d / 1000) * 2 * Math.PI))),
      y: distancia_m.map((d) => Math.round(1000 * Math.sin((d / 1000) * 2 * Math.PI))),
    },
    curvas: [
      { numero: 1, letra: "", etiqueta: "1", x: 2000, y: 0 },
      { numero: 2, letra: "", etiqueta: "2", x: -2000, y: 0 },
    ],
    minisectores: ganadores.map((ganador, sector) => ({
      sector,
      inicio_m: sector * 40,
      fin_m: (sector + 1) * 40,
      diferencia_s: ganador === "a" ? 0.03 : ganador === "b" ? -0.02 : 0.002,
      ganador,
    })),
    resumen: {
      delta_final_s: 0.228,
      ganador: "a",
      sectores_ganados: { a: 12, b: 7, empate: 6 },
      mayor_ventaja: {
        a: { sector: 3, inicio_m: 120, fin_m: 160, ventaja_s: 0.196 },
        b: { sector: 14, inicio_m: 560, fin_m: 600, ventaja_s: 0.141 },
      },
      pct_a_fondo: { a: 70.3, b: 72.6 },
      vel_maxima: {
        a: { kmh: 322, distancia_m: 475 },
        b: { kmh: 318, distancia_m: 430 },
      },
      vel_minima: {
        a: { kmh: 72, distancia_m: 710 },
        b: { kmh: 66, distancia_m: 705 },
      },
    },
    ...cambios,
  };
}
