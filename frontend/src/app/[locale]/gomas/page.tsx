import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Suspense, use } from "react";

import VistaGomas from "@/components/VistaGomas";
import { metadatosDePagina } from "@/lib/metadatos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return metadatosDePagina(locale, "Gomas");
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
