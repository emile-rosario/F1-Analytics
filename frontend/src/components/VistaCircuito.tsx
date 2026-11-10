"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import AvisoCircuitoNuevo from "@/components/AvisoCircuitoNuevo";
import Conclusion from "@/components/Conclusion";
import EstadoCarga from "@/components/EstadoCarga";
import MapaCircuito, { type ModoMapa } from "@/components/MapaCircuito";
import SelectorSesion, { leerEntero } from "@/components/SelectorSesion";
import TablaFrenadas from "@/components/TablaFrenadas";
import { useCarga } from "@/hooks/useCarga";
import { useConclusionCircuito } from "@/hooks/useConclusionCircuito";
import { usePathname, useRouter } from "@/i18n/navigation";
import { pedirAnalisisCircuito, type AnalisisCircuito } from "@/lib/api";
import { formatearTiempoVuelta } from "@/lib/formato";

/** Sesión destacada que se abre cuando no hay elección en la URL: Monza 2024, clasificación, NOR (pole). */
export const SESION_DESTACADA = { anio: "2024", evento: "1244", sesion: "9586", piloto: "4" };

const MODOS: ModoMapa[] = ["velocidad", "marchas"];

function Resultado({ analisis }: { analisis: AnalisisCircuito }) {
  const t = useTranslations("Circuito");
  const idioma = useLocale();
  const [modo, setModo] = useState<ModoMapa>("velocidad");
  const { titulo } = useConclusionCircuito(analisis);
  const { piloto } = analisis;

  function moverFoco(tecla: string) {
    if (tecla !== "ArrowRight" && tecla !== "ArrowLeft") return;
    const otro = MODOS[(MODOS.indexOf(modo) + 1) % MODOS.length];
    setModo(otro);
    document.getElementById(`pestana-${otro}`)?.focus();
  }

  const descripcion = t(modo === "velocidad" ? "descripcionMapaVelocidad" : "descripcionMapaMarchas", {
    piloto: piloto.codigo,
    conclusion: titulo,
  });

  return (
    <div className="space-y-8">
      <div className="flex items-stretch gap-4">
        <span
          aria-hidden="true"
          className="w-1.5 shrink-0 rounded-full"
          style={{ background: piloto.color }}
        />
        <div>
          <p className="font-titulo text-5xl font-extrabold leading-none">{piloto.codigo}</p>
          <p className="text-suave">{piloto.equipo}</p>
        </div>
        <div className="ml-4 self-end">
          <p className="cifras font-titulo text-3xl font-bold leading-none">
            {formatearTiempoVuelta(analisis.tiempo_vuelta_s, idioma)}
          </p>
          <p className="text-suave">{t("vuelta", { vuelta: analisis.vuelta })}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div role="tablist" aria-label={t("pestanas.etiqueta")} className="flex gap-2">
          {MODOS.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              id={`pestana-${m}`}
              aria-selected={m === modo}
              aria-controls="panel-mapa"
              tabIndex={m === modo ? 0 : -1}
              onClick={() => setModo(m)}
              onKeyDown={(e) => moverFoco(e.key)}
              className="min-h-11 rounded px-4 font-titulo text-lg font-semibold text-suave aria-selected:bg-acento aria-selected:text-asfalto"
            >
              {t(`pestanas.${m}`)}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="panel-mapa" aria-labelledby={`pestana-${modo}`}>
          <MapaCircuito analisis={analisis} modo={modo} descripcion={descripcion} />
        </div>
      </div>

      <Conclusion analisis={analisis} />

      <section aria-labelledby="titulo-frenadas" className="space-y-3">
        <h2 id="titulo-frenadas" className="font-titulo text-3xl font-bold">
          {t("tabla.titulo")}
        </h2>
        {analisis.curvas.length === 0 ? (
          <AvisoCircuitoNuevo pagina="circuito" />
        ) : (
          <TablaFrenadas frenadas={analisis.frenadas} />
        )}
      </section>
    </div>
  );
}

/**
 * Página del circuito: el selector con piloto y, cuando hay sesión y piloto en la URL,
 * el análisis. Sin ninguna elección abre la sesión destacada.
 */
export default function VistaCircuito() {
  const t = useTranslations("Circuito");
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  const sesion = leerEntero(parametros.get("sesion"));
  const piloto = leerEntero(parametros.get("piloto"));
  const sinElegir = [...parametros].length === 0;

  useEffect(() => {
    if (sinElegir) router.replace({ pathname: ruta, query: SESION_DESTACADA });
  }, [sinElegir, router, ruta]);

  const analisis = useCarga(sesion !== null && piloto !== null ? `circuito-${sesion}-${piloto}` : null, () =>
    pedirAnalisisCircuito(sesion ?? 0, piloto ?? 0),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-titulo text-[clamp(40px,5vw,56px)] font-extrabold leading-[0.95]">
          {t("titulo")}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-suave">{t("subtitulo")}</p>
      </div>

      <SelectorSesion conPiloto />
      <EstadoCarga estado={analisis.estado} reintentar={analisis.reintentar} />
      {analisis.estado.fase === "listo" && <Resultado analisis={analisis.estado.datos} />}
    </div>
  );
}
