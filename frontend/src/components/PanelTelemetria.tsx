"use client";

import { useFormatter, useTranslations } from "next-intl";
import { memo, useMemo, type PointerEvent } from "react";

import type { AnalisisTelemetria } from "@/lib/api";
import { COLORES_PILOTO } from "@/lib/colores";
import { marcasEje } from "@/lib/gomas";
import { indiceMasCercano, pilotoPorDelante, tramosActivos } from "@/lib/telemetria";

const ANCHO = 800;
const IZQ = 84;
const DER = 20;
const ARRIBA = 8;
const TITULO = 26; // alto del título de cada panel
const SEPARACION = 14;
const PIE = 54; // números de la distancia y su título
const PANELES = [
  { clave: "velocidad", alto: 190 },
  { clave: "acelerador", alto: 80 },
  { clave: "freno", alto: 52 },
  { clave: "delta", alto: 150 },
] as const;

type Canales = AnalisisTelemetria["canales"];

/** Posiciones y escalas de las cuatro gráficas. Solo dependen de los datos, no del cursor. */
function geometria(canales: Canales) {
  const distancias = canales.distancia_m;
  const largo = distancias[distancias.length - 1];
  const anchoUtil = ANCHO - IZQ - DER;
  const px = (distancia: number) => IZQ + (distancia / largo) * anchoUtil;

  let y = ARRIBA;
  const paneles = PANELES.map(({ clave, alto }) => {
    const arriba = y + TITULO;
    y = arriba + alto + SEPARACION;
    return { clave, arriba, alto };
  });
  const [velocidad, acelerador, freno, delta] = paneles;
  const altoTotal = y - SEPARACION + PIE;

  const velocidades = [...canales.velocidad_a, ...canales.velocidad_b];
  const velMin = Math.max(0, Math.floor((Math.min(...velocidades) - 10) / 50) * 50);
  const velMax = Math.ceil((Math.max(...velocidades) + 10) / 50) * 50;
  const maxDelta = Math.max(0.1, Math.ceil(Math.max(...canales.delta_s.map(Math.abs)) * 10) / 10);

  const escala = (minimo: number, maximo: number, panel: { arriba: number; alto: number }) => {
    return (valor: number) => panel.arriba + (1 - (valor - minimo) / (maximo - minimo)) * panel.alto;
  };

  return {
    distancias,
    largo,
    anchoUtil,
    px,
    paneles,
    altoTotal,
    yVelocidad: escala(velMin, velMax, velocidad),
    yAcelerador: escala(0, 100, acelerador),
    yDelta: escala(-maxDelta, maxDelta, delta),
    marcasVelocidad: marcasEje(velMin, velMax, 4),
    marcasDelta: marcasEje(-maxDelta, maxDelta, 4),
    marcasX: marcasEje(0, largo, 6),
    velocidad,
    acelerador,
    freno,
    delta,
  };
}

type Geometria = ReturnType<typeof geometria>;

