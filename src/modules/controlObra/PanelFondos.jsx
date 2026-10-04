import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { CLASES_FONDO, FORMAS, cargarFondos, guardarFondo, borrarFondo, estadoDeCaja, porPlanilla } from "./fondos";

// La caja del proyecto: con qué plata se está haciendo la obra.
//
// Arriba el estado —cuánto entró, cuánto se gastó, cuánto queda—; abajo, corte
// por corte, para contestar "¿en qué momento nos quedamos cortos?". Y al final
// lo único que se carga a mano: los anticipos.
//
// Los gastos no se escriben acá a propósito. Son las facturas del control, y
// escribirlos de nuevo sería tener dos listas que se contradicen.

const VACIO = { clase: "anticipo", concepto: "", monto: "", fecha: "", forma_pago: "transferencia", documento: "" };

export default function PanelFondos({ obra, planillas = [], facturas = [], currentUser, puede }) {
  const [fondos, setFondos] = useState([]);
  const [sinTabla, setSinTabla] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // La plata del proyecto la mueve quien registra facturas; el resto la mira.
  const puedeEditar = puede ? puede("facturas.registrar") : true;

  const cargar = useCallback(async () => {
    setCargando(true);
    const { fondos: f, sinTabla: falta } = await cargarFondos(obra.lead_id);
    setFondos(f); setSinTabla(falta); setCargando(false);
  }, [obra.lead_id]);
  useEffect(() => { cargar(); }, [cargar]);

  const caja = estadoDeCaja({ fondos, facturas });
  const cortes = porPlanilla({ planillas, facturas, fondos });

  async function guardar() {
    if (!form.concepto?.trim() && !form.monto) { setError("Falta el monto."); return; }
    setGuardando(true); setError("");
    const err = await guardarFondo({ ...form, lead_id: obra.lead_id, obra_id: obra.id }, currentUser);
    setGuardando(false);
    if (err) { setError(err); return; }
    setForm(null); cargar();
  }

  async function quitar(f) {
    if (!window.confirm(`¿Borrar "${f.concepto}" de $${fmt(Math.abs(f.monto))}?`)) return;
    const err = await borrarFondo(f.id);
    if (err) { setError(err); return; }
    cargar();
  }

  if (!obra.lead_id) {
    return (
      <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>
        Esta obra no está colgada de ningún proyecto, y la caja es del proyecto. Enganchala primero desde Control de Obra.
      </div>
    );
  }
  if (sinTabla) {
    return (
      <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>
        Falta correr la migración 068 en Supabase para usar la caja del proyecto.
      </div>
    );
  }

  const mini = { ...inputStyle, padding: "7px 9px", fontSize: 12.5 };
  const lbl = { fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };
  const celda = { padding: "8px 10px", fontSize: 12.5, borderTop: `1px solid ${colors.neutralSoft}` };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 16 }}>
        <Tarjeta label="Recibido" valor={caja.entrado} />
        <Tarjeta label="Gastado en obra" valor={caja.gastado} color={colors.ink} />
        {caja.salido > 0 && <Tarjeta label="Devuelto o traspasado" valor={caja.salido} color={colors.ink} />}
        <Tarjeta label="Queda en caja" valor={caja.saldo} color={caja.saldo < 0 ? colors.danger : colors.success} />
      </div>

      {caja.saldo < 0 && (
        <div style={{ fontSize: 12, color: colors.danger, background: colors.dangerSoft || colors.warningSoft,
          border: `1px solid ${colors.danger}`, borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 14 }}>
          La obra gastó ${fmt(-caja.saldo)} más de lo que entró. O falta registrar un anticipo, o el proyecto
          está financiando con plata de otro lado.
        </div>
      )}

      {/* Corte por corte: dónde se quedó corta la caja. */}
      {cortes.length > 0 && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden", marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(130px,1.6fr) 1fr 1fr 1fr 1fr", gap: 8, padding: "8px 10px",
            background: colors.bg, fontSize: 9, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
            <span>PLANILLA</span>
            <span style={{ textAlign: "right" }}>GASTO</span>
            <span style={{ textAlign: "right" }}>ACUMULADO</span>
            <span style={{ textAlign: "right" }}>RECIBIDO</span>
            <span style={{ textAlign: "right" }}>SALDO</span>
          </div>
          {cortes.map(c => (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "minmax(130px,1.6fr) 1fr 1fr 1fr 1fr", gap: 8, ...celda }}>
              <span style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</span>
              <span style={{ textAlign: "right" }}>${fmt(c.gasto)}</span>
              <span style={{ textAlign: "right", color: colors.muted }}>${fmt(c.acumulado)}</span>
              <span style={{ textAlign: "right", color: colors.muted }}>${fmt(c.recibido)}</span>
              <span style={{ textAlign: "right", fontWeight: 600, color: c.saldo < 0 ? colors.danger : colors.success }}>${fmt(c.saldo)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Lo que entró y salió de la caja</div>
        {puedeEditar && !form && (
          <Button variant="outline" size="sm" onClick={() => setForm({ ...VACIO, fecha: new Date().toISOString().slice(0, 10) })}>
            <Plus size={13} /> Anotar
          </Button>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 8, lineHeight: 1.5 }}>
        Los gastos no van acá: son las facturas del control de obra, y se restan solas. Acá va de dónde salió la plata.
      </div>

      {form && (
        <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12, display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
            <div>
              <label style={lbl}>QUÉ ES</label>
              <select value={form.clase} onChange={e => setForm(f => ({ ...f, clase: e.target.value }))} style={mini}>
                {CLASES_FONDO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>FECHA</label>
              <input type="date" value={form.fecha || ""} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={mini} />
            </div>
            <div>
              <label style={lbl}>MONTO (US$)</label>
              <input type="number" step="0.01" min="0" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                placeholder="Siempre en positivo" style={mini} />
            </div>
            <div>
              <label style={lbl}>CÓMO</label>
              <select value={form.forma_pago || ""} onChange={e => setForm(f => ({ ...f, forma_pago: e.target.value }))} style={mini}>
                {FORMAS.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
            <div>
              <label style={lbl}>CONCEPTO</label>
              <input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                placeholder="Ej: anticipo 30% contrato" style={mini} />
            </div>
            <div>
              <label style={lbl}>COMPROBANTE</label>
              <input value={form.documento || ""} onChange={e => setForm(f => ({ ...f, documento: e.target.value }))}
                placeholder="N° de cheque o transferencia" style={mini} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" size="sm" onClick={guardar} disabled={guardando}>Guardar</Button>
            <Button variant="outline" size="sm" onClick={() => { setForm(null); setError(""); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 8 }}>{error}</div>}

      {cargando ? (
        <div style={{ color: colors.muted, fontSize: 12.5, padding: "20px 0", textAlign: "center" }}>Cargando…</div>
      ) : !fondos.length ? (
        <div style={{ color: colors.muted, fontSize: 12.5, padding: "26px 14px", textAlign: "center",
          background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
          Todavía no se anotó ningún anticipo. Sin eso, el saldo de caja es todo lo gastado en negativo.
        </div>
      ) : (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
          {fondos.map(f => {
            const entra = Number(f.monto) > 0;
            const clase = CLASES_FONDO.find(c => c.id === f.clase);
            return (
              <div key={f.id} style={{ display: "grid", gridTemplateColumns: "minmax(140px,2fr) minmax(90px,1fr) 110px auto", gap: 8, alignItems: "center", ...celda }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: colors.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.concepto}
                  </div>
                  <div style={{ fontSize: 10.5, color: colors.muted }}>
                    {clase?.label || f.clase}{f.documento ? ` · ${f.documento}` : ""}{f.creado_nombre ? ` · ${f.creado_nombre}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 11.5, color: colors.muted }}>{f.fecha}</span>
                <span style={{ textAlign: "right", fontWeight: 700, color: entra ? colors.success : colors.danger }}>
                  {entra ? "+" : "−"}${fmt(Math.abs(f.monto))}
                </span>
                <span style={{ display: "flex", gap: 4 }}>
                  {puedeEditar && (
                    <>
                      <button onClick={() => setForm({ ...f, monto: Math.abs(f.monto) })} title="Corregir"
                        style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => quitar(f)} title="Borrar"
                        style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}>
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tarjeta({ label, valor, color }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px" }}>
      <div style={{ fontSize: 9.5, color: colors.muted, fontWeight: 700, letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: color || colors.ink, marginTop: 2 }}>${fmt(valor)}</div>
    </div>
  );
}
