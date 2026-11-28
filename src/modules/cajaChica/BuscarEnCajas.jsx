import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { abrirArchivo } from "../../lib/archivos";
import { buscarEnGastos } from "./buscarEnGastos.js";

// BUSCAR EN TODAS LAS CAJAS (Hernán, 28/11/2026: «en caja chica quiero poder
// escribir RUC, factura o nombre del establecimiento y que me salgan todos los
// gastos relacionados a esa compra, y en qué caja chica está»).
//
// El buscador de adentro de una caja busca solo en esa: «¿dónde quedó la
// factura de Kywi?» obligaba a entrar caja por caja.

const fecha = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "2-digit" }) : "");
const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BuscarEnCajas({ cajas = [], onAbrir }) {
  const [texto, setTexto] = useState("");
  const [gastos, setGastos] = useState(null);
  const [cierres, setCierres] = useState({});
  const [error, setError] = useState("");
  const clave = cajas.map(c => c.id).join(",");

  // Se leen al empezar a escribir, no al abrir la lista: la mayoría de las
  // veces se entra a una caja y nadie busca.
  const quiere = texto.trim().length >= 2;
  useEffect(() => {
    const ids = clave.split(",").filter(Boolean).map(Number);
    if (!quiere || gastos || !ids.length) return undefined;
    let vivo = true;
    (async () => {
      const filas = [], vueltas = {};
      for (let i = 0; i < ids.length; i += 100) {
        const parte = ids.slice(i, i + 100);
        const [{ data, error: e }, { data: cs }] = await Promise.all([
          supabase.from("cajas_gastos")
            .select("id,caja_id,descripcion,proveedor,ruc,numero_factura,monto,fecha,tipo,estado,notas,archivo_url,archivo_nombre,cierre_id,subido_por_nombre")
            .in("caja_id", parte).order("fecha", { ascending: false }),
          supabase.from("cajas_cierres").select("id,numero").in("caja_id", parte),
        ]);
        if (e) throw new Error(e.message);
        filas.push(...(data || []));
        (cs || []).forEach(c => { vueltas[c.id] = c.numero; });
      }
      if (vivo) { setGastos(filas); setCierres(vueltas); }
    })().catch(e => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [quiere, clave, gastos]);

  const resultado = useMemo(() => (quiere && gastos ? buscarEnGastos(gastos, texto) : null), [quiere, gastos, texto]);
  const caja = id => cajas.find(c => c.id === id);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px" }}>
        <Search size={14} color="var(--muted)" />
        <input value={texto} onChange={e => setTexto(e.target.value)}
          placeholder="Buscar en todas las cajas: RUC, número de factura, local o lo que se compró"
          style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "var(--font)", background: "transparent", color: "var(--ink)", minWidth: 0 }} />
        {texto && <button onClick={() => setTexto("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex", padding: 0 }}><X size={14} /></button>}
      </div>

      {quiere && error && <div style={{ fontSize: 12, color: "var(--danger)", padding: "8px 4px" }}>No se pudo buscar: {error}</div>}
      {quiere && !gastos && !error && <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 4px" }}>Buscando…</div>}

      {resultado && (
        <div className="busqueda-en-cajas" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, marginTop: 6, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", fontSize: 12.5, background: "var(--neutral-soft)", color: "var(--ink)" }}>
            {resultado.length
              ? <><strong>{resultado.length}</strong> {resultado.length === 1 ? "gasto" : "gastos"} · <strong>${plata(resultado.reduce((t, g) => t + (Number(g.monto) || 0), 0))}</strong>
                  {" "}en {new Set(resultado.map(g => g.caja_id)).size} {new Set(resultado.map(g => g.caja_id)).size === 1 ? "caja" : "cajas"}</>
              : <>Ningún gasto dice «{texto.trim()}».</>}
          </div>
          {resultado.slice(0, 200).map(g => {
            const c = caja(g.caja_id);
            return (
              <div key={g.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 12px", borderTop: "1px solid var(--neutral-soft)", fontSize: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--ink)", fontWeight: 600 }}>{g.proveedor || "Sin proveedor"}
                    {g.numero_factura && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · #{g.numero_factura}</span>}
                    {g.ruc && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · RUC {g.ruc}</span>}
                  </div>
                  <div style={{ color: "var(--ink-soft)" }}>{g.descripcion}</div>
                  <div style={{ color: "var(--muted)", fontSize: 11 }}>
                    {fecha(g.fecha)} · <button onClick={() => c && onAbrir?.(c)}
                      style={{ background: "none", border: "none", padding: 0, color: "var(--brand)", cursor: "pointer", fontSize: 11, fontFamily: "var(--font)", textDecoration: "underline" }}>
                      {c ? `${c.proyecto_nombre} — ${c.responsable_nombre}` : `caja ${g.caja_id}`}
                    </button>
                    {" · "}{g.cierre_id ? `vuelta N° ${cierres[g.cierre_id] ?? "?"}` : "por rendir"}
                    {g.estado && g.estado !== "aprobado" ? ` · ${g.estado}` : ""}
                    {g.archivo_url && <> · <button onClick={() => abrirArchivo(g.archivo_url, { nombre: g.archivo_nombre })}
                      style={{ background: "none", border: "none", padding: 0, color: "var(--brand)", cursor: "pointer", fontSize: 11, fontFamily: "var(--font)", textDecoration: "underline" }}>ver papel</button></>}
                  </div>
                </div>
                <div style={{ fontWeight: 600, color: Number(g.monto) < 0 ? "var(--success)" : "var(--ink)", whiteSpace: "nowrap" }}>${plata(g.monto)}</div>
              </div>
            );
          })}
          {resultado.length > 200 && <div style={{ padding: 8, fontSize: 11, color: "var(--muted)" }}>Se muestran los 200 más nuevos: afiná la búsqueda.</div>}
        </div>
      )}
    </div>
  );
}
