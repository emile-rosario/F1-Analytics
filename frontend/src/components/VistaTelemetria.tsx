"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import ConclusionTelemetria from "@/components/ConclusionTelemetria";
import EstadoCarga from "@/components/EstadoCarga";
import MapaMinisectores from "@/components/MapaMinisectores";
import PanelTelemetria from "@/components/PanelTelemetria";
import SelectorSesion, { leerEntero } from "@/components/SelectorSesion";
import { useCarga } from "@/hooks/useCarga";
import { useConclusionTelemetria } from "@/hooks/useConclusionTelemetria";
import { usePathname, useRouter } from "@/i18n/navigation";
import { pedirAnalisisTelemetria, type AnalisisTelemetria } from "@/lib/api";
import { COLORES_PILOTO } from "@/lib/colores";
import { formatearTiempoVuelta } from "@/lib/formato";
import { SESION_DESTACADA_TELEMETRIA } from "@/lib/telemetria";

function Vuelta({ letra, datos }: { letra: "a" | "b"; datos: AnalisisTelemetria["piloto_a"] }) {
  const t = useTranslations("Telemetria");
  const idioma = useLocale();
  const { piloto } = datos;
  return (
    <div className="flex items-stretch gap-4">
      <span
        aria-hidden="true"
        className="w-1.5 shrink-0 rounded-full"
        style={{ background: COLORES_PILOTO[letra] }}
      />
      <div>
        <p className="text-sm text-suave">{t(letra === "a" ? "referencia" : "comparado")}</p>
        <p className="font-titulo text-5xl font-extrabold leading-none">{piloto.codigo}</p>
        <p className="text-suave">{piloto.equipo}</p>
      </div>
      <div className="ml-2 self-end">
        <p className="cifras font-titulo text-3xl font-bold leading-none">
          {formatearTiempoVuelta(datos.tiempo_vuelta_s, idioma)}
        </p>
        <p className="text-suave">{t("vuelta", { vuelta: datos.vuelta })}</p>
      </div>
    </div>
  );
}

function Resultado({ analisis }: { analisis: AnalisisTelemetria }) {
  const t = useTranslations("Telemetria");
  // El cursor empieza en la meta: ahí el delta es la diferencia oficial de tiempo de vuelta.
  const [indice, setIndice] = useState(analisis.canales.distancia_m.length - 1);
  const conclusion = useConclusionTelemetria(analisis);
  const a = analisis.piloto_a.piloto.codigo;
  const b = analisis.piloto_b.piloto.codigo;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap gap-x-12 gap-y-6">
        <Vuelta letra="a" datos={analisis.piloto_a} />
        <Vuelta letra="b" datos={analisis.piloto_b} />
      </div>

      <ConclusionTelemetria {...conclusion} />

      <section aria-labelledby="titulo-panel" className="space-y-3">
        <h2 id="titulo-panel" className="font-titulo text-3xl font-bold">
          {t("seccionPanel")}
        </h2>
        <PanelTelemetria
          analisis={analisis}
          indice={indice}
          onCambiar={setIndice}
          descripcion={t("descripcion", { a, b, conclusion: conclusion.titulo })}
        />
      </section>

      <section aria-labelledby="titulo-mapa" className="space-y-3">
        <h2 id="titulo-mapa" className="font-titulo text-3xl font-bold">
          {t("mapa.titulo")}
        </h2>
        <MapaMinisectores
          analisis={analisis}
          indice={indice}
          descripcion={t("mapa.descripcion", {
            tramos: analisis.minisectores.length,
            conclusion: conclusion.titulo,
          })}
        />
      </section>

      <details
        // Si no se puede distinguir a los dos pilotos, las salvedades son lo primero que hay que leer.
        open={conclusion.tipo === "empate"}
        className="max-w-3xl rounded-lg bg-panel p-4"
      >
        <summary className="min-h-11 cursor-pointer font-titulo text-2xl font-bold">
          {t("limitaciones.titulo")}
        </summary>
        <div className="mt-2 space-y-2 text-suave">
          <p>{t("limitaciones.intro")}</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>{t("limitaciones.muestras")}</li>
            <li>{t("limitaciones.picos")}</li>
            <li>{t("limitaciones.exactitud")}</li>
            <li>{t("limitaciones.porque")}</li>
            <li>{t("limitaciones.condiciones")}</li>
            <li>{t("limitaciones.tramos")}</li>
          </ul>
        </div>
      </details>
    </div>
  );
}

/**
 * Página de telemetría: el selector (sesión, dos pilotos y segmento) y la comparación de sus
 * vueltas. La URL guarda `sesion`, `piloto_a`, `piloto_b` y `segmento`. Sin ninguna elección abre
 * la sesión destacada.
 */
export default function VistaTelemetria() {
  const t = useTranslations("Telemetria");
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  const sesion = leerEntero(parametros.get("sesion"));
  const pilotoA = leerEntero(parametros.get("piloto_a"));
  const pilotoB = leerEntero(parametros.get("piloto_b"));
  const segmento = parametros.get("segmento");
  const sinElegir = [...parametros].length === 0;
  const listo = sesion !== null && pilotoA !== null && pilotoB !== null && pilotoA !== pilotoB;

  useEffect(() => {
    if (sinElegir) router.replace({ pathname: ruta, query: SESION_DESTACADA_TELEMETRIA });
  }, [sinElegir, router, ruta]);

  const clave = `telemetria-${sesion}-${pilotoA}-${pilotoB}-${segmento ?? ""}`;
  const analisis = useCarga(listo ? clave : null, () =>
    pedirAnalisisTelemetria(sesion ?? 0, pilotoA ?? 0, pilotoB ?? 0, segmento),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-titulo text-[clamp(40px,5vw,56px)] font-extrabold leading-[0.95]">
          {t("titulo")}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-suave">{t("subtitulo")}</p>
      </div>

      <SelectorSesion conComparacion />
      <EstadoCarga estado={analisis.estado} reintentar={analisis.reintentar} />
      {/* Con `key` el cursor vuelve a la meta cada vez que cambia la comparación. */}
      {analisis.estado.fase === "listo" && <Resultado key={clave} analisis={analisis.estado.datos} />}
    </div>
  );
}
