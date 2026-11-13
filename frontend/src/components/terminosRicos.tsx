import type { ReactNode } from "react";

import Termino from "@/components/Termino";
import { TERMINOS } from "@/lib/glosario";

/**
 * Las etiquetas para `t.rich` de los textos con términos del glosario.
 *
 * En el mensaje se escribe `<delta>delta</delta>` y aquí cada etiqueta, que tiene el nombre de la
 * clave del término, se convierte en un `Termino`. Las etiquetas que un mensaje no usa se ignoran,
 * así que se pasa el mismo objeto a todos.
 */
export const terminosRicos = Object.fromEntries(
  TERMINOS.map((clave) => [
    clave,
    (texto: ReactNode) => <Termino clave={clave}>{texto}</Termino>,
  ]),
) as Record<(typeof TERMINOS)[number], (texto: ReactNode) => ReactNode>;
