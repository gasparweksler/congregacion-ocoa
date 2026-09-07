// El build del worker de pdfjs no trae tipos propios. Solo se usa para
// entregárselo a pdfjs a través de `globalThis.pdfjsWorker`.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
