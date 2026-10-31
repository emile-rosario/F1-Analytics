import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

import SelectorIdioma from "@/components/SelectorIdioma";

export default function Inicio({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Inicio");
  const pie = useTranslations("Pie");

  return (
    <>
      <header className="flex justify-end p-6">
        <SelectorIdioma />
      </header>
      <main className="flex-1 mx-auto w-full max-w-[1240px] px-6 py-16">
        <h1 className="text-5xl font-extrabold leading-[0.92] tracking-tight">{t("titulo")}</h1>
        <p className="mt-6 max-w-xl text-lg">{t("subtitulo")}</p>
      </main>
      <footer className="mx-auto w-full max-w-[1240px] px-6 py-8 text-sm">
        <p>{pie("aviso")}</p>
        <p>{pie("autor")}</p>
      </footer>
    </>
  );
}
