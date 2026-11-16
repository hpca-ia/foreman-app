import { useState, useEffect, useCallback, useRef } from "react";
import { UserPlus, Pencil, X } from "lucide-react";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { cambiosAlEditar, filaDeSiempre, personaDeLaFicha, dondeFigura, figuraEnDocumentos, correoLimpio }
  from "../controlObra/directorioDelProyecto.js";
import { involucradosDe, aplicarCambios, agregarALaFicha, ponerDeSiempre, sacarDeSiempre, quitarDeLoCargado } from "./involucrados";

// TODOS LOS INVOLUCRADOS DEL PROYECTO, en un solo lugar.
//
// Hernán, 16/11/2026: «¿en dónde administro los involucrados en el proyecto
// para correos de ODC, libro de obra, actas?» y, mirando esta pestaña, que
// mostraba solo al equipo: «ahí deberían aparecer todos los involucrados...
// cada vez que se agregue alguien se actualiza ese cuadro».
//
// La lista no se carga: se arma sola de los cinco lugares donde la gente ya
// está escrita —los de siempre del acta, lo cargado acá, los asistentes de las
// actas, los firmantes de las órdenes y a quién se le mandó el libro—. Por eso
// quien entra por cualquiera de esos lados aparece acá sin que nadie lo pase.
//
// Desde acá se agrega, se corrige y se marca quién es «de siempre». Lo que no
// se puede es borrar a alguien de un acta, una orden o un libro ya enviados:
// esos son documentos.

const vacio = { nombre: "", rol: "cliente", email: "", telefono: "" };
const limpio = v => String(v || "").trim();
/** ¿El borrador dice lo mismo que lo guardado? */
const iguales = (p, b) => limpio(p.nombre) === limpio(b.nombre) && limpio(p.empresa) === limpio(b.empresa)
  && limpio(p.cargo) === limpio(b.cargo) && correoLimpio(p.email) === correoLimpio(b.email)
  && limpio(p.telefono) === limpio(b.telefono);

