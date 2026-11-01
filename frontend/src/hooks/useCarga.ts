"use client";

import { useEffect, useRef, useState } from "react";

import { ErrorApi } from "@/lib/api";

/** Pasado este tiempo sin respuesta asumimos que el servidor está despertando. */
export const DESPERTANDO_TRAS_MS = 4_000;

export type Carga<T> =
  | { fase: "inactivo" }
  | { fase: "cargando" }
  | { fase: "despertando" }
  | { fase: "listo"; datos: T }
  | { fase: "error"; codigo: string };

type Resultado<T> = { id: string; datos: T } | { id: string; codigo: string };

/**
 * Pide datos a la API y devuelve en qué fase va la carga.
 *
 * `clave` identifica qué se pide: cuando cambia, se vuelve a pedir y la fase
 * pasa a «cargando» enseguida. Con `null` no se pide nada (fase «inactivo»).
 */
export function useCarga<T>(clave: string | null, cargar: () => Promise<T>) {
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState<Resultado<T> | null>(null);
  const [despertandoId, setDespertandoId] = useState<string | null>(null);

  // `cargar` suele ser una función nueva en cada render; se guarda para no repetir la petición.
  const cargarRef = useRef(cargar);
  useEffect(() => {
    cargarRef.current = cargar;
  });

  const id = clave === null ? null : `${clave}#${intento}`;

  useEffect(() => {
    if (id === null) return;
    let vigente = true;
    const aviso = setTimeout(() => vigente && setDespertandoId(id), DESPERTANDO_TRAS_MS);

    cargarRef
      .current()
      .then((datos) => vigente && setResultado({ id, datos }))
      .catch((error: unknown) => {
        const codigo = error instanceof ErrorApi ? error.codigo : "fallo_api";
        if (vigente) setResultado({ id, codigo });
      });

    return () => {
      vigente = false;
      clearTimeout(aviso);
    };
  }, [id]);

  // La fase se deduce de lo guardado: así, al cambiar `clave`, no se muestran datos viejos.
  let estado: Carga<T>;
  if (id === null) estado = { fase: "inactivo" };
  else if (resultado?.id === id) {
    estado = "datos" in resultado ? { fase: "listo", datos: resultado.datos } : { fase: "error", codigo: resultado.codigo };
  } else estado = despertandoId === id ? { fase: "despertando" } : { fase: "cargando" };

  return { estado, reintentar: () => setIntento((n) => n + 1) };
}
