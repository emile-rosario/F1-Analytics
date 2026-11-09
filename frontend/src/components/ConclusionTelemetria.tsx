"use client";

import type { TipoConclusionTelemetria } from "@/hooks/useConclusionTelemetria";

/**
 * Conclusión de telemetría: barra de acento y panel claro con un titular y una línea de detalle.
 * Cuando las dos vueltas son casi iguales (`empate`) la barra cambia a amarillo y es un aviso.
 */
export default function ConclusionTelemetria({
  tipo,
  titulo,
  detalle,
  extra,
}: {
  tipo: TipoConclusionTelemetria;
  titulo: string;
  detalle: string;
  extra: string | null;
}) {
  const aviso = tipo === "empate";
  return (
    <div className="flex max-w-3xl">
      <span
        aria-hidden="true"
        className={`w-2 shrink-0 ${aviso ? "bg-sector-amarillo" : "bg-acento"}`}
      />
      <div className="lower-third px-6 py-4" role={aviso ? "note" : undefined} data-tipo={tipo}>
        <p className="font-titulo text-2xl font-bold leading-tight">{titulo}</p>
        <p className="mt-1 text-sobre-claro">{detalle}</p>
        {extra && <p className="mt-1 text-sobre-claro">{extra}</p>}
      </div>
    </div>
  );
}
