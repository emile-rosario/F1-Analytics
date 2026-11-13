import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Suspense, use } from "react";

import VistaCircuito from "@/components/VistaCircuito";
import { metadatosDePagina, type Consulta } from "@/lib/metadatos";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Consulta>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Con sesión y piloto en la URL, la imagen al compartir es la de esa vuelta: leer los parámetros
  // aquí (en el servidor) es lo que la pone en el HTML que ven WhatsApp o LinkedIn.
  return metadatosDePagina(locale, "Circuito", await searchParams);
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
