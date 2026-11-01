import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export default function Pie() {
  const t = useTranslations("Pie");

  return (
    <footer className="mx-auto w-full max-w-[1240px] space-y-1 border-t border-linea px-6 py-8 text-sm text-suave">
      <p>{t("aviso")}</p>
      <p>{t("autor")}</p>
      <Link href="/estado" className="inline-flex min-h-11 items-center">
        {t("estado")}
      </Link>
    </footer>
  );
}
