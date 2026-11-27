import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { inputStyle } from "../components/ui/Input";
import Button from "../components/ui/Button";
import { queEsLaCarpeta, quePedir, armarIndice, indiceEnCsv, CON_SUBCARPETAS } from "../lib/carpetasDeArchivos.js";

// Las carpetas del depósito, cada una con su nombre.
//
// Los archivos se guardan por número (`obra-12/`), y en Supabase o en el
// respaldo de Dropbox solo se ve eso. Acá se lee qué carpetas hay de verdad y
// a qué ficha corresponde cada una. La lista se descarga en CSV para tenerla
// a mano sin FOREMAN.

const BUCKET = "task-files";
const LOTE = 1000;

/** Los nombres de lo que hay dentro de una carpeta del depósito, solo carpetas. */
async function subcarpetas(prefijo) {
  const nombres = [];
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefijo, { limit: LOTE, offset: desde, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(error.message);
    // Las carpetas vienen sin id; los archivos, con.
    (data || []).filter(d => !d.id).forEach(d => nombres.push(d.name));
    if (!data || data.length < LOTE) return nombres;
  }
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
  const arriba = await subcarpetas("");
  const rutas = [];
  for (const n of arriba) {
    if (CON_SUBCARPETAS.includes(n)) (await subcarpetas(n)).forEach(s => rutas.push(`${n}/${s}`));
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

export default function CarpetasDeArchivos() {
  const [indice, setIndice] = useState(null);
  const [error, setError] = useState("");
  const [buscar, setBuscar] = useState("");

  useEffect(() => {
    let vivo = true;
    cargarIndice().then(i => vivo && setIndice(i)).catch(e => vivo && setError(e.message));
    return () => { vivo = false; };
  }, []);

  const visibles = useMemo(() => {
    if (!indice) return [];
    const q = buscar.trim().toLowerCase();
    if (!q) return indice;
    return indice.filter(i => [i.carpeta, i.que, i.nombre, i.proyecto, i.obra].some(v => String(v || "").toLowerCase().includes(q)));
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
  const th = { textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--ink-soft)", padding: "6px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  const td = { fontSize: 12, color: "var(--ink)", padding: "6px 8px", borderBottom: "1px solid var(--border)", verticalAlign: "top" };

  return (
    <div>
      <div style={caja}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Carpetas de archivos</div>
        <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}>
          En Supabase (Storage → task-files) y en el respaldo de Dropbox (/FOREMAN/respaldos/archivos/task-files) las carpetas
          llevan el número de la ficha, no su nombre. Acá está cada carpeta con lo que es. Descarga la lista para tenerla sin FOREMAN.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar obra, proyecto o carpeta…" style={{ ...inputStyle, maxWidth: 320 }} />
          <Button size="sm" variant="secondary" onClick={descargar} disabled={!indice?.length}>Descargar lista (Excel)</Button>
          {indice && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{visibles.length} de {indice.length} carpetas</span>}
        </div>
      </div>

      {error && <div style={{ ...caja, borderColor: "var(--danger)", color: "var(--danger)", fontSize: 13 }}>No se pudo leer: {error}</div>}
      {!indice && !error && <div style={{ fontSize: 12, color: "var(--ink-soft)", padding: 8 }}>Leyendo las carpetas…</div>}

      {indice && (
        <div style={{ ...caja, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Carpeta</th><th style={th}>Qué es</th><th style={th}>Nombre</th><th style={th}>Proyecto</th><th style={th}>Obra</th></tr></thead>
            <tbody>
              {visibles.map(i => (
                <tr key={i.carpeta}>
                  <td style={{ ...td, fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>{i.carpeta}</td>
                  <td style={{ ...td, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>{i.que}</td>
                  <td style={td}>{i.borrada ? <span style={{ color: "var(--warning)" }}>Ya no existe en FOREMAN</span> : i.nombre}</td>
                  <td style={td}>{i.proyecto}</td>
                  <td style={td}>{i.obra}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
