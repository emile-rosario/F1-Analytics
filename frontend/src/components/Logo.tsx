/** Monograma S1 de Sector One: la S en el color del texto y el 1 como barra morada, inclinados 14°. */
export default function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 125 100" aria-hidden="true" className={className}>
      <g transform="translate(25 0) skewX(-14)">
        <path
          d="M28 0H64V20H28L20 28V40H46L64 58V72L36 100H0V80H36L44 72V60H18L0 42V28Z"
          fill="var(--color-texto)"
        />
        <rect x="78" y="0" width="22" height="100" fill="var(--color-acento)" />
      </g>
    </svg>
  );
}
