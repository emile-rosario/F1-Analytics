import { useFormatter, useTranslations } from "next-intl";

import type { AnalisisCircuito } from "@/lib/api";
import { conclusionCircuito } from "@/lib/conclusionCircuito";

/** Textos de la conclusión del circuito para un componente (la lógica vive en `lib/conclusionCircuito.ts`). */
export function useConclusionCircuito(analisis: AnalisisCircuito) {
  const t = useTranslations("Circuito.conclusion");
  const formato = useFormatter();
  return conclusionCircuito(analisis, t, formato);
}
