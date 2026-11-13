import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Suspense, use } from "react";

import VistaTelemetria from "@/components/VistaTelemetria";
import { metadatosDePagina } from "@/lib/metadatos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return metadatosDePagina(locale, "Telemetria");
}

export default function PaginaTelemetria({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);

  // useSearchParams obliga a pintar en el navegador, no al construir la página.
  return (
    <Suspense>
      <VistaTelemetria />
    </Suspense>
  );
}
