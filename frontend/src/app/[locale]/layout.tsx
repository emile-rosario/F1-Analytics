import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Saira, Saira_Condensed } from "next/font/google";
import { notFound } from "next/navigation";

import Cabecera from "@/components/Cabecera";
import DespertarApi from "@/components/DespertarApi";
import Pie from "@/components/Pie";
import { routing } from "@/i18n/routing";

import "../globals.css";

const saira = Saira({ subsets: ["latin"], variable: "--font-saira" });
const sairaCondensada = Saira_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-saira-condensed",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });

  return { title: t("titulo"), description: t("descripcion") };
}

export default async function LayoutIdioma({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${saira.variable} ${sairaCondensada.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <DespertarApi />
          <Cabecera />
          <main className="mx-auto w-full max-w-[1240px] flex-1 px-6 py-10">{children}</main>
          <Pie />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
