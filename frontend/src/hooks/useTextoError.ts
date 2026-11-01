"use client";

import { useTranslations } from "next-intl";

/** Devuelve una función que traduce un código de error de la API; los desconocidos usan `fallo_api`. */
export function useTextoError() {
  const t = useTranslations("Errores");
  return (codigo: string) => (t.has(codigo) ? t(codigo) : t("fallo_api"));
}
