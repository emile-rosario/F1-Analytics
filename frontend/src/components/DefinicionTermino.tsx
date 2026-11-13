import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { VALORES_GLOSARIO, type Termino } from "@/lib/glosario";

/**
 * La definición corta de un término, con el enlace a su ficha completa en el glosario.
 *
 * Es un `span` en bloque y no un `div` para poder ir dentro de un párrafo o de un `li`. Se pinta
 * en el flujo de la página, justo debajo de lo que la abre: así no hay que calcular posiciones
 * ni se recorta dentro de las regiones con desplazamiento.
 */
export default function DefinicionTermino({ clave, id }: { clave: Termino; id: string }) {
  const t = useTranslations("Glosario");

  return (
    <span
      id={id}
      className="mt-2 block max-w-3xl rounded-lg bg-panel p-3 text-base font-normal text-texto"
    >
      <span className="font-semibold">{t(`terminos.${clave}.nombre`)}:</span>{" "}
      {t(`terminos.${clave}.definicion`, VALORES_GLOSARIO)}{" "}
      <Link href={`/glosario#${clave}`}>{t("ayuda.verEnGlosario")}</Link>
    </span>
  );
}
