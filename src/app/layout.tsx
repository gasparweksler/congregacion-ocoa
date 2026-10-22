import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Actividad de Publicadores · Mi Congregación",
  description:
    "Sistema de gestión de la actividad mensual de los publicadores de la congregación.",
};

// Aplica la apariencia guardada ANTES de pintar, para que no se vea un
// destello claro al cargar. Debe coincidir con la lógica de ThemeToggle.
const THEME_SCRIPT = `(function(){try{
var t=localStorage.getItem('ocoa-tema')||'claro';
var dark=t==='oscuro'||(t==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.setAttribute('data-theme',dark?'dark':'light');
}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // El script de abajo escribe data-theme antes de hidratar, así que ese
    // atributo no coincide con el HTML del servidor: se silencia el aviso.
    <html
      lang="es"
      className={`${geistSans.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
