import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Search, X, FileText, ChevronRight, ChevronDown } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { abrirArchivo } from "../../lib/archivos";
import { fmt } from "./calculos";
import { CLASES_DOC } from "./pagos";
import { proveedoresDeTodo, totalesDeTodo, buscar } from "./proveedoresGlobal";

// TODOS LOS PROVEEDORES, DE TODAS LAS OBRAS.
//
// Adentro de una obra, la pestaña Proveedores contesta "¿cuánto le debo acá?".
// Esta contesta la pregunta con la que se negocia: cuánto le compramos a este
// proveedor en total, en cuántos proyectos, y qué le compró cada uno. Repartido
// por obra no lo sabe nadie —y el proveedor sí lo sabe—.

const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "2-digit" }) : "");

export default function ProveedoresDeTodo({ obras = [], nombreDeObra, onVolver }) {
  const [facturas, setFacturas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(null);       // clave del proveedor
  const [obraAbierta, setObraAbierta] = useState(null); // `${clave}-${obraId}`

  const ids = useMemo(() => obras.map(o => o.id), [obras]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      if (!ids.length) { setFacturas([]); setPagos([]); setCargando(false); return; }
      const [{ data: fs }, { data: ps }] = await Promise.all([
        supabase.from("obra_facturas").select("*").in("obra_id", ids),
        supabase.from("obra_pagos").select("factura_id,monto").in("obra_id", ids),
      ]);
      if (!vivo) return;
      setFacturas(fs || []); setPagos(ps || []); setCargando(false);
    })();
    return () => { vivo = false; };
  }, [ids]);

  const cuentas = useMemo(
    () => proveedoresDeTodo(facturas, pagos, nombreDeObra),
    [facturas, pagos, nombreDeObra]);
  const vistas = buscar(cuentas, texto);
  const totales = totalesDeTodo(cuentas);

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <Button variant="secondary" size="sm" onClick={onVolver}><ArrowLeft size={13} /> Obras</Button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>Proveedores</div>
          <div style={{ fontSize: 11, color: colors.muted }}>
            Todo lo comprado en {obras.length} {obras.length === 1 ? "obra" : "obras"}, junto por proveedor
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", background: colors.bg, borderRadius: colors.radiusMd, padding: "11px 14px", marginBottom: 12 }}>
        <Dato titulo="PROVEEDORES" valor={totales.proveedores} moneda={false} />
        <Dato titulo="COMPRADO" valor={totales.comprado} />
        <Dato titulo="PAGADO" valor={totales.pagado} color={colors.success} />
        <Dato titulo="POR PAGAR" valor={totales.saldo} color={totales.saldo > 0.005 ? colors.danger : colors.muted} />
        {totales.credito > 0.005 && <Dato titulo="CRÉDITO A FAVOR" valor={totales.credito} color={colors.success} />}
      </div>

      <div style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <Search size={13} color={colors.muted} />
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por nombre o RUC…"
          style={{ border: "none", outline: "none", background: "transparent", fontSize: 12.5, fontFamily: colors.font, color: colors.ink, flex: 1, minWidth: 0 }} />
        {texto && <button onClick={() => setTexto("")} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 0 }}><X size={13} /></button>}
      </div>

      {cargando ? (
        <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Juntando las facturas de todas las obras…</div>
      ) : !vistas.length ? (
        <div style={{ textAlign: "center", color: colors.muted, padding: "40px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
          {cuentas.length ? "Ningún proveedor con ese nombre o RUC." : "Todavía no hay facturas cargadas."}
        </div>
      ) : vistas.map(c => {
        const esta = abierto === c.clave;
        return (
          <div key={c.clave} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 8 }}>
            <div onClick={() => setAbierto(esta ? null : c.clave)}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }}>
              {esta ? <ChevronDown size={14} color={colors.muted} /> : <ChevronRight size={14} color={colors.muted} />}
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>{c.nombre}</div>
                <div style={{ fontSize: 10.5, color: colors.muted }}>
                  {c.ruc || "sin RUC"} · {c.documentos} {c.documentos === 1 ? "documento" : "documentos"} ·{" "}
                  {c.obras.length} {c.obras.length === 1 ? "obra" : "obras"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>${fmt(c.comprado)}</div>
                <div style={{ fontSize: 10.5, color: c.saldo > 0.005 ? colors.danger : colors.success }}>
                  {c.saldo > 0.005 ? `debemos $${fmt(c.saldo)}` : "al día"}
                  {c.credito > 0.005 && <span style={{ color: colors.success }}> · ${fmt(c.credito)} a favor</span>}
                </div>
              </div>
            </div>

            {esta && (
              <div style={{ marginTop: 9, paddingTop: 8, borderTop: `1px solid ${colors.neutralSoft}` }}>
                {c.obras.map(o => {
                  const clave = `${c.clave}-${o.obraId}`;
                  const abierta = obraAbierta === clave;
                  return (
                    <div key={clave}>
                      <div onClick={() => setObraAbierta(abierta ? null : clave)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", borderTop: `1px solid ${colors.neutralSoft}` }}>
                        {abierta ? <ChevronDown size={12} color={colors.muted} /> : <ChevronRight size={12} color={colors.muted} />}
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: colors.ink, overflowWrap: "anywhere" }}>{o.nombre}</span>
                        <span style={{ fontSize: 10.5, color: colors.muted }}>
                          {o.documentos.length} {o.documentos.length === 1 ? "documento" : "documentos"}
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink }}>${fmt(o.comprado)}</span>
                      </div>

                      {abierta && o.documentos.map(d => (
                        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0 4px 20px", fontSize: 11.5, flexWrap: "wrap" }}>
                          <span style={{ color: colors.muted, minWidth: 62 }}>{dia(d.fecha)}</span>
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: d.esCredito ? colors.success : colors.muted, letterSpacing: 0.3 }}>
                            {(CLASES_DOC[d.clase] || CLASES_DOC.factura).label.toUpperCase()}
                          </span>
                          <span style={{ flex: 1, minWidth: 110, color: colors.inkSoft, overflowWrap: "anywhere" }}>
                            {d.numero_factura ? `${d.numero_factura} · ` : ""}{d.detalle || "sin detalle"}
                          </span>
                          {d.archivo_url && (
                            <button onClick={() => abrirArchivo(d.archivo_url)} title={d.archivo_nombre || "Ver el respaldo"}
                              style={{ background: "none", border: "none", color: colors.inkSoft, cursor: "pointer", display: "flex", padding: 0 }}>
                              <FileText size={13} />
                            </button>
                          )}
                          <span style={{ fontWeight: 600, color: d.esCredito ? colors.success : colors.ink }}>
                            {d.esCredito ? `a favor $${fmt(Math.abs(d.total))}` : `$${fmt(d.total)}`}
                          </span>
                          {!d.esCredito && d.saldo > 0.005 && (
                            <span style={{ fontSize: 10.5, color: colors.danger }}>falta ${fmt(d.saldo)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Dato({ titulo, valor, color, moneda = true }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>{titulo}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || colors.ink }}>{moneda ? `$${fmt(valor)}` : valor}</div>
    </div>
  );
}
