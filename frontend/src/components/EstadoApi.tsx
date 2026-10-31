"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ErrorApi, pedirSalud } from "@/lib/api";

/** Pasado este tiempo sin respuesta asumimos que el servidor está despertando. */
const DESPERTANDO_TRAS_MS = 4_000;

type Estado =
  | { fase: "cargando" }
  | { fase: "despertando" }
  | { fase: "listo"; version: string }
  | { fase: "error"; codigo: string };

export default function EstadoApi() {
  const t = useTranslations("Estado");
  const errores = useTranslations("Errores");
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    const aviso = setTimeout(() => {
      setEstado((actual) => (actual.fase === "cargando" ? { fase: "despertando" } : actual));
    }, DESPERTANDO_TRAS_MS);

    pedirSalud()
      .then((salud) => vigente && setEstado({ fase: "listo", version: salud.version }))
      .catch((error: unknown) => {
        if (!vigente) return;
        const codigo = error instanceof ErrorApi ? error.codigo : "fallo_api";
        setEstado({ fase: "error", codigo });
      });

    return () => {
      vigente = false;
      clearTimeout(aviso);
    };
  }, [intento]);

  function reintentar() {
    setEstado({ fase: "cargando" });
    setIntento((n) => n + 1);
  }

  return (
    <section aria-live="polite" className="space-y-4">
      {estado.fase === "cargando" && <p>{t("consultando")}</p>}
      {estado.fase === "despertando" && <p>{t("despertando")}</p>}
      {estado.fase === "listo" && (
        <dl className="space-y-1">
          <div className="flex gap-2">
            <dt className="font-semibold">{t("api")}</dt>
            <dd>{t("responde")}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">{t("versionApi")}</dt>
            <dd className="font-mono">{estado.version.slice(0, 7)}</dd>
          </div>
        </dl>
      )}
      {estado.fase === "error" && (
        <div className="space-y-3">
          <p role="alert">
            {t("noResponde")} {errores(estado.codigo)}
          </p>
          <button
            type="button"
            onClick={reintentar}
            className="rounded px-4 py-2 text-sm font-semibold border"
          >
            {t("reintentar")}
          </button>
        </div>
      )}
    </section>
  );
}
