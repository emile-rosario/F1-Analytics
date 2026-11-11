"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type RefObject } from "react";

import { descargarPng } from "@/lib/exportar";

/** Cuánto se queda el aviso «Imagen descargada.»: después ya no dice nada de lo que hay en pantalla. */
const AVISO_MS = 5_000;

type Estado = "reposo" | "trabajando" | "listo" | "error";

/**
 * Botón que baja como PNG el gráfico que apunta `nodo`. `grafico` es el nombre del gráfico ya
 * traducido (para el nombre accesible del botón) y `archivo` el nombre del PNG.
 */
export default function BotonDescargarPng({
  nodo,
  grafico,
  archivo,
}: {
  nodo: RefObject<HTMLElement | null>;
  grafico: string;
  archivo: string;
}) {
  const t = useTranslations("Exportar");
  const [estado, setEstado] = useState<Estado>("reposo");

  useEffect(() => {
    if (estado !== "listo") return;
    const temporizador = setTimeout(() => setEstado("reposo"), AVISO_MS);
    return () => clearTimeout(temporizador);
  }, [estado]);

  async function descargar() {
    if (!nodo.current) return;
    setEstado("trabajando");
    try {
      await descargarPng(nodo.current, archivo, t("credito"));
      setEstado("listo");
    } catch (error) {
      // El mensaje de la pantalla es genérico; el detalle queda en la consola para diagnosticar.
      console.error("No se pudo exportar el gráfico a PNG", error);
      setEstado("error");
    }
  }

  return (
    <div className="flex items-center justify-end gap-3">
      {/* Siempre presente para que el lector de pantalla anuncie el resultado. Sin `role="status"`
          para no confundirse con las otras regiones de estado de la página. */}
      <p aria-live="polite" className={estado === "error" ? "text-sm text-error" : "text-sm text-suave"}>
        {estado === "listo" && t("listo")}
        {estado === "error" && t("error")}
      </p>
      <button
        type="button"
        className="boton-secundario"
        onClick={descargar}
        disabled={estado === "trabajando"}
        aria-label={t("etiqueta", { grafico })}
      >
        {estado === "trabajando" ? t("preparando") : t("boton")}
      </button>
    </div>
  );
}
