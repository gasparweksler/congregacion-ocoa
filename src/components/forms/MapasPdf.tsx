"use client";

// ============================================================================
//  Subir el PDF con los mapas de todos los territorios.
//
//  Lo que pasa al elegir el archivo:
//   1. el navegador separa el PDF por páginas y dibuja cada una como imagen,
//   2. se reparten solas en orden (página 1 al primer territorio, 2 al
//      segundo…) y se pueden corregir una por una,
//   3. al guardar, cada imagen sube por separado, para que se vea el avance
//      y ninguna petición se pase de tamaño.
//
//  El PDF entero NO se sube a ninguna parte: se lee aquí y solo viajan las
//  imágenes ya reducidas.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Select } from "@/components/ui";
import {
  paginasComoImagenes,
  type PaginaImagen,
} from "@/lib/pdf-a-imagenes";
import {
  nombreCompleto,
  repartoPorOrden,
  tamanoLegible,
  type Territorio,
} from "@/lib/territorios";

type Pagina = PaginaImagen & { url: string };

/** Mismo aspecto que los botones de la aplicación, en una etiqueta. */
const BOTON_ARCHIVO =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border bg-white px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50";

function plural(n: number, singular: string, plural_: string): string {
  return n === 1 ? singular : plural_;
}

export function MapasPdf({ territorios }: { territorios: Territorio[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [nombreArchivo, setNombreArchivo] = useState("");
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [asignacion, setAsignacion] = useState<string[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [avance, setAvance] = useState({ hechas: 0, total: 0 });
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState("");

  // Las direcciones temporales de las imágenes hay que soltarlas a mano:
  // si no, el navegador se queda con todas las páginas en memoria.
  const urlsRef = useRef<string[]>([]);
  function soltarUrls() {
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    urlsRef.current = [];
  }
  useEffect(() => soltarUrls, []);

  async function alElegirPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setResultado("");
    soltarUrls();
    setPaginas([]);
    setAsignacion([]);
    setNombreArchivo(file.name);
    setLeyendo(true);
    setAvance({ hechas: 0, total: 0 });

    try {
      const datos = await file.arrayBuffer();
      const hojas = await paginasComoImagenes(datos, {
        alAvanzar: (hechas, total) => setAvance({ hechas, total }),
      });
      if (hojas.length === 0) {
        setError("El PDF se abrió, pero no se pudo dibujar ninguna página.");
        return;
      }
      const conUrl = hojas.map((h) => {
        const url = URL.createObjectURL(h.blob);
        urlsRef.current.push(url);
        return { ...h, url };
      });
      setPaginas(conUrl);
      setAsignacion(repartoPorOrden(conUrl.length, territorios));
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `No se pudo leer el PDF: ${err.message}`
          : "No se pudo leer el PDF. Comprueba que no esté protegido con contraseña.",
      );
    } finally {
      setLeyendo(false);
      // Permite volver a elegir el mismo archivo.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function cambiarAsignacion(i: number, territoryId: string) {
    setAsignacion((previo) => {
      const copia = [...previo];
      copia[i] = territoryId;
      return copia;
    });
  }

  async function guardar() {
    const aSubir = paginas
      .map((p, i) => ({ pagina: p, territoryId: asignacion[i] ?? "" }))
      .filter((x) => x.territoryId);

    if (aSubir.length === 0) {
      setError("Ninguna página tiene territorio: elige al menos uno.");
      return;
    }

    setError("");
    setResultado("");
    setGuardando(true);
    setAvance({ hechas: 0, total: aSubir.length });

    const fallos: string[] = [];
    let hechas = 0;
    for (const { pagina, territoryId } of aSubir) {
      try {
        const cuerpo = new FormData();
        cuerpo.append(
          "imagen",
          new File([pagina.blob], `mapa-${pagina.pagina}.jpg`, {
            type: "image/jpeg",
          }),
        );
        cuerpo.append("pagina", String(pagina.pagina));
        const r = await fetch(`/api/territorios/${territoryId}/mapa`, {
          method: "POST",
          body: cuerpo,
        });
        if (!r.ok) {
          const detalle = await r
            .json()
            .then((d: { error?: string }) => d.error)
            .catch(() => "");
          fallos.push(`Página ${pagina.pagina}: ${detalle || `error ${r.status}`}`);
        }
      } catch {
        fallos.push(`Página ${pagina.pagina}: no se pudo subir.`);
      }
      hechas += 1;
      setAvance({ hechas, total: aSubir.length });
    }

    setGuardando(false);
    if (fallos.length > 0) {
      setError(
        `Se guardaron ${aSubir.length - fallos.length} de ${aSubir.length}. ` +
          fallos.slice(0, 5).join(" · "),
      );
    } else {
      setResultado(
        `Listo: se guardaron ${aSubir.length} ${plural(aSubir.length, "mapa", "mapas")}.`,
      );
      soltarUrls();
      setPaginas([]);
      setAsignacion([]);
      setNombreArchivo("");
    }
    router.refresh();
  }

  // Dos páginas al mismo territorio: se avisa, porque la segunda pisa a la
  // primera y casi siempre es un descuido al corregir el reparto.
  const repetidos = (() => {
    const cuenta = new Map<string, number>();
    for (const id of asignacion) {
      if (id) cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
    }
    return [...cuenta.entries()]
      .filter(([, n]) => n > 1)
      .map(([id]) => territorios.find((t) => t.id === id))
      .filter((t): t is Territorio => Boolean(t));
  })();

  const sinAsignar = asignacion.filter((id) => !id).length;
  const pesoTotal = paginas.reduce((n, p) => n + p.blob.size, 0);

  if (territorios.length === 0) {
    return (
      <Alert tone="warning">
        Primero agrega los territorios. Después sube el PDF y cada página se
        reparte sola en el orden de la lista.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className={BOTON_ARCHIVO}>
          <span aria-hidden>📄</span>
          {leyendo ? "Leyendo el PDF…" : "Subir PDF de mapas"}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={leyendo || guardando}
            onChange={alElegirPdf}
          />
        </label>
        {leyendo ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <span
              aria-hidden
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-primary"
            />
            {avance.total > 0
              ? `Página ${avance.hechas} de ${avance.total}…`
              : "Abriendo el archivo…"}
          </span>
        ) : null}
        {nombreArchivo && !leyendo ? (
          <span className="text-sm text-muted">{nombreArchivo}</span>
        ) : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {resultado ? <Alert tone="success">{resultado}</Alert> : null}

      {paginas.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-slate-50 px-4 py-3 text-sm">
            <p className="font-semibold text-foreground">
              {paginas.length} {plural(paginas.length, "página", "páginas")} ·{" "}
              {tamanoLegible(pesoTotal)} en total
            </p>
            <p className="mt-0.5 text-muted">
              Se repartieron en orden. Cambia el territorio de las que no
              correspondan y pulsa “Guardar los mapas”.
            </p>
            {sinAsignar > 0 ? (
              <p className="mt-1 text-amber-700">
                {sinAsignar}{" "}
                {plural(sinAsignar, "página se quedará", "páginas se quedarán")}{" "}
                sin guardar porque no {plural(sinAsignar, "tiene", "tienen")}{" "}
                territorio.
              </p>
            ) : null}
            {repetidos.length > 0 ? (
              <p className="mt-1 text-amber-700">
                Hay territorios con dos páginas asignadas (
                {repetidos.map((t) => nombreCompleto(t)).join(", ")}): se
                guardará la última.
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginas.map((p, i) => (
              <div
                key={p.pagina}
                className="space-y-2 rounded-2xl border border-border bg-white p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Página {p.pagina}
                  </span>
                  <span className="text-xs text-muted">
                    {tamanoLegible(p.blob.size)}
                  </span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={`Página ${p.pagina} del PDF de mapas`}
                  className="h-44 w-full rounded-lg border border-border object-contain"
                />
                <Select
                  value={asignacion[i] ?? ""}
                  onChange={(e) => cambiarAsignacion(i, e.target.value)}
                  aria-label={`Territorio de la página ${p.pagina}`}
                >
                  <option value="">— Sin asignar —</option>
                  {territorios.map((t) => (
                    <option key={t.id} value={t.id}>
                      {nombreCompleto(t)}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={guardar} disabled={guardando || leyendo}>
              {guardando
                ? `Guardando ${avance.hechas} de ${avance.total}…`
                : "💾 Guardar los mapas"}
            </Button>
            <Button
              variant="secondary"
              disabled={guardando || leyendo}
              onClick={() => {
                soltarUrls();
                setPaginas([]);
                setAsignacion([]);
                setNombreArchivo("");
                setError("");
              }}
            >
              Descartar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
