// ============================================================================
//  Dirección pública de la aplicación, para los enlaces que se envían por
//  WhatsApp (confirmaciones, responsabilidades, invitaciones).
//
//  Se prefiere el dominio de PRODUCCIÓN que publica Vercel, de modo que el
//  enlace sea siempre el bueno aunque quien genera el mensaje haya entrado por
//  un marcador antiguo o por una vista previa. Si esa variable no está (en
//  local, por ejemplo), se usa el dominio del navegador.
//
//  No se escribe ninguna dirección a mano: si el proyecto se renombra, los
//  mensajes siguen apuntando al sitio correcto sin tocar el código.
// ============================================================================

/**
 * El dominio configurado, o "" si no hay ninguno.
 *
 * Vale lo mismo en el servidor y en el navegador, así que es el que se usa
 * cuando el enlace se pinta en la página (si se pintara uno en el servidor y
 * otro distinto al hidratar, React avisaría del desajuste).
 */
export function appOriginConfigurado(): string {
  const prod = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : "";
}

export function appOrigin(): string {
  const prod = appOriginConfigurado();
  if (prod) return prod;
  return typeof window !== "undefined" ? window.location.origin : "";
}
