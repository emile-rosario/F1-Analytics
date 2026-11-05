"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Link } from "@/i18n/navigation";

const PREGUNTAS = [
  { clave: "circuito", numero: 1, color: "#ff5a36", ruta: "/circuito" },
  { clave: "gomas", numero: 2, color: "#f2c14e", ruta: null },
  { clave: "telemetria", numero: 3, color: "#b65cff", ruta: null },
] as const;

/**
 * Las tres preguntas del inicio como paneles de la transmisión. La que ya existe lleva a su
 * página con la elección de la URL; las demás avisan que llegan pronto.
 */
export default function TarjetasPreguntas() {
  const t = useTranslations("Preguntas");
  const parametros = useSearchParams();
  const query = Object.fromEntries(parametros);

  return (
    <section aria-labelledby="titulo-preguntas" className="space-y-4">
      <h2 id="titulo-preguntas" className="font-titulo text-3xl font-bold">
        {t("titulo")}
      </h2>
      <ul className="grid gap-4 lg:grid-cols-3">
        {PREGUNTAS.map(({ clave, numero, color, ruta }) => {
          const contenido = (
            <>
              <span aria-hidden="true" className="w-2 shrink-0" style={{ background: color }} />
              <span className="lower-third flex-1 py-4 pl-6 pr-5">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-titulo text-5xl font-extrabold leading-none">{numero}</span>
                  <span className="text-sm text-sobre-claro">
                    {t("nivel", { nivel: t(`${clave}.nivel`) })}
                  </span>
                </span>
                <span className="mt-3 block font-titulo text-2xl font-bold leading-tight">
                  {t(`${clave}.pregunta`)}
                </span>
                <span className="mt-2 block text-sobre-claro">{t(`${clave}.detalle`)}</span>
                {!ruta && (
                  <span className="mt-3 inline-block rounded bg-asfalto px-2 py-1 text-sm text-texto">
                    {t("proximamente")}
                  </span>
                )}
              </span>
            </>
          );
          return (
            <li key={clave} className="flex">
              {ruta ? (
                <Link
                  href={{ pathname: ruta, query }}
                  className="flex w-full text-asfalto no-underline hover:brightness-95"
                >
                  {contenido}
                </Link>
              ) : (
                <div className="flex w-full opacity-80">{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
