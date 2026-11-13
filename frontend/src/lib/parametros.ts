/**
 * Un entero positivo escrito solo con dígitos (hasta 9, para que quepa sin perder precisión); todo
 * lo demás es `null`. Lo usan la página al leer la URL y la ruta de la tarjeta al validar la suya.
 */
export function leerEntero(texto: string | null): number | null {
  return texto !== null && /^\d{1,9}$/.test(texto) ? Number(texto) : null;
}
