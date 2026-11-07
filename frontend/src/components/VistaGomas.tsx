"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import ConclusionGomas from "@/components/ConclusionGomas";
import DispersionGomas, { MarcaLeyenda } from "@/components/DispersionGomas";
import EstadoCarga from "@/components/EstadoCarga";
import EstrategiaCarrera from "@/components/EstrategiaCarrera";
import SelectorSesion, { leerEntero } from "@/components/SelectorSesion";
import { TablaCompuestos, TablaStints } from "@/components/TablasDegradacion";
import { useCarga } from "@/hooks/useCarga";
import { useConclusionGomas } from "@/hooks/useConclusionGomas";
import { usePathname, useRouter } from "@/i18n/navigation";
import { pedirAnalisisGomas, type AnalisisGomas } from "@/lib/api";
import { claveCompuesto, colorCompuesto, ordenCompuesto } from "@/lib/colores";
import {
  alternarPiloto,
  leerPilotos,
  SESION_DESTACADA_GOMAS,
} from "@/lib/gomas";

function Resultado({
  analisis,
  elegidos,
  actualizando,
  alternar,
}: {
  analisis: AnalisisGomas;
  elegidos: number[];
  actualizando: boolean;
  alternar: (piloto: number) => void;
}) {
  const t = useTranslations("Gomas");
  const [corregir, setCorregir] = useState(true);
  const conclusion = useConclusionGomas(analisis, corregir);

  const codigos = elegidos.map(
    (n) =>
      analisis.estrategias.find((e) => e.piloto.numero === n)?.piloto.codigo ??
      String(n),
  );

  const compuestosEnCarrera = [
    ...new Set(
      analisis.estrategias.flatMap((e) => e.stints.map((s) => s.compuesto)),
    ),
  ].sort((a, b) => ordenCompuesto(a) - ordenCompuesto(b));

  return (
    <div className="space-y-10">
      <ConclusionGomas {...conclusion} />

      <section aria-labelledby="titulo-estrategia" className="space-y-3">
        <h2 id="titulo-estrategia" className="font-titulo text-3xl font-bold">
          {t("estrategia.titulo")}
        </h2>
        <EstrategiaCarrera
          estrategias={analisis.estrategias}
          nVueltas={analisis.n_vueltas}
          elegidos={elegidos}
          alternar={alternar}
        />
      </section>

      <section
        aria-labelledby="titulo-dispersion"
        aria-busy={actualizando}
        className="space-y-3"
      >
        <h2 id="titulo-dispersion" className="font-titulo text-3xl font-bold">
          {t("dispersion.titulo")}
        </h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <button
            type="button"
            role="switch"
            aria-checked={corregir}
            aria-describedby="ayuda-combustible"
            onClick={() => setCorregir((c) => !c)}
            className="flex min-h-11 items-center gap-3 rounded"
          >
            <span
              aria-hidden="true"
              className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                corregir ? "bg-acento" : "bg-linea"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-texto transition-transform ${
                  corregir ? "translate-x-5" : ""
                }`}
              />
            </span>
            {t("dispersion.corregir")}
          </button>
          <ul
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-suave"
            aria-label={t("dispersion.leyenda")}
          >
            {elegidos.map((n, i) => (
              <li key={n} className="flex items-center gap-2">
                <MarcaLeyenda forma={i} />
                {codigos[i]}
              </li>
            ))}
          </ul>
        </div>
        <p id="ayuda-combustible" className="max-w-3xl text-sm text-suave">
          {t("dispersion.corregirAyuda", {
            segundos: analisis.segundos_combustible_por_vuelta,
          })}
        </p>
        <div
          className={
            actualizando
              ? "opacity-60 transition-opacity"
              : "transition-opacity"
          }
        >
          <DispersionGomas
            analisis={analisis}
            elegidos={elegidos}
            corregir={corregir}
            descripcion={t("dispersion.descripcion", {
              pilotos: codigos.join(", "),
              conclusion: conclusion.titulo,
            })}
          />
        </div>
        {actualizando && (
          <p role="status" className="text-sm text-suave">
            {t("dispersion.actualizando")}
          </p>
        )}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-suave">
          {compuestosEnCarrera.map((c) => (
            <li key={c} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full"
                style={{ background: colorCompuesto(c) }}
              />
              {t(`compuestos.${claveCompuesto(c)}.nombre`)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="titulo-tabla-stints" className="space-y-3">
        <h2 id="titulo-tabla-stints" className="font-titulo text-3xl font-bold">
          {t("tablas.stints.titulo")}
        </h2>
        <TablaStints
          analisis={analisis}
          elegidos={elegidos}
          corregir={corregir}
        />
      </section>

      <section aria-labelledby="titulo-tabla-compuestos" className="space-y-3">
        <h2
          id="titulo-tabla-compuestos"
          className="font-titulo text-3xl font-bold"
        >
          {t("tablas.compuestos.titulo")}
        </h2>
        <TablaCompuestos compuestos={analisis.compuestos} />
      </section>

      <details
        open={conclusion.tipo === "sinMedida"}
        className="max-w-3xl rounded-lg bg-panel p-4"
      >
        <summary className="min-h-11 cursor-pointer font-titulo text-2xl font-bold">
          {t("limitaciones.titulo")}
        </summary>
        <div className="mt-2 space-y-2 text-suave">
          <p>{t("limitaciones.intro")}</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>{t("limitaciones.trafico")}</li>
            <li>{t("limitaciones.pista")}</li>
            <li>
              {t("limitaciones.combustible", {
                segundos: analisis.segundos_combustible_por_vuelta,
              })}
            </li>
            <li>{t("limitaciones.limpias")}</li>
          </ul>
        </div>
      </details>
    </div>
  );
}

/**
 * Página de gomas: el selector (sin piloto: los pilotos se eligen en la estrategia) y el
 * análisis de la carrera. La URL guarda la sesión y `pilotos=1,4,44`. Sin ninguna elección
 * abre la carrera destacada.
 */
export default function VistaGomas() {
  const t = useTranslations("Gomas");
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  const sesion = leerEntero(parametros.get("sesion"));
  const pilotosUrl = leerPilotos(parametros.get("pilotos"));
  const sinElegir = [...parametros].length === 0;

  useEffect(() => {
    if (sinElegir)
      router.replace({ pathname: ruta, query: SESION_DESTACADA_GOMAS });
  }, [sinElegir, router, ruta]);

  const analisis = useCarga(
    sesion !== null ? `gomas-${sesion}-${pilotosUrl.join(",")}` : null,
    () => pedirAnalisisGomas(sesion ?? 0, pilotosUrl),
  );

  // Al cambiar de pilotos se sigue mostrando el análisis anterior de la misma sesión mientras
  // llega el nuevo: la estrategia no parpadea y solo la gráfica espera.
  const [mostrado, setMostrado] = useState<AnalisisGomas | null>(null);
  if (analisis.estado.fase === "listo" && analisis.estado.datos !== mostrado) {
    setMostrado(analisis.estado.datos);
  }
  const datos =
    mostrado !== null && mostrado.sesion === sesion ? mostrado : null;
  const actualizando =
    analisis.estado.fase === "cargando" ||
    analisis.estado.fase === "despertando";

  const elegidos =
    pilotosUrl.length > 0 ? pilotosUrl : (datos?.pilotos_elegidos ?? []);

  function alternar(piloto: number) {
    const nuevos = alternarPiloto(elegidos, piloto);
    if (nuevos.join(",") === elegidos.join(",")) return;
    router.replace({
      pathname: ruta,
      query: { ...Object.fromEntries(parametros), pilotos: nuevos.join(",") },
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-titulo text-[clamp(40px,5vw,56px)] font-extrabold leading-[0.95]">
          {t("titulo")}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-suave">{t("subtitulo")}</p>
      </div>

      <SelectorSesion />
      {(datos === null || analisis.estado.fase === "error") && (
        <EstadoCarga
          estado={analisis.estado}
          reintentar={analisis.reintentar}
        />
      )}
      {datos !== null && (
        <Resultado
          analisis={datos}
          elegidos={elegidos}
          actualizando={actualizando}
          alternar={alternar}
        />
      )}
    </div>
  );
}
