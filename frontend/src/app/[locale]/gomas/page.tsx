import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Suspense, use } from "react";

import VistaGomas from "@/components/VistaGomas";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Gomas" });
  return { title: `${t("titulo")} · F1 Analytics` };
}

export default function PaginaGomas({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);

  // useSearchParams obliga a pintar en el navegador, no al construir la página.
  return (
    <Suspense>
      <VistaGomas />
    </Suspense>
  );
}
