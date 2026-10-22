// ============================================================================
//  Marca de la aplicación: silueta de dos hermanos con vestimenta formal y una
//  carpeta en la mano. Dibujada como SVG (no imagen) para que se vea nítida en
//  cualquier tamaño y tome el color del tema con `currentColor`.
//
//  Los detalles (solapa, corbata y el borde de la carpeta) son HUECOS reales
//  del trazo, no líneas de otro color: así se ven igual de bien sobre fondo
//  claro y oscuro, y la carpeta se separa del cuerpo en vez de fundirse.
// ============================================================================

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="currentColor"
      className={className}
      role="img"
      aria-label="Dos publicadores con una carpeta"
    >
      {/* Hermano de atrás: cabeza y hombro */}
      <circle cx="14.5" cy="13.5" r="4.8" />
      <path d="M14.5 20c-4.7 0-8.5 3.6-8.5 8.1V42h6V29.6c0-2.9 1-5.6 2.8-7.7-.1-1-.2-1.5-.3-1.9Z" />

      {/* Hermano del frente: traje con solapa y corbata recortadas, y el hueco
          donde encaja la carpeta (por eso el costado derecho queda abierto). */}
      <circle cx="28" cy="12.5" r="5.8" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M28 19.6c-5.9 0-10.7 4.3-10.7 9.6V42h11.9V28.9a4 4 0 0 1 4-4h5.5v.3c0-5.3-4.8-9.6-10.7-9.6Zm-3.4 1.4L28 25.2l3.4-4.2 1.6 1.3L28 28.3l-5-5.9 1.6-1.4Z"
      />

      {/* Carpeta en la mano, con el clip y una hoja insinuados como huecos */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M33.2 26.4h10.3c1.4 0 2.5 1.1 2.5 2.5v10.9c0 1.4-1.1 2.5-2.5 2.5H33.2a2.5 2.5 0 0 1-2.5-2.5V28.9c0-1.4 1.1-2.5 2.5-2.5Zm3.3 5.2h6.3v1.9h-6.3v-1.9Zm0 4.4h4.2v1.9h-4.2v-1.9Z"
      />
    </svg>
  );
}