const trazo = (valores: number[], x: (i: number) => number, y: (valor: number) => number) =>
  valores.map((valor, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(valor).toFixed(1)}`).join("");

/** Todo lo que no cambia al mover el cursor: ejes, líneas, tramos de freno y áreas del delta. */
const Capas = memo(function Capas({
  analisis,
  g,
}: {
  analisis: AnalisisTelemetria;
  g: Geometria;
}) {
  const t = useTranslations("Telemetria");
  const formato = useFormatter();
  const { canales } = analisis;
  const codigoA = analisis.piloto_a.piloto.codigo;
  const codigoB = analisis.piloto_b.piloto.codigo;
  const x = (i: number) => g.px(g.distancias[i]);
  const numero = (valor: number) =>
    formato.number(valor, { signDisplay: "exceptZero", maximumFractionDigits: 2 });

  const lineas = (
    claveA: "velocidad_a" | "acelerador_a",
    claveB: "velocidad_b" | "acelerador_b",
    y: (valor: number) => number,
  ) => (
    <g fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
      <path d={trazo(canales[claveB], x, y)} stroke={COLORES_PILOTO.b} />
      <path d={trazo(canales[claveA], x, y)} stroke={COLORES_PILOTO.a} />
    </g>
  );

  const cero = g.yDelta(0);
  const area = (recorte: (valor: number) => number) =>
    `M${g.px(0)} ${cero}` +
    canales.delta_s.map((valor, i) => `L${x(i).toFixed(1)} ${g.yDelta(recorte(valor)).toFixed(1)}`).join("") +
    `L${g.px(g.largo)} ${cero}Z`;

  const carrilFreno = (g.freno.alto - 6) / 2;
  const frenos = [
    { codigo: codigoA, color: COLORES_PILOTO.a, activo: canales.freno_a, arriba: g.freno.arriba },
    { codigo: codigoB, color: COLORES_PILOTO.b, activo: canales.freno_b, arriba: g.freno.arriba + carrilFreno + 6 },
  ];

  return (
    <>
      {/* Rejilla vertical común y números del eje de la distancia (solo abajo). */}
      <g className="text-suave" fill="currentColor" fontSize={15}>
        {g.marcasX.map((m) => (
          <g key={m}>
            <line
              x1={g.px(m)}
              x2={g.px(m)}
              y1={g.velocidad.arriba}
              y2={g.delta.arriba + g.delta.alto}
              stroke="var(--color-linea)"
            />
            <text x={g.px(m)} y={g.delta.arriba + g.delta.alto + 22} textAnchor="middle">
              {m}
            </text>
          </g>
        ))}
        <text x={IZQ + g.anchoUtil / 2} y={g.altoTotal - 8} textAnchor="middle" fontSize={16}>
          {t("ejeX")}
        </text>

        {g.paneles.map((panel) => (
          <text key={panel.clave} x={IZQ} y={panel.arriba - 8} fontSize={16} fontWeight={600}>
            {t(`paneles.${panel.clave}`)}
          </text>
        ))}

        {/* Quién es cada línea, a la derecha del título de la primera gráfica. */}
        <g fill="var(--color-texto)" fontSize={15}>
          {[
            { codigo: codigoA, color: COLORES_PILOTO.a, x: ANCHO - DER - 150 },
            { codigo: codigoB, color: COLORES_PILOTO.b, x: ANCHO - DER - 66 },
          ].map(({ codigo, color, x: x0 }) => (
            <g key={codigo}>
              <line x1={x0} x2={x0 + 22} y1={g.velocidad.arriba - 13} y2={g.velocidad.arriba - 13} stroke={color} strokeWidth={3} strokeLinecap="round" />
              <text x={x0 + 28} y={g.velocidad.arriba - 8} fontWeight={700}>
                {codigo}
              </text>
            </g>
          ))}
        </g>

        {/* Velocidad */}
        {g.marcasVelocidad.map((m) => (
          <g key={m}>
            <line x1={IZQ} x2={ANCHO - DER} y1={g.yVelocidad(m)} y2={g.yVelocidad(m)} stroke="var(--color-linea)" />
            <text x={IZQ - 10} y={g.yVelocidad(m)} textAnchor="end" dominantBaseline="central">
              {m}
            </text>
          </g>
        ))}
        {/* Acelerador */}
        {[0, 50, 100].map((m) => (
          <g key={m}>
            <line x1={IZQ} x2={ANCHO - DER} y1={g.yAcelerador(m)} y2={g.yAcelerador(m)} stroke="var(--color-linea)" />
            <text x={IZQ - 10} y={g.yAcelerador(m)} textAnchor="end" dominantBaseline="central">
              {m}
            </text>
          </g>
        ))}
        {/* Delta */}
        {g.marcasDelta.map((m) => (
          <g key={m}>
            <line
              x1={IZQ}
              x2={ANCHO - DER}
              y1={g.yDelta(m)}
              y2={g.yDelta(m)}
              stroke={m === 0 ? "currentColor" : "var(--color-linea)"}
            />
            <text x={IZQ - 10} y={g.yDelta(m)} textAnchor="end" dominantBaseline="central">
              {numero(m)}
            </text>
          </g>
        ))}
        {/* Freno: un carril por piloto. */}
        {frenos.map(({ codigo, color, arriba }) => (
          <text key={codigo} x={IZQ - 10} y={arriba + carrilFreno / 2} textAnchor="end" dominantBaseline="central" fill={color} fontWeight={700}>
            {codigo}
          </text>
        ))}
      </g>

      {lineas("velocidad_a", "velocidad_b", g.yVelocidad)}
      {lineas("acelerador_a", "acelerador_b", g.yAcelerador)}

      <g data-testid="frenos">
        {frenos.map(({ codigo, color, activo, arriba }) =>
          tramosActivos(activo, g.distancias).map(([desde, hasta]) => (
            <rect
              key={`${codigo}-${desde}`}
              x={g.px(desde)}
              y={arriba}
              width={Math.max(1.5, g.px(hasta) - g.px(desde))}
              height={carrilFreno}
              rx={1.5}
              fill={color}
            />
          )),
        )}
      </g>

      <path d={area((v) => Math.max(v, 0))} fill={COLORES_PILOTO.a} fillOpacity={0.35} />
      <path d={area((v) => Math.min(v, 0))} fill={COLORES_PILOTO.b} fillOpacity={0.35} />
      <path
        d={trazo(canales.delta_s, x, g.yDelta)}
        fill="none"
        stroke="var(--color-texto)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <g fontSize={15} fontWeight={600}>
        <text x={IZQ + 8} y={g.delta.arriba + 18} fill={COLORES_PILOTO.a}>
          ↑ {t("delta.adelante", { piloto: codigoA })}
        </text>
        <text x={IZQ + 8} y={g.delta.arriba + g.delta.alto - 8} fill={COLORES_PILOTO.b}>
          ↓ {t("delta.adelante", { piloto: codigoB })}
        </text>
      </g>
    </>
  );
});

/**
 * Las cuatro gráficas de la comparación (velocidad, acelerador, freno y delta) en un solo SVG
 * con el mismo eje de distancia, y un cursor que recorre la vuelta.
 *
 * El cursor se mueve de tres formas: con el mouse (pasándolo por encima), tocando la gráfica y
 * con un deslizador con teclado, que además lo anuncia a los lectores de pantalla. En el móvil
 * arrastrar sobre la gráfica la desplaza, y por eso el deslizador es el control principal.
 */
export default function PanelTelemetria({
  analisis,
  indice,
  onCambiar,
  descripcion,
}: {
  analisis: AnalisisTelemetria;
  indice: number;
  onCambiar: (indice: number) => void;
  descripcion: string;
}) {
  const t = useTranslations("Telemetria");
  const formato = useFormatter();
  const { canales } = analisis;
  const g = useMemo(() => geometria(canales), [canales]);
  const codigoA = analisis.piloto_a.piloto.codigo;
  const codigoB = analisis.piloto_b.piloto.codigo;

  const distancia = canales.distancia_m[indice];
  const delta = canales.delta_s[indice];
  const adelante = pilotoPorDelante(delta);
  const tresDecimales = (valor: number) =>
    formato.number(valor, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const conSigno = (valor: number) =>
    formato.number(valor, { signDisplay: "exceptZero", minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const metros = formato.number(Math.round(distancia));
  const x = g.px(distancia);

  function desdePuntero(e: PointerEvent<SVGRectElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const caja = svg.getBoundingClientRect();
    const xSvg = ((e.clientX - caja.left) / caja.width) * ANCHO;
    const d = ((xSvg - IZQ) / g.anchoUtil) * g.largo;
    onCambiar(indiceMasCercano(g.distancias, Math.min(g.largo, Math.max(0, d))));
  }

  const filas = [
    {
      letra: "a" as const,
      codigo: codigoA,
      velocidad: canales.velocidad_a[indice],
      acelerador: canales.acelerador_a[indice],
      freno: canales.freno_a[indice],
    },
    {
      letra: "b" as const,
      codigo: codigoB,
      velocidad: canales.velocidad_b[indice],
      acelerador: canales.acelerador_b[indice],
      freno: canales.freno_b[indice],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label htmlFor="cursor-telemetria" className="block text-suave">
          {t("cursor.etiqueta")}
        </label>
        <input
          id="cursor-telemetria"
          type="range"
          min={0}
          max={canales.distancia_m.length - 1}
          step={1}
          value={indice}
          onChange={(e) => onCambiar(Number(e.target.value))}
          aria-describedby="ayuda-cursor"
          aria-valuetext={t("cursor.valor", {
            distancia: metros,
            a: codigoA,
            b: codigoB,
            velocidadA: canales.velocidad_a[indice],
            velocidadB: canales.velocidad_b[indice],
            delta: conSigno(delta),
          })}
          className="min-h-11 w-full accent-acento"
        />
        <p id="ayuda-cursor" className="max-w-3xl text-sm text-suave">
          {t("cursor.ayuda")}
        </p>

        <div role="group" aria-label={t("cursor.lectura")} className="space-y-2">
          <p className="cifras font-titulo text-xl font-bold">{t("cursor.distancia", { distancia: metros })}</p>
          <table className="w-full max-w-xl text-left">
            <thead className="text-sm text-suave">
              <tr>
                <th scope="col" className="py-1 pr-4 font-normal">
                  {t("cursor.piloto")}
                </th>
                <th scope="col" className="py-1 pr-4 text-right font-normal">
                  {t("cursor.velocidad")}
                </th>
                <th scope="col" className="py-1 pr-4 text-right font-normal">
                  {t("cursor.acelerador")}
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  {t("cursor.freno")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.letra} className="border-t border-linea">
                  <th scope="row" className="py-1 pr-4 font-titulo text-lg font-bold">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-1 w-5 rounded-full"
                        style={{ background: COLORES_PILOTO[fila.letra] }}
                      />
                      {fila.codigo}
                    </span>
                  </th>
                  <td className="cifras py-1 pr-4 text-right">{fila.velocidad} km/h</td>
                  <td className="cifras py-1 pr-4 text-right">{fila.acelerador} %</td>
                  <td className="py-1 text-right">{fila.freno ? t("cursor.frenando") : t("cursor.sinFreno")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cifras">
            {adelante
              ? `${t("cursor.diferencia", { delta: tresDecimales(Math.abs(delta)) })} · ${t("delta.adelante", {
                  piloto: adelante === "a" ? codigoA : codigoB,
                })}`
              : t("cursor.sinDiferencia")}
          </p>
        </div>
      </div>

      {/* En pantallas angostas la gráfica conserva un ancho mínimo y se desplaza. */}
      <div
        className="overflow-x-auto rounded-lg bg-panel"
        tabIndex={0}
        role="region"
        aria-label={t("region")}
      >
        <svg
          viewBox={`0 0 ${ANCHO} ${g.altoTotal}`}
          role="img"
          aria-label={descripcion}
          className="w-full min-w-[40rem]"
        >
          <Capas analisis={analisis} g={g} />

          <g data-testid="cursor" pointerEvents="none">
            <line x1={x} x2={x} y1={g.velocidad.arriba} y2={g.delta.arriba + g.delta.alto} stroke="var(--color-texto)" strokeWidth={1.5} strokeDasharray="4 3" />
            {(
              [
                [g.yVelocidad, canales.velocidad_a[indice], canales.velocidad_b[indice]],
                [g.yAcelerador, canales.acelerador_a[indice], canales.acelerador_b[indice]],
              ] as const
            ).map(([y, a, b], i) => (
              <g key={i} stroke="var(--color-asfalto)" strokeWidth={1.5}>
                <circle cx={x} cy={y(b)} r={5} fill={COLORES_PILOTO.b} />
                <circle cx={x} cy={y(a)} r={5} fill={COLORES_PILOTO.a} />
              </g>
            ))}
            <circle cx={x} cy={g.yDelta(delta)} r={5} fill="var(--color-texto)" stroke="var(--color-asfalto)" strokeWidth={1.5} />
          </g>

          <rect
            data-testid="zona-cursor"
            x={IZQ}
            y={g.velocidad.arriba}
            width={g.anchoUtil}
            height={g.altoTotal - PIE - g.velocidad.arriba + 14}
            fill="transparent"
            onPointerDown={desdePuntero}
            onPointerMove={(e) => e.pointerType === "mouse" && desdePuntero(e)}
          />
        </svg>
      </div>
    </div>
  );
}
