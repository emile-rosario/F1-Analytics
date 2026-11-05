"use client";

import { useConclusionCircuito } from "@/hooks/useConclusionCircuito";
import type { AnalisisCircuito } from "@/lib/api";

/** Conclusión en lenguaje simple: barra de acento y panel claro con un titular y una línea de detalle. */
export default function Conclusion({ analisis }: { analisis: AnalisisCircuito }) {
  const { titulo, detalle } = useConclusionCircuito(analisis);

  return (
    <div className="flex max-w-3xl">
      <span aria-hidden="true" className="w-2 shrink-0 bg-acento" />
      <div className="lower-third px-6 py-4">
        <p className="font-titulo text-2xl font-bold leading-tight">{titulo}</p>
        <p className="mt-1 text-sobre-claro">{detalle}</p>
      </div>
    </div>
  );
}
