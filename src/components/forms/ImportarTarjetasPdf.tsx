"use client";

// ============================================================================
//  Subir territorios en PDF.
//
//  Lo que pasa al elegir el archivo:
//   1. el navegador lee el texto del PDF (no lo sube a ninguna parte),
//   2. reconoce las tarjetas y saca el número y el nombre de cada una,
//   3. las muestra en una tabla donde se corrige lo que haga falta,
//   4. al confirmar se crean los territorios y, si se pidió, cada página se
//      guarda además como el mapa de su territorio.
//
//  Nada se crea sin pasar por la tabla: el PDF propone, la persona decide.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Input, Table, Th, Td } from "@/components/ui";
import { textoDePdf } from "@/lib/pdf-texto-navegador";
import { paginasComoImagenes } from "@/lib/pdf-a-imagenes";
import {
  FORMATO_LABELS,
  leerTarjetasDePdf,
  type LecturaTarjetas,
} from "@/lib/tarjetas-territorio";
import { importarTarjetasAction } from "@/server/territorio-actions";

/** Mismo aspecto que los botones de la aplicación, en una etiqueta. */
const BOTON_ARCHIVO =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border bg-white px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50";

type Fila = {
  pagina: number;
  numero: string;
  nombre: string;
  incluir: boolean;
};

export type TerritorioExistente = { numero: number; nombre: string };

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

