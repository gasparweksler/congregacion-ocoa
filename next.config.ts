import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist se carga en el servidor para leer el PDF de responsabilidades;
  // debe quedar fuera del bundle (usa APIs de Node y carga módulos propios).
  serverExternalPackages: ["pdfjs-dist"],
  // Refuerzo: aunque el worker ya se importa con una ruta literal, se fuerza
  // su inclusión (y la de los datos de fuentes) en el despliegue.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**",
    ],
  },
  experimental: {
    serverActions: {
      // Por defecto una Server Action solo acepta 1 MB, y un PDF del programa
      // con imágenes puede pasarlo (fallaría al subirlo, sin mensaje claro).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
