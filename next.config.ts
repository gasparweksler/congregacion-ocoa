import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist se carga en el servidor para leer el PDF de responsabilidades;
  // debe quedar fuera del bundle (usa APIs de Node y carga módulos propios).
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
