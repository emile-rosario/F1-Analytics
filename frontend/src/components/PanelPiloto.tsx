import type { Piloto } from "@/lib/api";

/** Barra fina con el color del equipo, el código del piloto y el equipo. */
export default function PanelPiloto({ piloto }: { piloto: Piloto }) {
  return (
    <li className="flex items-stretch gap-3 rounded-md bg-panel p-3">
      <span
        aria-hidden="true"
        className="w-1 shrink-0 rounded-full"
        style={{ background: piloto.color }}
      />
      <div className="min-w-0">
        <p className="font-titulo text-3xl font-extrabold leading-none">{piloto.codigo}</p>
        <p className="truncate text-sm text-suave">{piloto.equipo}</p>
      </div>
    </li>
  );
}
