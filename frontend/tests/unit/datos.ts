import type { AnalisisCircuito } from "@/lib/api";

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
