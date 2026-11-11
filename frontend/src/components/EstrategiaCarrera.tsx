"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import BotonDescargarPng from "@/components/BotonDescargarPng";
import type { AnalisisGomas } from "@/lib/api";
import { claveCompuesto, colorCompuesto } from "@/lib/colores";
import { nombreArchivo } from "@/lib/exportar";
import { MAX_PILOTOS } from "@/lib/gomas";

type Estrategia = AnalisisGomas["estrategias"][number];

/**
 * Cuánto de la carrera ocupa una barra para que quepa su texto: «B 17» en una pista ancha desde
 * `ANCHO_CON_TEXTO`, o en una angosta (móvil) desde `ANCHO_CON_TEXTO_ANGOSTA`; la letra sola
 * desde `ANCHO_CON_LETRA`. El ancho de la pista lo decide un container query de CSS.
 */
const ANCHO_CON_TEXTO = 0.09;
const ANCHO_CON_TEXTO_ANGOSTA = 0.2;
const ANCHO_CON_LETRA = 0.05;

function TextoBarra({
  ancho,
  letra,
  vueltas,
}: {
  ancho: number;
  letra: string;
  vueltas: number;
}) {
  if (ancho >= ANCHO_CON_TEXTO_ANGOSTA) return <>{`${letra} ${vueltas}`}</>;
  if (ancho >= ANCHO_CON_TEXTO) {
    return (
      <>
        <span className="@max-[30rem]:hidden">{`${letra} ${vueltas}`}</span>
        <span className="@min-[30rem]:hidden">{letra}</span>
      </>
    );
  }
  return ancho >= ANCHO_CON_LETRA ? <>{letra}</> : null;
}

function Fila({
  estrategia,
  nVueltas,
  elegido,
  lleno,
  alternar,
}: {
  estrategia: Estrategia;
  nVueltas: number;
  elegido: boolean;
  lleno: boolean;
  alternar: () => void;
}) {
  const t = useTranslations("Gomas");
  const { piloto, posicion, abandono, stints } = estrategia;

  // La última barra de quien abandona termina en su última vuelta, no en la de la carrera.
  const barras = stints.map((s) => {
    const fin = Math.min(s.vuelta_fin, estrategia.vueltas);
    return { ...s, fin, vueltas: fin - s.vuelta_inicio + 1 };
  });

  const resultado =
    abandono || posicion === null
      ? t("estrategia.abandono")
      : t("estrategia.puesto", { posicion });
  const etiqueta = t("estrategia.fila", {
    codigo: piloto.codigo,
    resultado,
    stints: barras
      .map((b) =>
        t("estrategia.stint", {
          compuesto: t(`compuestos.${claveCompuesto(b.compuesto)}.nombre`),
          vueltas: b.vueltas,
        }),
      )
      .join("; "),
  });

  return (
    <li>
      <button
        type="button"
        aria-pressed={elegido}
        aria-disabled={!elegido && lleno ? true : undefined}
        aria-label={etiqueta}
        onClick={alternar}
        className={`grid min-h-11 w-full grid-cols-[2rem_4.5rem_1fr] items-center gap-3 rounded px-2 py-1 text-left ${
          elegido ? "bg-panel ring-2 ring-acento" : "hover:bg-panel"
        } ${!elegido && lleno ? "opacity-60" : ""}`}
      >
        <span aria-hidden="true" className="cifras text-right text-suave">
          {posicion ?? "—"}
        </span>
        <span aria-hidden="true" className="flex items-stretch gap-2">
          <span
            className="w-1.5 rounded-full"
            style={{ background: piloto.color }}
          />
          <span className="font-titulo text-xl font-bold">{piloto.codigo}</span>
        </span>
        <span aria-hidden="true" className="@container relative block h-7">
          {barras.map((b, i) => {
            const inicio = (b.vuelta_inicio - 1) / nVueltas;
            const ancho = b.vueltas / nVueltas;
            const letra = t(`compuestos.${claveCompuesto(b.compuesto)}.letra`);
            return (
              <span
                key={b.stint}
                data-testid="barra-stint"
                className="barra-stint absolute inset-y-0 flex items-center justify-center overflow-hidden whitespace-nowrap rounded-sm border-r border-asfalto text-sm font-bold text-asfalto"
                style={{
                  left: `${inicio * 100}%`,
                  width: `${ancho * 100}%`,
                  background: colorCompuesto(b.compuesto),
                  animationDelay: `${(i * 0.12).toFixed(2)}s`,
                }}
              >
                <TextoBarra ancho={ancho} letra={letra} vueltas={b.vueltas} />
              </span>
            );
          })}
          {abandono && barras.length > 0 && (
            <span
              data-testid="marca-abandono"
              title={t("estrategia.retiro", { vuelta: estrategia.vueltas })}
              className="absolute inset-y-0 flex items-center pl-1 font-bold text-error"
              style={{ left: `${(estrategia.vueltas / nVueltas) * 100}%` }}
            >
              ✕
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * Las estrategias de todos los pilotos, una fila por piloto con una barra por stint del color
 * del compuesto. Cada fila es un botón: elegirla agrega o quita al piloto de la dispersión.
 */
export default function EstrategiaCarrera({
  sesion,
  estrategias,
  nVueltas,
  elegidos,
  alternar,
}: {
  sesion: number;
  estrategias: Estrategia[];
  nVueltas: number;
  elegidos: number[];
  alternar: (piloto: number) => void;
}) {
  const t = useTranslations("Gomas.estrategia");
  const te = useTranslations("Exportar");
  const grafica = useRef<HTMLDivElement>(null);
  const lleno = elegidos.length >= MAX_PILOTOS;
  const marcas = Array.from(
    { length: Math.floor(nVueltas / 10) },
    (_, i) => (i + 1) * 10,
  );

  return (
    <div className="space-y-3">
      <p className="text-suave">{t("ayuda", { max: MAX_PILOTOS })}</p>
      <BotonDescargarPng
        nodo={grafica}
        grafico={te("graficos.estrategia")}
        archivo={nombreArchivo("estrategia", sesion)}
      />
      <div ref={grafica} className="rounded-lg bg-panel p-3 sm:p-4">
        <div
          className="grid grid-cols-[2rem_4.5rem_1fr] gap-3 px-2 pb-2 text-sm text-suave"
          aria-hidden="true"
        >
          <span />
          <span>{t("eje")}</span>
          <span className="relative block h-5">
            {marcas.map((m) => (
              <span
                key={m}
                className="cifras absolute -translate-x-1/2"
                style={{ left: `${((m - 0.5) / nVueltas) * 100}%` }}
              >
                {m}
              </span>
            ))}
          </span>
        </div>
        <ul aria-label={t("lista")} className="space-y-1">
          {estrategias.map((e) => (
            <Fila
              key={e.piloto.numero}
              estrategia={e}
              nVueltas={nVueltas}
              elegido={elegidos.includes(e.piloto.numero)}
              lleno={lleno}
              alternar={() => alternar(e.piloto.numero)}
            />
          ))}
        </ul>
      </div>
      {lleno && (
        <p role="status" className="text-sm text-suave">
          {t("maximo", { max: MAX_PILOTOS })}
        </p>
      )}
    </div>
  );
}