export default function InvolucradosDelProyecto({ lead, editable = true }) {
  const [personas, setPersonas] = useState(null);
  const [nueva, setNueva] = useState(null);
  const [borrador, setBorrador] = useState(null);
  const [estado, setEstado] = useState(null);   // { texto } | { error }, al lado de lo que se corrige
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const lista = useRef([]);
  const ultimo = useRef(null);
  const guardando = useRef(false);

  const cargar = useCallback(async () => {
    let todas = [];
    try { todas = await involucradosDe(lead.id); } catch (e) { setError(`No se pudo leer la gente del proyecto: ${e?.message || e}`); }
    lista.current = todas;
    setPersonas(todas);
    return todas;
  }, [lead.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function agregar() {
    const r = personaDeLaFicha(nueva, lead.id);
    if (r.error) { setError(r.error); return; }
    setOcupado(true); setError(""); setAviso("");
    const e = await agregarALaFicha(r.fila);
    setOcupado(false);
    if (e) { setError(e); return; }
    setNueva(null);
    await cargar();
  }

  async function alternarDeSiempre(p) {
    setError(""); setAviso("");
    if (p.deSiempre) {
      // Si no figura en ningún otro lado, sacarla de los de siempre es sacarla de la lista.
      if (!p.deFicha && !figuraEnDocumentos(p)
        && !window.confirm(`${p.nombre || p.email} no figura en ningún acta, orden ni libro.\n\nAl sacarla de los de siempre sale de esta lista. ¿La sacás?`)) return;
      const e = await sacarDeSiempre(p);
      if (e) setError(e);
    } else {
      const e = await ponerDeSiempre(filaDeSiempre(p, lead.id, lista.current.filter(x => x.deSiempre).length));
      if (e) setError(e);
    }
    await cargar();
  }

  async function quitar(p) {
    const sigue = figuraEnDocumentos(p);
    const donde = dondeFigura(p).join(", ");
    if (!window.confirm(sigue
      ? `¿Quitar a ${p.nombre || p.email} de lo cargado a mano?\n\nSigue en la lista porque figura en ${donde}: esos documentos no se tocan.`
      : `¿Quitar a ${p.nombre || p.email} de este proyecto?\n\nNo se toca ningún documento ya enviado.`)) return;
    setError(""); setAviso("");
    const e = await quitarDeLoCargado(p);
    if (e) { setError(e); return; }
    if (borrador?.clave === p.clave) { setBorrador(null); ultimo.current = null; }
    await cargar();
    if (sigue) setAviso(`${p.nombre || p.email} sigue en la lista porque figura en ${donde}.`);
  }

  function abrir(p) {
    if (borrador?.clave === p.clave) { setBorrador(null); ultimo.current = null; setEstado(null); return; }
    const b = { clave: p.clave, nombre: p.nombre, empresa: p.empresa, cargo: p.cargo, email: p.email, telefono: p.telefono };
    ultimo.current = b; setBorrador(b); setEstado(null);
  }
  function escribir(campo, valor) {
    const b = { ...(ultimo.current || borrador), [campo]: valor };
    ultimo.current = b; setBorrador(b);
  }

  // SE GUARDA SOLO, al salir de cada casillero, con el estado al lado. Si se
  // sigue escribiendo mientras guarda, al terminar vuelve a mirar y guarda lo
  // que falte.
  async function guardar() {
    if (guardando.current) return;
    guardando.current = true;
    try {
      for (let vuelta = 0; vuelta < 3; vuelta++) {
        const b = ultimo.current;
        const p = b && lista.current.find(x => x.clave === b.clave);
        if (!p || iguales(p, b)) break;
        const r = cambiosAlEditar(p, b, lead.id);
        if (r.error) { setEstado({ error: r.error }); break; }
        setEstado({ texto: "guardando…" });
        const e = await aplicarCambios(r.ops);
        if (e) { setEstado({ error: e }); break; }
        const todas = await cargar();
        // Si se corrigió el correo, la persona cambió de clave: se la sigue.
        const clave = correoLimpio(b.email) || b.clave;
        if (ultimo.current && todas.some(x => x.clave === clave)) {
          ultimo.current = { ...ultimo.current, clave };
          setBorrador(ultimo.current);
        }
        setEstado({ texto: "guardado" });
      }
    } finally { guardando.current = false; }
  }

  const mini = { ...inputStyle, padding: "5px 7px", fontSize: 11 };
  const icono = { background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 3 };
  const casillero = (campo, rotulo, extra = {}) => (
    <input value={borrador[campo] || ""} placeholder={rotulo} title={rotulo} aria-label={rotulo}
      onChange={e => escribir(campo, e.target.value)} onBlur={guardar}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ ...mini, ...extra.style }} disabled={extra.fijo} />
  );

  const cuantos = personas?.length || 0;
  return (
    <div className="involucrados-del-proyecto">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, flex: 1 }}>
          Involucrados del proyecto{cuantos ? ` · ${cuantos}` : ""} <span style={{ fontWeight: 400, color: colors.muted }}>fuera de FOREMAN</span>
        </div>
        {editable && (
          <button onClick={() => { setNueva(nueva ? null : { ...vacio }); setError(""); }}
            style={{ background: "none", border: "none", color: colors.brand, fontSize: 11, fontWeight: 600, cursor: "pointer",
              fontFamily: colors.font, display: "flex", alignItems: "center", gap: 3 }}>
            <UserPlus size={12} /> Agregar persona
          </button>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 8, lineHeight: 1.45 }}>
        Se arma sola: quien entra en un acta, una orden de cambio, el plan o el libro de obra aparece acá.
        Los <strong>de siempre</strong> entran solos en cada acta nueva.
      </div>

      {nueva && (
        <div className="invitado-form">
          <input value={nueva.nombre} onChange={e => setNueva(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre" style={mini} autoFocus />
          <select value={nueva.rol} onChange={e => setNueva(p => ({ ...p, rol: e.target.value }))} style={mini}>
            <option value="cliente">Cliente</option><option value="proveedor">Proveedor</option><option value="otro">Otro</option>
          </select>
          <input value={nueva.email} onChange={e => setNueva(p => ({ ...p, email: e.target.value }))} placeholder="Correo" style={mini} />
          <input value={nueva.telefono} onChange={e => setNueva(p => ({ ...p, telefono: e.target.value }))} placeholder="WhatsApp" style={mini} />
          <Button variant="primary" size="sm" onClick={agregar} disabled={!nueva.nombre.trim() || ocupado}>Guardar</Button>
        </div>
      )}

      {error && <div style={{ fontSize: 11.5, color: colors.danger, marginBottom: 6, lineHeight: 1.45 }}>{error}</div>}
      {aviso && <div style={{ fontSize: 11.5, color: colors.inkSoft, marginBottom: 6, lineHeight: 1.45 }}>{aviso}</div>}

      {personas === null ? (
        <div style={{ fontSize: 11, color: colors.muted, marginBottom: 12 }}>Leyendo…</div>
      ) : !cuantos ? (
        <div style={{ fontSize: 11, color: colors.muted, marginBottom: 12, lineHeight: 1.5 }}>
          Todavía no hay nadie de afuera en este proyecto. Agregalo acá, o desde un acta, una orden, el plan o el libro: aparece solo.
        </div>
      ) : (
        <div style={{ marginBottom: 12, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
          {personas.map((p, n) => {
            const abierta = borrador?.clave === p.clave;
            const figura = dondeFigura(p);
            const cargada = !!(p.convocadoId || p.invitadoId);
            const detalle = [p.empresa, p.cargo].filter(Boolean).join(" · ");
            return (
              <div key={p.clave} className="involucrado" data-clave={p.clave}
                style={{ padding: "6px 9px", borderTop: n ? `1px solid ${colors.bg}` : "none", background: abierta ? colors.bg : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: colors.ink, lineHeight: 1.35 }}>
                      <span className="quien" style={{ fontWeight: 600 }}>{p.nombre || p.email}</span>
                      {detalle && <span style={{ color: colors.muted }}> · {detalle}</span>}
                    </div>
                    <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                      {p.email ? (p.nombre ? p.email : "sin nombre todavía") : "sin correo"}
                      {p.telefono ? ` · ${p.telefono}` : ""}
                      {figura.length ? ` · figura en ${figura.join(", ")}` : ""}
                      {p.deFicha ? " · cargada acá" : ""}
                    </div>
                  </div>
                  {editable ? (
                    <>
                      <label title="Entra sola en cada acta nueva y sale marcada en las órdenes de cambio"
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: p.deSiempre ? colors.ink : colors.muted,
                          cursor: "pointer", whiteSpace: "nowrap" }}>
                        <input type="checkbox" checked={p.deSiempre} onChange={() => alternarDeSiempre(p)} /> de siempre
                      </label>
                      <button className="corregir" onClick={() => abrir(p)} title="Corregir el nombre o el correo" style={icono}><Pencil size={12} /></button>
                      {cargada
                        ? <button className="quitar" onClick={() => quitar(p)} title="Quitarla de lo cargado a mano" style={icono}><X size={13} /></button>
                        : <span style={{ width: 19 }} title="Figura en documentos ya enviados: de ahí no se borra" />}
                    </>
                  ) : p.deSiempre && <span style={{ fontSize: 10.5, color: colors.muted, whiteSpace: "nowrap" }}>de siempre</span>}
                </div>

                {abierta && editable && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 5 }}>
                      {casillero("nombre", "Nombre")}
                      {p.convocadoId && casillero("empresa", "Empresa")}
                      {p.convocadoId && casillero("cargo", "Cargo")}
                      {casillero("email", "Correo", { fijo: !cargada })}
                      {!p.convocadoId && casillero("telefono", "WhatsApp")}
                    </div>
                    <div className="estado-del-cambio" style={{ fontSize: 10.5, marginTop: 4, lineHeight: 1.45,
                      color: estado?.error ? colors.danger : colors.muted }}>
                      {estado?.error || estado?.texto
                        || (cargada ? "Se guarda solo al salir de cada casillero."
                          : "Figura en documentos ya enviados: el correo no se cambia acá. Al ponerle nombre queda cargada en este proyecto.")}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
