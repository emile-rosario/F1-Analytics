"use client";

import { useEffect } from "react";

import { pedirSalud } from "@/lib/api";

/**
 * Llama a /api/salud en segundo plano al abrir cualquier página, para que
 * la API dormida (Render gratis) vaya despertando mientras el usuario elige.
 * No muestra nada y ignora cualquier error.
 */
export default function DespertarApi() {
  useEffect(() => {
    pedirSalud().catch(() => {});
  }, []);

  return null;
}
