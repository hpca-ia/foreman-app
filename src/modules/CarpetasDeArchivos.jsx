import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { supabase } from "../lib/supabase";
import { inputStyle } from "../components/ui/Input";
import Button from "../components/ui/Button";
import { abrirArchivo } from "../lib/archivos";
import { queEsLaCarpeta, quePedir, armarIndice, indiceEnCsv, porProyecto, detalleDe, nombreLegible, CON_SUBCARPETAS } from "../lib/carpetasDeArchivos.js";

// Todos los archivos de FOREMAN, por proyecto.
//
// En el depósito se guardan por número (`obra-12/`), y en Supabase solo se ve
// eso. Acá cada proyecto muestra sus grupos —facturas, compras, actas…— y cada
// archivo se abre. Es el mismo orden que el respaldo deja en Dropbox, en
// /FOREMAN/respaldos/por-proyecto.

const BUCKET = "task-files";
const LOTE = 1000;

/** Lo que hay en una carpeta del depósito: { carpetas: [], archivos: [{ ruta, nombre }] }. */
async function contenido(prefijo) {
  const carpetas = [], archivos = [];
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefijo, { limit: LOTE, offset: desde, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(error.message);
    // Las carpetas vienen sin id; los archivos, con.
    for (const d of data || []) {
      if (d.name === ".emptyFolderPlaceholder") continue;
      if (d.id) archivos.push({ ruta: prefijo ? `${prefijo}/${d.name}` : d.name, nombre: d.name });
      else carpetas.push(d.name);
    }
    if (!data || data.length < LOTE) return { carpetas, archivos };
  }
}

/** Todos los archivos de una carpeta, entrando en sus subcarpetas. */
async function archivosDe(prefijo) {
  const { carpetas, archivos } = await contenido(prefijo);
  for (const c of carpetas) archivos.push(...await archivosDe(`${prefijo}/${c}`));
  return archivos;
}

async function leer(tabla, columnas, ids) {
  const filas = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from(tabla).select(columnas).in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...(data || []));
  }
  return filas;
}

async function cargarIndice() {
  const arriba = (await contenido("")).carpetas;
  const rutas = [];
  for (const n of arriba) {
    if (CON_SUBCARPETAS.includes(n)) (await contenido(n)).carpetas.forEach(s => rutas.push(`${n}/${s}`));
    else rutas.push(n);
  }
  const carpetas = rutas.map(queEsLaCarpeta);

  const filas = {};
  for (const [tabla, p] of Object.entries(quePedir(carpetas))) filas[tabla] = await leer(tabla, p.columnas, p.ids);

  // El proyecto y la obra de cada ficha, aunque no tengan carpeta propia.
  const faltan = (tabla, campo) => {
    const ya = new Set((filas[tabla] || []).map(f => Number(f.id)));
    return [...new Set(Object.values(filas).flat().map(f => Number(f[campo])).filter(id => id && !ya.has(id)))];
  };
  const obras = faltan("obras", "obra_id");
  if (obras.length) filas.obras = [...(filas.obras || []), ...await leer("obras", "id,nombre,lead_id", obras)];
  const leads = faltan("leads", "lead_id");
  if (leads.length) filas.leads = [...(filas.leads || []), ...await leer("leads", "id,nombre", leads)];

  return armarIndice(carpetas, filas);
}

