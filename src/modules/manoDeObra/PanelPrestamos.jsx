import { useState, useEffect, useRef } from "react";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { conEstado, esDeLaPersona, nuevoPrestamo } from "./prestamos";
import { hoyEnObra } from "./permisoDeDias";
import { darPrestamo, abonarPrestamo, anularPrestamo } from "./rolGuardado";

// LOS PRÉSTAMOS DE LA GENTE DE ESTA OBRA.
//
// Se anota una vez —a quién, cuánto y cuánto se le descuenta por rol— y de ahí
// en más cada rol trae su cuota sola. Acá se ve cuánto debe cada uno, que es
// lo que pregunta el trabajador y lo que hasta hoy no estaba escrito en
// ningún lado.

const fmt = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "");
const hoy = () => hoyEnObra();
const EN_BLANCO = { personaId: "", fecha: "", monto: "", cuota: "", roles: "", motivo: "" };

/**
 * @param personal   la gente activa de la obra
 * @param nuevoPara  el id de la persona para la que se pidió anotar uno desde
 *                   el rol: abre el formulario con ella elegida
 */
export default function PanelPrestamos({ lead, personal = [], prestamos = [], cuotas = [], sinTabla = false, editable = true, quien, onCambio, nuevoPara = null, onAtendido }) {
  const [nuevo, setNuevo] = useState(null);
  const [abono, setAbono] = useState(null);   // { prestamo, fecha, monto, nota }
  const [verTerminados, setVerTerminados] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const aca = useRef(null);

  // Pedido desde el rol: «+ Préstamo» en los descuentos de una persona.
  useEffect(() => {
    if (!nuevoPara) return;
    setNuevo({ ...EN_BLANCO, personaId: String(nuevoPara), fecha: hoy() }); setError("");
    aca.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    onAtendido?.();
    // eslint-disable-next-line
  }, [nuevoPara]);

  // Los de la gente de esta obra, o los que se dieron en ella.
  const todos = conEstado(prestamos, cuotas)
    .filter(p => String(p.lead_id) === String(lead?.id) || personal.some(x => esDeLaPersona(p, x)));
  const vivos = todos.filter(p => !p.terminado);
  const terminados = todos.filter(p => p.terminado);
  const debe = vivos.reduce((t, p) => t + p.saldo, 0);

  // Lo que se va a guardar, dicho antes de guardar.
  const persona = personal.find(p => String(p.id) === String(nuevo?.personaId));
  const borrador = nuevo ? nuevoPrestamo({ persona, lead, fecha: nuevo.fecha, monto: nuevo.monto, cuota: nuevo.cuota, roles: nuevo.roles, quien }) : null;
  const plan = borrador?.fila
    ? `$${fmt(borrador.fila.cuota)} por rol · termina en ${Math.ceil((borrador.fila.monto - 0.005) / borrador.fila.cuota)} ${Math.ceil((borrador.fila.monto - 0.005) / borrador.fila.cuota) === 1 ? "rol" : "roles"}`
    : "";

  async function hacer(fn) {
    setTrabajando(true); setError("");
    const r = await fn();
    setTrabajando(false);
    if (r?.error) { setError(r.error); return false; }
    await onCambio?.();
    return true;
  }

  const guardar = async () => {
    if (await hacer(() => darPrestamo({ persona, lead, fecha: nuevo.fecha, monto: nuevo.monto, cuota: nuevo.cuota, roles: nuevo.roles, motivo: nuevo.motivo, quien }))) setNuevo(null);
  };
  const abonar = async () => {
    if (await hacer(() => abonarPrestamo({ prestamo: abono.prestamo, cuotas, fecha: abono.fecha, monto: abono.monto, nota: abono.nota, quien }))) setAbono(null);
  };

  const fila = p => (
    <div key={p.id} className="prestamo" style={{ borderTop: `1px solid ${colors.neutralSoft}`, padding: "9px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ fontSize: 12.5, color: colors.ink, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{p.nombre}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: p.terminado ? colors.success : colors.ink, whiteSpace: "nowrap" }}>
          {p.terminado ? "Pagado" : `Debe $${fmt(p.saldo)}`}
        </div>
      </div>
      <div style={{ fontSize: 11, color: colors.muted, marginTop: 2, lineHeight: 1.5 }}>
        Prestado ${fmt(p.monto)} el {dia(p.fecha)} · cuota ${fmt(p.cuota)} por rol
        {p.motivo ? ` · ${p.motivo}` : ""}
        <br />
        {p.cuotas ? `Descontado $${fmt(p.pagado)} en ${p.cuotas} ${p.cuotas === 1 ? "vez" : "veces"}` : "Todavía no se le descontó nada"}
        {!p.terminado ? ` · le ${p.faltan === 1 ? "falta 1 rol" : `faltan ${p.faltan} roles`}` : ""}
      </div>
      {editable && !p.terminado && (
        <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
          <button onClick={() => { setAbono({ prestamo: p, fecha: hoy(), monto: "", nota: "" }); setError(""); }} style={enlace}>Abono a mano</button>
          {p.cuotas === 0 && (
            <button onClick={() => { if (window.confirm(`¿Anular el préstamo de $${fmt(p.monto)} a ${p.nombre}? Se usa cuando se cargó mal.`)) hacer(() => anularPrestamo(p, cuotas)); }}
              disabled={trabajando} style={{ ...enlace, color: colors.danger }}>Anular</button>
          )}
        </div>
      )}
      {abono?.prestamo.id === p.id && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 7 }}>
          <input type="date" value={abono.fecha} aria-label="Fecha del abono" onChange={e => setAbono(a => ({ ...a, fecha: e.target.value }))} style={{ ...chico, width: 140 }} />
          <input type="number" min="0" step="0.01" value={abono.monto} placeholder="Cuánto abonó" aria-label="Cuánto abonó" autoFocus
            onChange={e => setAbono(a => ({ ...a, monto: e.target.value }))} style={{ ...chico, width: 120 }} />
          <input value={abono.nota} placeholder="Nota (opcional): pagó en efectivo…" aria-label="Nota del abono"
            onChange={e => setAbono(a => ({ ...a, nota: e.target.value }))} style={{ ...chico, flex: "1 1 160px", minWidth: 0 }} />
          <Button variant="primary" size="sm" disabled={trabajando} onClick={abonar}>Guardar abono</Button>
          <Button variant="outline" size="sm" onClick={() => setAbono(null)}>Cancelar</Button>
        </div>
      )}
    </div>
  );

  return (
    <div ref={aca} className="panel-prestamos" style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Préstamos</div>
        {vivos.length > 0 && (
          <div style={{ fontSize: 12, color: colors.inkSoft }}>
            {vivos.length} {vivos.length === 1 ? "abierto" : "abiertos"} · deben ${fmt(debe)}
          </div>
        )}
        {editable && !sinTabla && !nuevo && (
          <div style={{ marginLeft: "auto" }}>
            <Button variant="outline" size="sm" onClick={() => { setNuevo({ ...EN_BLANCO, fecha: hoy() }); setError(""); }}><Plus size={13} /> Préstamo</Button>
          </div>
        )}
      </div>

      {sinTabla ? (
        <div style={{ fontSize: 12, color: colors.warning, lineHeight: 1.55 }}>
          Para anotar préstamos falta correr la migración 177 en Supabase. Mientras tanto el descuento se escribe a mano en cada rol, como hasta ahora.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: colors.muted, lineHeight: 1.55, marginBottom: 8 }}>
            Se anota una vez y cada rol trae su cuota sola hasta que el saldo llega a cero. En un rol puntual se puede
            cambiar el monto —o poner 0— desde los descuentos de la persona.
          </div>

          {nuevo && (
            <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
                <label style={etiqueta}>A quién
                  <select value={nuevo.personaId} onChange={e => setNuevo(x => ({ ...x, personaId: e.target.value }))} style={chico}>
                    <option value="">Elegí a la persona</option>
                    {personal.map(p => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
                  </select>
                </label>
                <label style={etiqueta}>Fecha en que se le dio
                  <input type="date" value={nuevo.fecha} onChange={e => setNuevo(x => ({ ...x, fecha: e.target.value }))} style={chico} />
                </label>
                <label style={etiqueta}>Cuánto se le presta
                  <input type="number" min="0" step="0.01" value={nuevo.monto} placeholder="0,00" onChange={e => setNuevo(x => ({ ...x, monto: e.target.value }))} style={chico} />
                </label>
                {/* La cuota se escribe, o sale de en cuántos roles lo paga:
                    son dos maneras de decir lo mismo y vale la última tocada. */}
                <label style={etiqueta}>Cuota por rol
                  <input type="number" min="0" step="0.01" value={nuevo.cuota} placeholder="0,00"
                    onChange={e => setNuevo(x => ({ ...x, cuota: e.target.value, roles: "" }))} style={chico} />
                </label>
                <label style={etiqueta}>o en cuántos roles
                  <input type="number" min="1" step="1" value={nuevo.roles} placeholder="6"
                    onChange={e => setNuevo(x => ({ ...x, roles: e.target.value, cuota: "" }))} style={chico} />
                </label>
                <label style={{ ...etiqueta, gridColumn: "1 / -1" }}>Motivo (opcional)
                  <input value={nuevo.motivo} placeholder="Para qué fue, o quién lo autorizó" onChange={e => setNuevo(x => ({ ...x, motivo: e.target.value }))} style={chico} />
                </label>
              </div>
              <div style={{ fontSize: 11, color: plan ? colors.inkSoft : colors.muted, marginTop: 8 }}>
                {plan || "Con el monto y la cuota te digo en cuántos roles termina."}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {/* El botón no se apaga por falta de datos: se toca y dice qué falta. */}
                <Button variant="primary" size="sm" disabled={trabajando} onClick={() => (borrador?.error ? setError(borrador.error) : guardar())}>
                  {trabajando ? "Guardando…" : "Guardar préstamo"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setNuevo(null); setError(""); }}>Cancelar</Button>
              </div>
            </div>
          )}

          {error && <div role="alert" style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}>{error}</div>}

          {vivos.length > 0 ? (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
              <div style={{ marginTop: -1 }}>{vivos.map(fila)}</div>
            </div>
          ) : !nuevo && (
            <div style={{ fontSize: 12, color: colors.muted }}>Nadie de esta obra debe un préstamo.</div>
          )}

          {terminados.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setVerTerminados(v => !v)} style={{ ...enlace, display: "inline-flex", alignItems: "center", gap: 4 }}>
                {verTerminados ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {terminados.length === 1 ? "1 ya pagado" : `${terminados.length} ya pagados`}
              </button>
              {verTerminados && (
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden", marginTop: 6 }}>
                  <div style={{ marginTop: -1 }}>{terminados.map(fila)}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const chico = { ...inputStyle, padding: "6px 9px", fontSize: 12.5 };
const etiqueta = { display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, fontWeight: 600, color: colors.muted };
const enlace = { background: "none", border: "none", padding: 0, fontFamily: colors.font, fontSize: 11, fontWeight: 600, color: colors.inkSoft, cursor: "pointer" };
