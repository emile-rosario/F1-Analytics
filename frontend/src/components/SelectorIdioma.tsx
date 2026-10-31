"use client";

import { useLocale, useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default function SelectorIdioma() {
  const t = useTranslations("Idioma");
  const idiomaActual = useLocale();
  const ruta = usePathname();

  return (
    <nav aria-label={t("etiqueta")} className="flex gap-2">
      {routing.locales.map((idioma) => (
        <Link
          key={idioma}
          href={ruta}
          locale={idioma}
          lang={idioma}
          aria-label={t(idioma)}
          aria-current={idioma === idiomaActual ? "true" : undefined}
          className="rounded px-3 py-2 text-sm font-semibold uppercase aria-[current=true]:bg-foreground aria-[current=true]:text-background"
        >
          {idioma}
        </Link>
      ))}
    </nav>
  );
}
