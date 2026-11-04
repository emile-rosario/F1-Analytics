import { useTranslations } from "next-intl";

import Logo from "@/components/Logo";
import SelectorIdioma from "@/components/SelectorIdioma";
import { Link } from "@/i18n/navigation";

export default function Cabecera() {
  const t = useTranslations("Meta");

  return (
    <header className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-6 py-5">
      <Link href="/" className="flex min-h-11 items-center gap-3 text-texto no-underline">
        <Logo className="h-6 w-[30px]" />
        <span className="font-titulo text-2xl font-bold">{t("titulo")}</span>
      </Link>
      <SelectorIdioma />
    </header>
  );
}
