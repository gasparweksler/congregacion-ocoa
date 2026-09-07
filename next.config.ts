import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist se carga en el servidor para leer el PDF de responsabilidades;
  // debe quedar fuera del bundle (usa APIs de Node y carga módulos propios).
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    serverActions: {
      // Por defecto una Server Action solo acepta 1 MB, y un PDF del programa
      // con imágenes puede pasarlo (fallaría al subirlo, sin mensaje claro).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
