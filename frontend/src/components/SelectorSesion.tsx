"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import EstadoCarga from "@/components/EstadoCarga";
import { useCarga } from "@/hooks/useCarga";
import { usePathname, useRouter } from "@/i18n/navigation";
import { pedirCalendario, pedirPilotos, pedirSesiones } from "@/lib/api";

/** Primer año con datos de OpenF1. */
export const PRIMER_ANIO = 2023;

const CLASE_CAMPO =
  "min-h-11 w-full rounded border border-linea bg-asfalto px-3 text-texto disabled:opacity-50";

export function leerEntero(texto: string | null): number | null {
  if (texto === null || !/^\d+$/.test(texto)) return null;
  return Number(texto);
}

type Eleccion = { anio: number; evento: number | null; sesion: number | null; piloto: number | null };

/**
 * Elige año, Gran Premio, sesión y (con `conPiloto`) piloto. La elección vive en la URL
 * (`?anio=2024&evento=1244&sesion=9586&piloto=4`), así que se puede compartir el enlace.
 * Solo se pueden elegir sesiones que ya terminaron.
 */
export default function SelectorSesion({ conPiloto = false }: { conPiloto?: boolean }) {
  const t = useTranslations("Selector");
  const nombres = useTranslations("Sesiones");
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  const anioMaximo = new Date().getFullYear();
  const anioUrl = leerEntero(parametros.get("anio"));
  const anio =
    anioUrl !== null && anioUrl >= PRIMER_ANIO && anioUrl <= anioMaximo ? anioUrl : anioMaximo;
  const evento = leerEntero(parametros.get("evento"));
  const sesion = leerEntero(parametros.get("sesion"));
  const piloto = leerEntero(parametros.get("piloto"));

  const calendario = useCarga(`calendario-${anio}`, () => pedirCalendario(anio));
  const sesiones = useCarga(evento === null ? null : `sesiones-${anio}-${evento}`, () =>
    pedirSesiones(anio, evento ?? 0),
  );

  const sesionElegida =
    sesiones.estado.fase === "listo"
      ? sesiones.estado.datos.find((s) => s.sesion === sesion && s.terminada)
      : undefined;
  const pilotos = useCarga(
    conPiloto && sesionElegida ? `pilotos-${sesionElegida.sesion}` : null,
    () => pedirPilotos(sesionElegida?.sesion ?? 0),
  );
  const pilotoElegido =
    pilotos.estado.fase === "listo"
      ? pilotos.estado.datos.find((p) => p.numero === piloto)
      : undefined;

  const nombreSesion = (nombre: string) => (nombres.has(nombre) ? nombres(nombre) : nombre);

  function elegir({ anio, evento, sesion, piloto }: Eleccion) {
    const query: Record<string, string> = { anio: String(anio) };
    if (evento !== null) query.evento = String(evento);
    if (sesion !== null) query.sesion = String(sesion);
    if (conPiloto && piloto !== null) query.piloto = String(piloto);
    router.replace({ pathname: ruta, query });
  }

  const anios = Array.from({ length: anioMaximo - PRIMER_ANIO + 1 }, (_, i) => anioMaximo - i);
  const eventoElegido =
    calendario.estado.fase === "listo"
      ? calendario.estado.datos.find((e) => e.evento === evento)
      : undefined;

  return (
    <div className="space-y-4">
      <div
        className={`grid gap-4 rounded-lg bg-panel p-5 sm:grid-cols-2 ${
          conPiloto ? "lg:grid-cols-[7rem_1fr_1fr_1fr]" : "lg:grid-cols-[8rem_1fr_1fr]"
        }`}
      >
        <div className="space-y-1">
          <label htmlFor="selector-anio" className="text-sm text-suave">
            {t("anio")}
          </label>
          <select
            id="selector-anio"
            className={CLASE_CAMPO}
            value={anio}
            onChange={(e) =>
              elegir({ anio: Number(e.target.value), evento: null, sesion: null, piloto: null })
            }
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="selector-evento" className="text-sm text-suave">
            {t("evento")}
          </label>
          <select
            id="selector-evento"
            className={CLASE_CAMPO}
            disabled={calendario.estado.fase !== "listo"}
            value={eventoElegido ? eventoElegido.evento : ""}
            onChange={(e) =>
              elegir({ anio, evento: leerEntero(e.target.value), sesion: null, piloto: null })
            }
          >
            <option value="">{t("elegirEvento")}</option>
            {calendario.estado.fase === "listo" &&
              calendario.estado.datos.map((e) => (
                <option key={e.evento} value={e.evento}>
                  {e.nombre}
                </option>
              ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="selector-sesion" className="text-sm text-suave">
            {t("sesion")}
          </label>
          <select
            id="selector-sesion"
            className={CLASE_CAMPO}
            disabled={sesiones.estado.fase !== "listo"}
            value={sesionElegida ? sesionElegida.sesion : ""}
            onChange={(e) =>
              elegir({ anio, evento, sesion: leerEntero(e.target.value), piloto: null })
            }
          >
            <option value="">{t("elegirSesion")}</option>
            {sesiones.estado.fase === "listo" &&
              sesiones.estado.datos.map((s) => (
                <option key={s.sesion} value={s.sesion} disabled={!s.terminada}>
                  {nombreSesion(s.nombre)}
                  {s.terminada ? "" : ` (${t("noTerminada")})`}
                </option>
              ))}
          </select>
        </div>

        {conPiloto && (
          <div className="space-y-1">
            <label htmlFor="selector-piloto" className="text-sm text-suave">
              {t("piloto")}
            </label>
            <select
              id="selector-piloto"
              className={CLASE_CAMPO}
              disabled={pilotos.estado.fase !== "listo"}
              value={pilotoElegido ? pilotoElegido.numero : ""}
              onChange={(e) => elegir({ anio, evento, sesion, piloto: leerEntero(e.target.value) })}
            >
              <option value="">{t("elegirPiloto")}</option>
              {pilotos.estado.fase === "listo" &&
                pilotos.estado.datos.map((p) => (
                  <option key={p.numero} value={p.numero}>
                    {p.codigo} · {p.nombre}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      <EstadoCarga estado={calendario.estado} reintentar={calendario.reintentar} />
      {/* Un solo aviso a la vez: cada uno espera a que termine el anterior. */}
      {calendario.estado.fase === "listo" && (
        <EstadoCarga estado={sesiones.estado} reintentar={sesiones.reintentar} />
      )}
      {sesiones.estado.fase === "listo" && (
        <EstadoCarga estado={pilotos.estado} reintentar={pilotos.reintentar} />
      )}

      {!sesionElegida && sesiones.estado.fase !== "error" && calendario.estado.fase !== "error" && (
        <p className="text-suave">{t("indicacion")}</p>
      )}
      {conPiloto && sesionElegida && !pilotoElegido && pilotos.estado.fase === "listo" && (
        <p className="text-suave">{t("indicacionPiloto")}</p>
      )}
    </div>
  );
}
