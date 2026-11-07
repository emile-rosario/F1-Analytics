import type { AnalisisGomas } from "@/lib/api";

/** Máximo de pilotos a la vez en la dispersión (el mismo que acepta la API). */
export const MAX_PILOTOS = 3;

/** Sesión destacada de gomas: España 2024, carrera, con el podio (VER, NOR y HAM). */
export const SESION_DESTACADA_GOMAS = { anio: "2024", evento: "1238", sesion: "9539" };

type Resumen = AnalisisGomas["resumen"];

/** `?pilotos=1,4,44` → `[1, 4, 44]`; descarta lo que no sea un número, los repetidos y lo que pase del máximo. */
export function leerPilotos(texto: string | null): number[] {
  if (!texto) return [];
  const numeros = texto
    .split(",")
    .filter((parte) => /^\d+$/.test(parte))
    .map(Number)
    .filter((n) => n > 0);
  return [...new Set(numeros)].slice(0, MAX_PILOTOS);
}

/**
 * Agrega o quita un piloto de la elección. Nunca deja la elección vacía (sin pilotos la API
 * vuelve al podio, y el cambio parecería un error) ni pasa del máximo: con el máximo lleno
 * no agrega.
 */
export function alternarPiloto(elegidos: number[], piloto: number): number[] {
  if (elegidos.includes(piloto)) {
    return elegidos.length > 1 ? elegidos.filter((p) => p !== piloto) : elegidos;
  }
  return elegidos.length >= MAX_PILOTOS ? elegidos : [...elegidos, piloto];
}

/**
 * Si no se puede decir qué compuesto se gasta más: cuando casi todos los stints válidos dan
 * una goma que no se gasta (pendiente ≤ 0) la pista mejoró más de lo que la goma se gastó
 * (Qatar 2024), y comparar compuestos sería afirmar algo que los datos no muestran.
 */
export function sinDegradacionMedible(resumen: Resumen): boolean {
  return (
    resumen.n_stints_validos === 0 ||
    resumen.n_stints_sin_degradacion * 2 >= resumen.n_stints_validos
  );
}

/** Número «redondo» de pasos para el eje: devuelve las marcas entre `minimo` y `maximo`. */
export function marcasEje(minimo: number, maximo: number, objetivo = 5): number[] {
  const rango = maximo - minimo;
  if (!(rango > 0)) return [minimo];
  const bruto = rango / objetivo;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto;
  const primera = Math.ceil(minimo / paso - 1e-9) * paso;
  const marcas: number[] = [];
  for (let m = primera; m <= maximo + 1e-9; m += paso) marcas.push(Number(m.toFixed(10)));
  return marcas;
}
