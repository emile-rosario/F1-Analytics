"use client";

import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";

import DefinicionTermino from "@/components/DefinicionTermino";
import type { Termino as ClaveTermino } from "@/lib/glosario";

type Despliegue = {
  abierto: ClaveTermino | null;
  id: string;
  alternar: (clave: ClaveTermino, boton: HTMLButtonElement) => void;
};

const ContextoTerminos = createContext<Despliegue | null>(null);

/**
 * Agrupa un texto con términos del glosario y despliega su definición **al final del texto**.
 *
 * Si la definición se abriera pegada a la palabra, partiría la frase en dos. Aquí el texto queda
 * entero y la definición aparece debajo, dentro del mismo párrafo o viñeta. Solo hay una abierta a
 * la vez y Esc la cierra devolviendo el foco al botón que la abrió.
 */
export function ConTerminos({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState<ClaveTermino | null>(null);
  const id = useId();
  const ultimo = useRef<HTMLButtonElement | null>(null);

  const alternar = (clave: ClaveTermino, boton: HTMLButtonElement) => {
    ultimo.current = boton;
    setAbierto((actual) => (actual === clave ? null : clave));
  };

  return (
    <ContextoTerminos value={{ abierto, id, alternar }}>
      <span
        onKeyDown={(evento) => {
          if (evento.key === "Escape" && abierto) {
            setAbierto(null);
            ultimo.current?.focus();
          }
        }}
      >
        {children}
        {abierto && <DefinicionTermino clave={abierto} id={id} />}
      </span>
    </ContextoTerminos>
  );
}

/**
 * Una palabra de un texto que, al pulsarla, despliega su definición. Va dentro de `ConTerminos`.
 *
 * Es un botón de despliegue (`aria-expanded`), no un tooltip: funciona con el tacto y el teclado
 * y no depende de que el mouse se quede encima.
 */
export default function Termino({
  clave,
  children,
}: {
  clave: ClaveTermino;
  children: ReactNode;
}) {
  const despliegue = useContext(ContextoTerminos);
  if (despliegue === null) throw new Error("Termino debe ir dentro de ConTerminos");
  const abierto = despliegue.abierto === clave;

  return (
    <button
      type="button"
      aria-expanded={abierto}
      aria-controls={abierto ? despliegue.id : undefined}
      onClick={(evento) => despliegue.alternar(clave, evento.currentTarget)}
      className="cursor-help rounded-sm underline decoration-dotted underline-offset-4"
    >
      {children}
    </button>
  );
}
