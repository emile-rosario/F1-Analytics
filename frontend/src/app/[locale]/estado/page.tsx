import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

import EstadoApi from "@/components/EstadoApi";
import SelectorIdioma from "@/components/SelectorIdioma";

// Vercel define el commit al hacer el build; la página es estática, así que se fija ahí.
const VERSION_FRONTEND = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

export default function Estado({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Estado");

  return (
    <>
      <header className="flex justify-end p-6">
        <SelectorIdioma />
      </header>
      <main className="flex-1 mx-auto w-full max-w-[1240px] px-6 py-16 space-y-8">
        <h1 className="text-5xl font-extrabold leading-[0.92] tracking-tight">{t("titulo")}</h1>
        <dl>
          <div className="flex gap-2">
            <dt className="font-semibold">{t("versionFrontend")}</dt>
            <dd className="font-mono">{VERSION_FRONTEND}</dd>
          </div>
        </dl>
        <EstadoApi />
      </main>
    </>
  );
}
