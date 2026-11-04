/** Tres barras inclinadas con los colores de sector del timing: morado, verde y amarillo. */
export default function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 24" aria-hidden="true" className={className}>
      <path d="M7 0h6l-5 24H2z" fill="var(--color-acento)" />
      <path d="M16 0h6l-5 24h-6z" fill="var(--color-sector-verde)" />
      <path d="M25 0h5l-5 24h-6z" fill="var(--color-sector-amarillo)" />
    </svg>
  );
}
