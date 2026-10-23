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

export function appOrigin(): string {
  const prod = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return typeof window !== "undefined" ? window.location.origin : "";
}
