import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";

import SelectorSesion from "@/components/SelectorSesion";

export default function Inicio({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Inicio");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-titulo text-[clamp(52px,7vw,92px)] font-extrabold leading-[0.92]">
          {t("titulo")}
        </h1>
        <p className="mt-6 max-w-xl text-lg text-suave">{t("subtitulo")}</p>
      </div>
      {/* useSearchParams obliga a que el selector se pinte en el navegador, no al construir la página. */}
      <Suspense>
        <SelectorSesion />
      </Suspense>
    </div>
  );
}
