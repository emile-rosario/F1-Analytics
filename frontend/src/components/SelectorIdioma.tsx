"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

function Enlaces({ query }: { query: Record<string, string> }) {
  const t = useTranslations("Idioma");
  const idiomaActual = useLocale();
  const ruta = usePathname();

  return (
    <nav aria-label={t("etiqueta")} className="flex gap-1">
      {routing.locales.map((idioma) => (
        <Link
          key={idioma}
          href={{ pathname: ruta, query }}
          locale={idioma}
          lang={idioma}
          aria-label={t(idioma)}
          aria-current={idioma === idiomaActual ? "true" : undefined}
          className="flex min-h-11 min-w-11 items-center justify-center rounded px-3 font-titulo text-lg font-bold uppercase text-suave no-underline aria-[current=true]:bg-texto aria-[current=true]:text-asfalto"
        >
          {idioma}
        </Link>
      ))}
    </nav>
  );
}

/** Los enlaces conservan la elección de la URL (`?anio=…`) al cambiar de idioma. */
function EnlacesConEleccion() {
  const parametros = useSearchParams();
  return <Enlaces query={Object.fromEntries(parametros)} />;
}

export default function SelectorIdioma() {
  // useSearchParams obliga a pintar en el navegador; mientras tanto se muestran los enlaces sin la elección.
  return (
    <Suspense fallback={<Enlaces query={{}} />}>
      <EnlacesConEleccion />
    </Suspense>
  );
}
