"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import DefinicionTermino from "@/components/DefinicionTermino";
import type { Termino } from "@/lib/glosario";

/**
 * Una fila de botones «Qué significa: …» para poner bajo el título de una sección o de una tabla.
 *
 * Sirve donde una palabra suelta no puede ser el botón (cabeceras de tabla, títulos). Solo hay una
 * definición abierta a la vez, y se despliega debajo de la fila.
 */
export default function AyudaTerminos({ claves }: { claves: readonly Termino[] }) {
  const t = useTranslations("Glosario");
  const [abierto, setAbierto] = useState<Termino | null>(null);
  const id = useId();
  const ultimo = useRef<HTMLButtonElement | null>(null);

  return (
    <div
      role="group"
      aria-label={t("ayuda.etiqueta")}
      onKeyDown={(evento) => {
        if (evento.key === "Escape" && abierto) {
          setAbierto(null);
          ultimo.current?.focus();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 text-sm text-suave">
        <span aria-hidden="true">{t("ayuda.etiqueta")}:</span>
        {claves.map((clave) => (
          <button
            key={clave}
            type="button"
            aria-expanded={abierto === clave}
            aria-controls={abierto === clave ? id : undefined}
            onClick={(evento) => {
              ultimo.current = evento.currentTarget;
              setAbierto((actual) => (actual === clave ? null : clave));
            }}
            className="inline-flex min-h-11 cursor-help items-center rounded-full border border-linea px-3 text-texto aria-expanded:bg-panel"
          >
            {t(`terminos.${clave}.nombre`)}
          </button>
        ))}
      </div>
      {abierto && <DefinicionTermino clave={abierto} id={id} />}
    </div>
  );
}
