import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

import { TERMINOS, VALORES_GLOSARIO } from "@/lib/glosario";
import { metadatosDePagina } from "@/lib/metadatos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return metadatosDePagina(locale, "Glosario");
}

export default function Glosario({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Glosario");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-titulo text-[clamp(40px,5vw,56px)] font-extrabold leading-[0.95]">
          {t("titulo")}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-suave">{t("subtitulo")}</p>
      </div>

      <nav aria-label={t("indice")}>
        <ul className="flex flex-wrap gap-x-5">
          {TERMINOS.map((clave) => (
            <li key={clave}>
              <a href={`#${clave}`} className="inline-flex min-h-11 items-center">
                {t(`terminos.${clave}.nombre`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid max-w-3xl gap-4">
        {TERMINOS.map((clave) => (
          <section key={clave} id={clave} className="scroll-mt-6 space-y-2 rounded-lg bg-panel p-4">
            <h2 className="font-titulo text-2xl font-bold">{t(`terminos.${clave}.nombre`)}</h2>
            <p>{t(`terminos.${clave}.definicion`, VALORES_GLOSARIO)}</p>
            <p className="text-suave">
              <span className="font-semibold">{t("ejemplo")}:</span>{" "}
              {t(`terminos.${clave}.ejemplo`)}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