/** Una carpeta (la compra, el acta, el día…): al abrirla, sus archivos. */
function Carpeta({ i }) {
  const titulo = detalleDe(i);
  // Sin subtítulo (las facturas de la obra que es el proyecto, los archivos
  // del proyecto) los archivos van directo bajo el grupo, ya abiertos.
  const [abierta, setAbierta] = useState(!titulo);
  const [archivos, setArchivos] = useState(null);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try { setArchivos(await archivosDe(i.carpeta)); } catch (e) { setError(e.message); }
  }, [i.carpeta]);
  useEffect(() => { if (!titulo) cargar(); }, [titulo, cargar]);

  function alternar() {
    setAbierta(!abierta);
    if (!abierta && !archivos) cargar();
  }

  const lista = (
    <div style={{ paddingLeft: titulo ? 18 : 0 }}>
      {error && <div style={{ fontSize: 12, color: "var(--danger)" }}>No se pudo leer: {error}</div>}
      {!archivos && !error && <div style={{ fontSize: 12, color: "var(--ink-soft)", padding: "2px 0" }}>Leyendo…</div>}
      {archivos?.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-soft)", padding: "2px 0" }}>Vacía</div>}
      {archivos?.map(a => (
        <button key={a.ruta} onClick={() => abrirArchivo(a.ruta, { nombre: a.nombre })}
          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "3px 0", fontSize: 12, color: "var(--brand)", cursor: "pointer", fontFamily: "var(--font)" }}>
          {nombreLegible(a.ruta.split("/").pop())}
          {a.ruta.split("/").length > i.carpeta.split("/").length + 1 && <span style={{ color: "var(--ink-soft)" }}> · {a.ruta.slice(i.carpeta.length + 1).split("/").slice(0, -1).join("/")}</span>}
        </button>
      ))}
    </div>
  );

  if (!titulo) return lista;
  return (
    <div>
      <button onClick={alternar} style={fila}>
        {abierta ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{titulo}</span>
        <span style={{ color: "var(--ink-soft)", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{i.carpeta}</span>
      </button>
      {abierta && lista}
    </div>
  );
}

const fila = { display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", background: "none", border: "none", padding: "4px 0", fontSize: 12, color: "var(--ink)", cursor: "pointer", fontFamily: "var(--font)" };

function Desplegable({ titulo, cuenta, fuerte, children, abiertoAlInicio = false }) {
  const [abierto, setAbierto] = useState(abiertoAlInicio);
  return (
    <div>
      <button onClick={() => setAbierto(!abierto)} style={{ ...fila, fontWeight: fuerte ? 700 : 600, fontSize: fuerte ? 13 : 12, padding: fuerte ? "8px 0" : "4px 0" }}>
        {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span>{titulo}</span>
        {cuenta != null && <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>({cuenta})</span>}
      </button>
      {abierto && <div style={{ paddingLeft: 18 }}>{children}</div>}
    </div>
  );
}

export default function CarpetasDeArchivos() {
  const [indice, setIndice] = useState(null);
  const [error, setError] = useState("");
  const [buscar, setBuscar] = useState("");

  useEffect(() => {
    let vivo = true;
    cargarIndice().then(i => vivo && setIndice(i)).catch(e => vivo && setError(e.message));
    return () => { vivo = false; };
  }, []);

  const proyectos = useMemo(() => {
    if (!indice) return [];
    const q = buscar.trim().toLowerCase();
    const filtrado = !q ? indice : indice.filter(i => [i.carpeta, i.grupo, i.nombre, i.proyecto, i.obra].some(v => String(v || "").toLowerCase().includes(q)));
    return porProyecto(filtrado);
  }, [indice, buscar]);

  function descargar() {
    const blob = new Blob([indiceEnCsv(indice)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `foreman-carpetas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const caja = { background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "14px 16px", marginBottom: 10 };

  return (
    <div>
      <div style={caja}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Archivos por proyecto</div>
        <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}>
          Todos los archivos de FOREMAN, por proyecto. El respaldo los deja en el mismo orden en Dropbox
          (/FOREMAN/respaldos/por-proyecto). En Supabase las carpetas llevan el número de la ficha: al lado de cada una va ese número.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar proyecto, compra, acta…" style={{ ...inputStyle, maxWidth: 320 }} />
          <Button size="sm" variant="secondary" onClick={descargar} disabled={!indice?.length}>Descargar lista (Excel)</Button>
        </div>
      </div>

      {error && <div style={{ ...caja, borderColor: "var(--danger)", color: "var(--danger)", fontSize: 13 }}>No se pudo leer: {error}</div>}
      {!indice && !error && <div style={{ fontSize: 12, color: "var(--ink-soft)", padding: 8 }}>Leyendo las carpetas…</div>}
      {indice && !proyectos.length && <div style={{ fontSize: 12, color: "var(--ink-soft)", padding: 8 }}>Nada con «{buscar}».</div>}

      {indice && proyectos.length > 0 && (
        <div style={{ ...caja, padding: "6px 16px" }}>
          {proyectos.map(p => (
            <Desplegable key={p.proyecto} titulo={p.proyecto} fuerte abiertoAlInicio={proyectos.length === 1}>
              {p.grupos.map(g => (
                <Desplegable key={g.grupo} titulo={g.grupo} cuenta={g.carpetas.filter(detalleDe).length || null}>
                  {g.carpetas.map(i => <Carpeta key={i.carpeta} i={i} />)}
                </Desplegable>
              ))}
            </Desplegable>
          ))}
        </div>
      )}
    </div>
  );
}
