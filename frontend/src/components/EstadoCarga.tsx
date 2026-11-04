"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useTextoError } from "@/hooks/useTextoError";
import type { Carga } from "@/hooks/useCarga";

const LUCES = 5;

function Semaforo() {
  return (
    <div aria-hidden="true" className="flex gap-2">
      {Array.from({ length: LUCES }, (_, i) => (
        <span
          key={i}
          className="luz-semaforo h-4 w-4 rounded-full bg-error"
          style={{ animationDelay: `${i * 0.4}s` }}
        />
      ))}
    </div>
  );
}

function Segundos() {
  const t = useTranslations("Carga");
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const reloj = setInterval(() => setSegundos((s) => s + 1), 1_000);
    return () => clearInterval(reloj);
  }, []);

  return <span className="cifras text-suave">{t("segundos", { segundos })}</span>;
}

/**
 * Muestra el estado de una carga que todavía no terminó bien: esperando, servidor
 * despertando o error (con botón para reintentar). Si la carga ya está lista o
 * no empezó, no dibuja nada.
 */
export default function EstadoCarga({
  estado,
  reintentar,
}: {
  estado: Carga<unknown>;
  reintentar: () => void;
}) {
  const t = useTranslations("Carga");
  const textoError = useTextoError();

  if (estado.fase === "error") {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-error">
          {textoError(estado.codigo)}
        </p>
        <button type="button" onClick={reintentar} className="boton-secundario">
          {t("reintentar")}
        </button>
      </div>
    );
  }

  if (estado.fase !== "cargando" && estado.fase !== "despertando") return null;

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Semaforo />
      <span>{estado.fase === "despertando" ? t("despertando") : t("cargando")}</span>
      {estado.fase === "despertando" && <Segundos />}
    </div>
  );
}
