import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Suspense, use } from "react";

import VistaCircuito from "@/components/VistaCircuito";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Circuito" });
  return { title: `${t("titulo")} · F1 Analytics` };
}

export default function PaginaCircuito({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);

  // useSearchParams obliga a pintar en el navegador, no al construir la página.
  return (
    <Suspense>
      <VistaCircuito />
    </Suspense>
  );
}
