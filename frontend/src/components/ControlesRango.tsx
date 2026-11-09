"use client";

import { useFormatter, useTranslations } from "next-intl";

import { ajustarRango, esRangoCompleto, rangoCompleto, type Rango } from "@/lib/telemetria";

/**
 * Qué tramo de la vuelta se ve en las gráficas: dos deslizadores («desde» y «hasta»), un botón
 * para volver a la vuelta entera y una línea que dice el tramo elegido. Los deslizadores son el
 * camino accesible (teclado y lectores de pantalla) y el único en el móvil; con mouse, además,
 * se puede arrastrar sobre las gráficas.
 */
export default function ControlesRango({
  rango,
  largo,
  onCambiar,
}: {
  rango: Rango;
  largo: number;
  onCambiar: (rango: Rango) => void;
}) {
  const t = useTranslations("Telemetria.rango");
  const formato = useFormatter();
  const entero = (valor: number) => formato.number(Math.round(valor));
  const completo = esRangoCompleto(rango, largo);
  // Los deslizadores avanzan de a 1 m, así que llegan hasta el último metro entero; ahí se
  // entiende «hasta el final» y se usa el largo exacto de la vuelta.
  const tope = Math.floor(largo);

  return (
    <fieldset className="space-y-3">
      <legend className="font-titulo text-xl font-bold">{t("titulo")}</legend>
      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        <div>
          <label htmlFor="rango-desde" className="block text-suave">
            {t("desde")}
          </label>
          <input
            id="rango-desde"
            type="range"
            min={0}
            max={tope}
            step={1}
            value={Math.min(Math.round(rango.desde), tope)}
            onChange={(e) =>
              onCambiar(ajustarRango({ ...rango, desde: Number(e.target.value) }, largo, "desde"))
            }
            aria-describedby="ayuda-rango"
            aria-valuetext={t("valor", { metros: entero(rango.desde) })}
            className="min-h-11 w-full accent-acento"
          />
        </div>
        <div>
          <label htmlFor="rango-hasta" className="block text-suave">
            {t("hasta")}
          </label>
          <input
            id="rango-hasta"
            type="range"
            min={0}
            max={tope}
            step={1}
            value={Math.min(Math.round(rango.hasta), tope)}
            onChange={(e) => {
              const valor = Number(e.target.value);
              onCambiar(
                ajustarRango({ ...rango, hasta: valor >= tope ? largo : valor }, largo, "hasta"),
              );
            }}
            aria-describedby="ayuda-rango"
            aria-valuetext={t("valor", { metros: entero(rango.hasta) })}
            className="min-h-11 w-full accent-acento"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p role="status" className="cifras">
          {completo
            ? t("estadoCompleto", { largo: entero(largo) })
            : t("estado", { desde: entero(rango.desde), hasta: entero(rango.hasta) })}
        </p>
        <button
          type="button"
          onClick={() => onCambiar(rangoCompleto(largo))}
          disabled={completo}
          className="boton-secundario disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("restablecer")}
        </button>
      </div>
      <p id="ayuda-rango" className="max-w-3xl text-sm text-suave">
        {t("ayuda")}
      </p>
    </fieldset>
  );
}
