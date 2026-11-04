import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

import EstadoApi from "@/components/EstadoApi";

// Vercel define el commit al hacer el build; la página es estática, así que se fija ahí.
const VERSION_FRONTEND = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

export default function Estado({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Estado");

  return (
    <div className="space-y-8">
      <h1 className="font-titulo text-6xl font-extrabold leading-[0.92]">{t("titulo")}</h1>
      <dl>
        <div className="flex gap-2">
          <dt className="font-semibold">{t("versionFrontend")}</dt>
          <dd className="font-mono">{VERSION_FRONTEND}</dd>
        </div>
      </dl>
      <EstadoApi />
    </div>
  );
}
