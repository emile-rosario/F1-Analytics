"use client";

import { useTranslations } from "next-intl";

/**
 * Aviso de que el circuito todavía no tiene las curvas numeradas (uno nuevo que MultiViewer no
 * trae aún). La API lo señala con `curvas: []`: no manda ningún texto.
 */
export default function AvisoCircuitoNuevo({ pagina }: { pagina: "circuito" | "telemetria" }) {
  const t = useTranslations("CircuitoNuevo");

  return (
    <p role="note" data-testid="aviso-circuito-nuevo" className="max-w-3xl rounded-lg bg-panel p-4 text-suave">
      {t(pagina)}
    </p>
  );
}