export function ImportarTarjetasPdf({
  existentes,
}: {
  existentes: TerritorioExistente[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // Los bytes del PDF se guardan para el segundo paso (dibujar los mapas),
  // así no hay que volver a pedir el archivo.
  const datosRef = useRef<ArrayBuffer | null>(null);

  const [nombreArchivo, setNombreArchivo] = useState("");
  const [lectura, setLectura] = useState<LecturaTarjetas | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [conMapas, setConMapas] = useState(true);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState("");
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState("");

  useEffect(() => {
    return () => {
      datosRef.current = null;
    };
  }, []);

  const porNumero = new Map(existentes.map((t) => [t.numero, t.nombre]));

  function limpiar() {
    datosRef.current = null;
    setLectura(null);
    setFilas([]);
    setNombreArchivo("");
    setError("");
    setPaso("");
  }

  async function alElegirPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setResultado("");
    setLectura(null);
    setFilas([]);
    setNombreArchivo(file.name);
    setLeyendo(true);
    setPaso("Leyendo el PDF…");

    try {
      const datos = await file.arrayBuffer();
      datosRef.current = datos;
      const { fragmentos, paginas } = await textoDePdf(datos);
      const leido = leerTarjetasDePdf(fragmentos, paginas);
      setLectura(leido);
      setFilas(
        leido.tarjetas.map((t) => ({
          pagina: t.pagina,
          numero: t.numero === null ? "" : String(t.numero),
          nombre: t.nombre,
          incluir: true,
        })),
      );
      setConMapas(leido.unaPorPagina);
      if (leido.tarjetas.length === 0) {
        setError(
          "No se reconoció ninguna tarjeta en ese PDF. Puede que sea un PDF " +
            "escaneado (una foto de la hoja), y entonces no tiene texto que " +
            "leer: en ese caso carga los territorios a mano y sube los mapas " +
            "desde “Mapas de los territorios”.",
        );
      }
    } catch (err) {
      datosRef.current = null;
      setError(
        err instanceof Error && err.message
          ? `No se pudo leer el PDF: ${err.message}`
          : "No se pudo leer el PDF. Comprueba que no esté protegido con contraseña.",
      );
    } finally {
      setLeyendo(false);
      setPaso("");
      // Permite volver a elegir el mismo archivo.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function cambiar(i: number, cambios: Partial<Fila>) {
    setFilas((previo) =>
      previo.map((f, j) => (j === i ? { ...f, ...cambios } : f)),
    );
  }

  // --- Qué pasa con cada fila, para avisar antes de crear nada -------------
  const incluidas = filas.filter((f) => f.incluir);
  const cuentaNumeros = new Map<string, number>();
  for (const f of incluidas) {
    if (f.numero) {
      cuentaNumeros.set(f.numero, (cuentaNumeros.get(f.numero) ?? 0) + 1);
    }
  }
  const sinNombre = incluidas.filter((f) => !f.nombre.trim()).length;
  const yaExisten = incluidas.filter(
    (f) => f.numero && porNumero.has(Number(f.numero)),
  ).length;
  const repetidas = [...cuentaNumeros.values()].filter((n) => n > 1).length;

  function estadoDe(f: Fila): { texto: string; tono: "green" | "amber" | "red" | "slate" } {
    if (!f.nombre.trim()) return { texto: "Falta el nombre", tono: "red" };
    if (!f.numero) return { texto: "Se le pondrá el siguiente libre", tono: "slate" };
    if ((cuentaNumeros.get(f.numero) ?? 0) > 1) {
      return { texto: "Número repetido en el PDF", tono: "amber" };
    }
    const existente = porNumero.get(Number(f.numero));
    if (existente) {
      return { texto: `Ya existe: ${existente}`, tono: "amber" };
    }
    return { texto: "Nuevo", tono: "green" };
  }

  // --- Crear ---------------------------------------------------------------
  async function crear() {
    if (incluidas.length === 0) {
      setError("No hay ninguna tarjeta marcada.");
      return;
    }
    if (sinNombre > 0) {
      setError(
        `Hay ${sinNombre} ${plural(sinNombre, "tarjeta sin nombre", "tarjetas sin nombre")}: escríbelo o quítale la marca.`,
      );
      return;
    }

    setError("");
    setResultado("");
    setGuardando(true);
    setPaso("Creando los territorios…");

    try {
      const carga = incluidas.map((f) => ({
        pagina: f.pagina,
        numero: f.numero ? Number(f.numero) : null,
        nombre: f.nombre.trim(),
      }));
      const r = await importarTarjetasAction(JSON.stringify(carga));
      if (!r.ok) {
        setError(r.error ?? "No se pudo crear ninguno.");
        return;
      }

      let mensaje = r.mensaje ?? "Listo.";

      // Segundo paso: cada página, guardada como el mapa de su territorio.
      const datos = datosRef.current;
      if (conMapas && datos && r.paginas.length > 0) {
        setPaso("Separando el PDF en imágenes…");
        const hojas = await paginasComoImagenes(datos, {
          alAvanzar: (hechas, total) =>
            setPaso(`Dibujando la página ${hechas} de ${total}…`),
        });
        const porPagina = new Map(hojas.map((h) => [h.pagina, h]));

        let subidos = 0;
        let fallos = 0;
        let hechas = 0;
        for (const destino of r.paginas) {
          const hoja = porPagina.get(destino.pagina);
          hechas += 1;
          if (!hoja) continue;
          setPaso(`Guardando el mapa ${hechas} de ${r.paginas.length}…`);
          try {
            const cuerpo = new FormData();
            cuerpo.append(
              "imagen",
              new File([hoja.blob], `mapa-${hoja.pagina}.jpg`, {
                type: "image/jpeg",
              }),
            );
            cuerpo.append("pagina", String(hoja.pagina));
            const resp = await fetch(
              `/api/territorios/${destino.territoryId}/mapa`,
              { method: "POST", body: cuerpo },
            );
            if (resp.ok) subidos += 1;
            else fallos += 1;
          } catch {
            fallos += 1;
          }
        }
        mensaje +=
          ` Se ${plural(subidos, "guardó", "guardaron")} ${subidos} ${plural(subidos, "mapa", "mapas")}` +
          (fallos > 0 ? `, y ${fallos} no se ${plural(fallos, "pudo", "pudieron")} guardar.` : ".");
      }

      setResultado(mensaje);
      limpiar();
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `No se pudo completar: ${err.message}`
          : "No se pudo completar la importación.",
      );
    } finally {
      setGuardando(false);
      setPaso("");
    }
  }

  const ocupado = leyendo || guardando;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className={BOTON_ARCHIVO}>
          <span aria-hidden>📄</span>
          {leyendo ? "Leyendo el PDF…" : "Elegir el PDF de las tarjetas"}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={ocupado}
            onChange={alElegirPdf}
          />
        </label>
        {ocupado && paso ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <span
              aria-hidden
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-primary"
            />
            {paso}
          </span>
        ) : null}
        {nombreArchivo && !ocupado ? (
          <span className="text-sm text-muted">{nombreArchivo}</span>
        ) : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {resultado ? <Alert tone="success">{resultado}</Alert> : null}

      {lectura && filas.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-slate-50 px-4 py-3 text-sm">
            <p className="font-semibold text-foreground">
              Se {plural(filas.length, "reconoció", "reconocieron")}{" "}
              {filas.length} {plural(filas.length, "territorio", "territorios")}{" "}
              en {lectura.paginas}{" "}
              {plural(lectura.paginas, "página", "páginas")}
            </p>
            <p className="mt-0.5 text-muted">
              Formato detectado: {FORMATO_LABELS[lectura.formato].toLowerCase()}.
              Revisa la tabla y corrige lo que haga falta antes de crear.
            </p>
            {lectura.avisos.map((a) => (
              <p key={a} className="mt-1 text-amber-700">
                {a}
              </p>
            ))}
            {yaExisten > 0 ? (
              <p className="mt-1 text-amber-700">
                {yaExisten}{" "}
                {plural(yaExisten, "número ya existe", "números ya existen")} en
                tu lista: {plural(yaExisten, "ese territorio", "esos territorios")}{" "}
                no se {plural(yaExisten, "vuelve", "vuelven")} a crear.
              </p>
            ) : null}
            {repetidas > 0 ? (
              <p className="mt-1 text-amber-700">
                Hay números repetidos dentro del PDF: solo se creará el primero
                de cada uno.
              </p>
            ) : null}
          </div>

          <label className="flex items-start gap-2 rounded-xl border border-border px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={conMapas}
              disabled={!lectura.unaPorPagina || ocupado}
              onChange={(e) => setConMapas(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span>
              <span className="font-medium text-foreground">
                Guardar también cada página como el mapa de su territorio
              </span>
              <span className="mt-0.5 block text-muted">
                {lectura.unaPorPagina
                  ? "La tarjeta del territorio lleva su mapa dibujado, así que sirve igual. Reemplaza el mapa que ya tuviera. Dibujarlos tarda alrededor de un minuto cada veinte páginas: deja esta pestaña abierta y a la vista mientras trabaja."
                  : "No se puede: este PDF trae varias tarjetas en la misma hoja, así que una página no es el mapa de un solo territorio."}
              </span>
            </span>
          </label>

          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <thead>
                <tr>
                  <Th className="w-14">Crear</Th>
                  {/* En el teléfono no caben las cinco columnas: la página
                      sobra y el estado se enseña debajo del nombre. */}
                  <Th className="hidden w-16 sm:table-cell">Pág.</Th>
                  <Th className="w-20">N.º</Th>
                  <Th>Nombre</Th>
                  <Th className="hidden md:table-cell">Qué pasará</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const estado = estadoDe(f);
                  return (
                    <tr key={`${f.pagina}-${i}`}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={f.incluir}
                          disabled={ocupado}
                          onChange={(e) =>
                            cambiar(i, { incluir: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-border"
                          aria-label={`Crear el territorio de la página ${f.pagina}`}
                        />
                      </Td>
                      <Td className="hidden tabular-nums text-muted sm:table-cell">
                        {f.pagina}
                      </Td>
                      <Td>
                        <Input
                          type="number"
                          min={1}
                          max={9999}
                          value={f.numero}
                          disabled={ocupado}
                          onChange={(e) => cambiar(i, { numero: e.target.value })}
                          className="w-16"
                          aria-label={`Número del territorio de la página ${f.pagina}`}
                        />
                      </Td>
                      <Td>
                        <Input
                          value={f.nombre}
                          maxLength={120}
                          disabled={ocupado}
                          onChange={(e) => cambiar(i, { nombre: e.target.value })}
                          placeholder="Nombre del territorio"
                          aria-label={`Nombre del territorio de la página ${f.pagina}`}
                        />
                        <span className="mt-1 block md:hidden">
                          <Badge tone={estado.tono}>{estado.texto}</Badge>
                        </span>
                      </Td>
                      <Td className="hidden md:table-cell">
                        <Badge tone={estado.tono}>{estado.texto}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={crear} disabled={ocupado || incluidas.length === 0}>
              {guardando
                ? paso || "Creando…"
                : `✅ Crear ${incluidas.length} ${plural(incluidas.length, "territorio", "territorios")}`}
            </Button>
            <Button variant="secondary" disabled={ocupado} onClick={limpiar}>
              Descartar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
