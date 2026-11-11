import { useState, useEffect } from "react";
import { Trash2, MessageSquare, Mail, Mic } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import ConfirmarBorrado from "../../components/ui/ConfirmarBorrado";
import InformeLead from "./InformeLead";
import { esAdmin } from "../../lib/roles";
import { ORIGENES, TEMPERATURAS, CATALOGO_BASE } from "./constantes";
import GenteDelProyecto from "./GenteDelProyecto";
import ListaDeTareas from "./ListaDeTareas";
import EstadoDelLead from "./EstadoDelLead";
import { TIPOS, ORDEN_DE_TIPOS, tipoDe, etapasDelTipo, sePersigue, estaAprobado } from "./pipeline";
import { useDictado } from "../../lib/dictado";
import ArchivosDelProyecto from "./ArchivosDelProyecto";

const iconoNota = { background: "none", border: "none", color: "#8B92A5", cursor: "pointer", fontSize: 13, padding: "0 3px", lineHeight: 1 };

const sinTildes = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(p => p.length > 3);

export default function ModalLead({ lead, currentUser, users = [], todos = [], catalogo = CATALOGO_BASE, puede = () => true, editable = true, onIrAObra, onCerrar, onGuardado }) {
  const editando = !!lead;
  const [form, setForm] = useState(lead ? { ...lead } : {
    nombre: "", contacto: "", telefono: "", email: "", origen: "Referido",
    etapa: "nuevo", tunel: "", temperatura: "tibio", resultado: null, valor_estimado: "", fecha_cierre: "", notas: "",
    responsable_id: currentUser?.id || null, responsable_nombre: currentUser?.name || "",
  });
  // El lead como está AHORA en la base. Su etapa, su tipo y si espera al
  // cliente se guardan solos al tocarlos (EstadoDelLead), sin pasar por
  // «Guardar cambios»; esto los sigue para que la pantalla no muestre lo viejo.
  const [vivo, setVivo] = useState(lead);
  // Sus tareas, como las dejó la lista de abajo: de ahí sale el próximo paso
  // que dice el encabezado. `vuelta` le pide a la lista que se recargue cuando
  // el encabezado creó o movió una.
  const [tareasDelLead, setTareasDelLead] = useState([]);
  const [vuelta, setVuelta] = useState(0);
  const [ruta, setRuta] = useState([]);
  const [movs, setMovs] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [editNota, setEditNota] = useState({ id: null, texto: "" });
  // Todo junto en una columna era ilegible en el teléfono: ahora el proyecto
  // se abre en el plan, que es lo que uno viene a mirar, y lo demás está a un toque.
  const [seccion, setSeccion] = useState(lead ? "plan" : "datos");
  // Si le compartieron el proyecto y cae en una pestaña que no le toca, al plan.
  const seccionVisible = seccion === "datos" && editando && currentUser?.role !== "owner" && lead?.created_by !== currentUser?.id ? "plan" : seccion;
  const [informe, setInforme] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!lead) return;
    (async () => {
      const [{ data: ts }, { data: ms }] = await Promise.all([
        supabase.from("tasks").select("*").eq("lead_id", lead.id).order("ruta_orden", { nullsFirst: false }),
        supabase.from("lead_movimientos").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(30),
      ]);
      setRuta(ts || []);
      setMovs(ms || []);
    })();
  }, [lead]);

  const inp = (k, v) => setForm(p => ({ ...p, [k]: v }));
  // Proyectos que ya existen y se llaman casi igual que el que se está
  // escribiendo. Solo al crear: en uno que ya existe, el parecido es historia.
  const palabras = sinTildes(form.nombre);
  const parecidos = lead || palabras.length < 1 ? [] : todos.filter(x => {
    if (x.id === lead?.id || x.resultado === "perdido") return false;
    const suyas = sinTildes(x.nombre);
    const comunes = palabras.filter(w => suyas.includes(w)).length;
    return comunes >= Math.min(2, palabras.length) && comunes >= Math.min(palabras.length, suyas.length) - 1;
  }).slice(0, 3);

  // automatico: lo anotó el sistema —cambió la etapa, se agregó un paso—. Eso
  // no se edita: si "pasó a Contrato el 12" se pudiera corregir, dejaría de ser
  // un registro. Lo que uno escribe a mano, sí.
  async function anotar(lead_id, tipo, detalle, extra = {}) {
    await supabase.from("lead_movimientos").insert({
      lead_id, tipo, detalle, automatico: true,
      autor_id: currentUser?.id, autor_nombre: currentUser?.name, ...extra,
    });
  }

  // Los presupuestos que cuelgan de este proyecto. Sin la migración 046 no hay
  // columna que consultar y simplemente no se muestran.
  useEffect(() => {
    if (!lead?.id) return;
    supabase.from("presupuestos").select("id,nombre,enviado_at,decidido").eq("lead_id", lead.id)
      .then(({ data, error }) => setPresupuestos(error ? [] : data || []));
  }, [lead?.id]);

  async function recargarBitacora() {
    const { data } = await supabase.from("lead_movimientos").select("*").eq("lead_id", lead.id)
      .order("created_at", { ascending: false }).limit(30);
    setMovs(data || []);
  }

  async function guardarNotaEditada(m) {
    const t = (editNota.texto || "").trim();
    if (!t) return;
    await supabase.from("lead_movimientos").update({ detalle: t }).eq("id", m.id);
    setEditNota({ id: null, texto: "" });
    await recargarBitacora();
  }

  async function borrarNota(m) {
    await supabase.from("lead_movimientos").delete().eq("id", m.id);
    await recargarBitacora();
  }

  async function guardar() {
    if (!form.nombre?.trim()) { setError("Ponle un nombre al lead."); return; }
    setGuardando(true); setError("");
    const payload = {
      nombre: form.nombre.trim(), contacto: form.contacto || null, telefono: form.telefono || null,
      email: form.email || null, origen: form.origen || null,
      temperatura: form.temperatura || null,
      valor_estimado: Number(form.valor_estimado) || null,
      fecha_cierre: form.fecha_cierre || null, notas: form.notas || null,
      responsable_id: Number(form.responsable_id) || null,
      responsable_nombre: users.find(u => u.id === Number(form.responsable_id))?.name || form.responsable_nombre || null,
      actualizado_at: new Date().toISOString(),
    };

    // LO QUE SE GUARDA SOLO NO SE GUARDA ACÁ. La etapa, el tipo, el resultado
    // y la espera del cliente se guardan al tocarlos; si este botón los
    // mandara también, pisaría con lo que había al abrir la ventana lo que se
    // acaba de cambiar arriba.
    if (editando) {
      const { error: e } = await supabase.from("leads").update(payload).eq("id", lead.id);
      if (e) { setError(e.message); setGuardando(false); return; }
      setGuardando(false); onGuardado(); return;
    }

    // Uno nuevo nace con su tipo —que decide sus etapas— y en la primera.
    if (!TIPOS[form.tunel]) { setError("Elegí de qué tipo es: Diseño, Construcción, o Diseño y construcción."); setGuardando(false); return; }
    const primera = etapasDelTipo(catalogo, form.tunel)[0]?.id || "nuevo";
    const { data: creado, error: e } = await supabase.from("leads")
      .insert({ ...payload, tunel: form.tunel, etapa: primera, es_lead: true, created_by: currentUser?.id }).select().single();
    if (e || !creado) { setError(e?.message || "No se pudo crear"); setGuardando(false); return; }

    // El lead nace en blanco: sus tareas se le van sumando a medida que
    // aparecen. Una lista de plantilla se llena de pasos que nadie pensó, y
    // eso entrena a ignorarla.
    await anotar(creado.id, "nota", `Lead creado: ${TIPOS[form.tunel].label}`);
    setGuardando(false); onGuardado();
  }

  async function agregarNota() {
    const d = nota.trim();
    if (!d || !lead) return;
    await anotar(lead.id, "nota", d, { automatico: false });
    await supabase.from("leads").update({ actualizado_at: new Date().toISOString() }).eq("id", lead.id);
    const { data } = await supabase.from("lead_movimientos").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(30);
    setMovs(data || []); setNota("");
  }

  // Un lead que se borra se lleva su ruta, sus etapas y su bitácora: dejarlos
  // sueltos llenaría las tareas de pasos de algo que ya no existe.
  async function revisarBorrado() {
    // SE PREGUNTA SI LA OBRA EXISTE, no si el puntero está puesto.
    //
    // `leads.obra_id` podía quedar señalando una obra ya borrada, y entonces
    // el proyecto no se podía borrar nunca: acá decía "bórralo desde Control
    // de Obra" y allá no había nada que borrar. El puntero muerto se limpia al
    // pasar, que es lo único que hace falta para salir del callejón.
    if (lead.obra_id) {
      const { data: obra } = await supabase.from("obras")
        .select("id,nombre").eq("id", lead.obra_id).maybeSingle();
      if (obra) {
        return { bloqueo: `Este proyecto ya arrancó como la obra "${obra.nombre}". Bórrala desde Control de Obra si de verdad querés eliminarlo; desde acá no, para no dejar la obra sin su origen.` };
      }
      await supabase.from("leads").update({ obra_id: null }).eq("id", lead.id);
    }
    const { count: invitados } = await supabase.from("pipeline_invitados")
      .select("id", { count: "exact", head: true }).eq("lead_id", lead.id);
    return { bloqueo: null, detalle: [
      `${ruta.length} tareas`,
      `${movs.length} movimientos de la bitácora`,
      `${invitados || 0} personas invitadas al proyecto`,
    ] };
  }

  async function ejecutarBorrado() {
    await supabase.from("tasks").delete().eq("lead_id", lead.id);
    await supabase.from("pipeline_invitados").delete().eq("lead_id", lead.id);
    await supabase.from("lead_movimientos").delete().eq("lead_id", lead.id);
    const { error: e } = await supabase.from("leads").delete().eq("id", lead.id);
    return e;
  }

  // La nota de bitácora no se manda sola al terminar de dictar: es texto libre
  // y conviene leerlo antes, que es donde el dictado se equivoca.
  const { grabando: grabandoNota, error: errorVozNota, dictar: dictarNota } = useDictado({
    onParcial: setNota,
    onListo: setNota,
  });

  const puedeBorrar = editando && esAdmin(currentUser?.role);
  const lbl = { fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };
  const mini = { ...inputStyle, padding: "7px 9px", fontSize: 12 };

  // El rótulo de la esquina dice de qué tipo es: Diseño, Construcción, o
  // Diseño y construcción.
  const tipoActual = TIPOS[tipoDe(editando ? vivo : form)] || null;
  const temp = TEMPERATURAS.find(t => t.id === form.temperatura);
  // Los datos del proyecto —valor, contacto, origen, resultado— son del
  // Director y de quien lo abrió. Quien trabaja una etapa ve el plan y lo suyo,
  // no cuánto vale el negocio.
  const verDatos = currentUser?.role === "owner" || !editando || lead.created_by === currentUser?.id;
  const SECCIONES = editando
    ? [["plan", "El proyecto"], ...(verDatos ? [["datos", "Datos"]] : []), ["archivos", "Archivos"], ["gente", "Gente"]]
    : [["datos", "Datos"]];

  return (
    <Modal onClose={onCerrar} maxWidth={560}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, flex: 1, minWidth: 140 }}>
          {editando ? lead.nombre : "Nuevo lead"}
        </div>
        {editando && (
          <>
            {temp && <span title={temp.label} style={{ width: 8, height: 8, borderRadius: "50%", background: temp.color }} />}
            <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#fff", background: tipoActual?.color || colors.muted }}>
              {tipoActual?.label || "Sin tipo"}
            </span>
            {estaAprobado(vivo) && (
              <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: colors.success, border: `1px solid ${colors.success}` }}>
                APROBADO
              </span>
            )}
          </>
        )}
      </div>

      {editando && (
        <div className="obra-tabs" style={{ marginBottom: 12 }}>
          {SECCIONES.map(([id, txt]) => (
            <button key={id} onClick={() => setSeccion(id)}
              style={{ padding: "7px 13px", border: "none", background: "transparent", cursor: "pointer", fontFamily: colors.font,
                fontSize: 12, fontWeight: seccionVisible === id ? 600 : 400, color: seccionVisible === id ? colors.brand : colors.inkSoft,
                borderBottom: `2px solid ${seccionVisible === id ? colors.brand : "transparent"}` }}>
              {txt}
            </button>
          ))}
        </div>
      )}

      {seccionVisible === "datos" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>NOMBRE DEL PROYECTO</label>
            <input value={form.nombre} onChange={e => inp("nombre", e.target.value)} placeholder="Ej: Plaza Comercial Puembo" style={mini} autoFocus />
            {/* Un proyecto que ya existe escrito otra vez es el origen de los
                duplicados: mejor decirlo mientras se escribe que descubrirlo
                cuando los permisos y los totales no cierran. */}
            {parecidos.length > 0 && (
              <div style={{ fontSize: 10.5, color: colors.warning, marginTop: 4, lineHeight: 1.5 }}>
                Ya existe {parecidos.length === 1 ? "un proyecto que se llama" : "proyectos que se llaman"} casi igual:{" "}
                <strong>{parecidos.map(p => p.nombre).join(" · ")}</strong>.
                Si es el mismo trabajo, cerrá esto y abrilo desde ahí: dos proyectos iguales parten en dos su presupuesto,
                su obra y sus permisos.
              </div>
            )}
          </div>

          {/* De qué tipo es: eso decide por qué etapas pasa. Se elige al
              crearlo; después se cambia en «El proyecto», al lado de la etapa,
              donde se guarda solo. */}
          {!editando && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>TIPO DE LEAD</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ORDEN_DE_TIPOS.map(id => (
                  <button key={id} type="button" onClick={() => setForm(p => ({ ...p, tunel: id }))}
                    style={{ border: `1px solid ${form.tunel === id ? colors.ink : colors.border}`, borderRadius: 20, padding: "5px 13px",
                      background: form.tunel === id ? colors.ink : "#fff", color: form.tunel === id ? "#fff" : colors.inkSoft,
                      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
                    {TIPOS[id].label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 4 }}>
                {TIPOS[form.tunel]
                  ? `Pasa por: ${etapasDelTipo(catalogo, form.tunel).map(e => e.nombre).join(" · ") || "sin etapas en Ajustes"}.`
                  : "Decide por qué etapas pasa. Se editan en Ajustes → Etapas."}
              </div>
            </div>
          )}
          <div><label style={lbl}>CONTACTO</label><input value={form.contacto || ""} onChange={e => inp("contacto", e.target.value)} style={mini} /></div>
          <div><label style={lbl}>TELÉFONO</label><input value={form.telefono || ""} onChange={e => inp("telefono", e.target.value)} style={mini} /></div>
          <div><label style={lbl}>ORIGEN</label>
            <select value={form.origen || ""} onChange={e => inp("origen", e.target.value)} style={mini}>
              {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div><label style={lbl}>RESPONSABLE</label>
            <select value={form.responsable_id || ""} onChange={e => inp("responsable_id", e.target.value)} style={mini}>
              <option value="">Sin asignar</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>SE DECIDE EL</label><input type="date" value={form.fecha_cierre || ""} onChange={e => inp("fecha_cierre", e.target.value)} style={mini} /></div>
          <div>
            <label style={lbl}>TEMPERATURA</label>
            <div style={{ display: "flex", gap: 4 }}>
              {TEMPERATURAS.map(t => (
                <button key={t.id} onClick={() => inp("temperatura", form.temperatura === t.id ? null : t.id)}
                  style={{ flex: 1, padding: "5px 8px", borderRadius: colors.radiusSm, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                    border: `1px solid ${form.temperatura === t.id ? t.color : colors.border}`,
                    background: form.temperatura === t.id ? t.color : "transparent",
                    color: form.temperatura === t.id ? "#fff" : colors.inkSoft }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {editando && (
            <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: colors.muted }}>
              La etapa, el tipo y si se aprobó o se perdió se cambian en «El proyecto», y se guardan solos.
              Acá van los datos de contacto.
            </div>
          )}
        </div>
      )}

      {/* El proyecto: arriba en qué está —su etapa, y qué sigue— y abajo sus
          tareas, que son las mismas de Tareas. */}
      {editando && seccionVisible === "plan" && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 14 }}>
            <EstadoDelLead lead={vivo} tareas={tareasDelLead} catalogo={catalogo} currentUser={currentUser} editable={editable} ancho
              onCambio={l => { setVivo(l); recargarBitacora(); }}
              onTareas={() => { setVuelta(v => v + 1); recargarBitacora(); }} />
          </div>

          <ListaDeTareas key={vuelta} lead={vivo} etapaId={sePersigue(vivo) ? vivo.etapa : null} catalogo={catalogo} users={users}
            currentUser={currentUser} puede={puede} editable={editable} onBitacora={recargarBitacora} onTareas={setTareasDelLead} />

          {/* Los presupuestos de este proyecto: que existen y en qué estado
              están. Sin montos, que el pipeline no habla de plata —eso se
              trabaja en Presupuestos, que es donde el número es de verdad. */}
          {presupuestos.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, marginBottom: 6 }}>
                PRESUPUESTOS · {presupuestos.length}
              </div>
              {presupuestos.map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12.5 }}>
                  <span style={{ flex: 1, minWidth: 0, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                    color: p.decidido === "aprobado" ? colors.success : p.decidido === "no_aprobado" ? colors.danger : p.enviado_at ? colors.warning : colors.muted }}>
                    {p.decidido === "aprobado" ? "Aprobado" : p.decidido === "no_aprobado" ? "No aprobado" : p.enviado_at ? "Enviado" : "Borrador"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* El cajón del proyecto: planos, CAD, PDF del cliente, fotos del
          terreno. Lo que hoy vive en el correo de quien lo recibió. */}
      {editando && seccionVisible === "archivos" && (
        <ArchivosDelProyecto lead={lead} currentUser={currentUser} editable={editable} />
      )}

      {editando && seccionVisible === "gente" && (
        <GenteDelProyecto lead={lead} users={users} currentUser={currentUser}
          puedeCompartir={esAdmin(currentUser?.role) || lead.created_by === currentUser?.id} />
      )}

      {/* La bitácora es el pie del proyecto —qué pasó, en orden—, no otra
          pantalla: se lee después de ver las etapas. */}
      {editando && seccionVisible === "plan" && (
        <div style={{ borderTop: `1px solid ${colors.neutralSoft}`, marginTop: 18, paddingTop: 12, fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5 }}>
          BITÁCORA
        </div>
      )}
      {editando && seccionVisible === "plan" && (
        <>
          <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 8 }}>
            Qué pasó, en orden. Se llena sola con lo que se hace en el proyecto; lo que escribes tú se puede corregir.
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "flex-end" }}>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) agregarNota(); }}
              placeholder="¿Qué pasó? Una llamada, una visita, lo que dijeron..."
              style={{ ...mini, flex: 1, minWidth: 0, resize: "vertical", lineHeight: 1.5 }} />
            <button onClick={dictarNota} title={grabandoNota ? "Tocar para terminar" : "Dictar la nota"}
              style={{ background: grabandoNota ? colors.danger : colors.neutralSoft, border: "none", borderRadius: colors.radiusSm,
                width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                color: grabandoNota ? "#fff" : colors.inkSoft, cursor: "pointer" }}>
              <Mic size={13} />
            </button>
            <Button variant="outline" size="sm" onClick={agregarNota} disabled={!nota.trim()}><MessageSquare size={12} /> Anotar</Button>
          </div>
          {grabandoNota && <div style={{ fontSize: 11, color: colors.danger, marginBottom: 6 }}>Escuchando… toca el micrófono cuando termines.</div>}
          {errorVozNota && <div style={{ fontSize: 11, color: colors.warning, marginBottom: 6 }}>{errorVozNota}</div>}
          <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 12 }}>
            {movs.map(m => {
              const mio = !m.automatico && (m.autor_id === currentUser?.id || esAdmin(currentUser?.role));
              const enEdicion = editNota.id === m.id;
              return (
                <div key={m.id} style={{ fontSize: 11, color: colors.inkSoft, padding: "5px 0", borderBottom: `1px solid ${colors.neutralSoft}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: colors.muted, flex: 1 }}>
                      {new Date(m.created_at).toLocaleDateString("es-EC")} · {m.autor_nombre}
                      {m.automatico && <span style={{ color: colors.border }}> · automático</span>}
                    </span>
                    {mio && !enEdicion && (
                      <>
                        <button onClick={() => setEditNota({ id: m.id, texto: m.detalle || "" })} style={iconoNota} title="Corregir">✎</button>
                        <button onClick={() => borrarNota(m)} style={{ ...iconoNota, color: colors.danger }} title="Borrar">×</button>
                      </>
                    )}
                  </div>
                  {enEdicion ? (
                    <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                      <input value={editNota.texto} onChange={e => setEditNota(p => ({ ...p, texto: e.target.value }))}
                        style={{ ...mini, flex: 1, minWidth: 140 }} autoFocus />
                      <Button variant="primary" size="sm" onClick={() => guardarNotaEditada(m)}>Guardar</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditNota({ id: null, texto: "" })}>Cancelar</Button>
                    </div>
                  ) : m.detalle}
                </div>
              );
            })}
            {movs.length === 0 && <div style={{ fontSize: 11, color: colors.muted }}>Sin movimientos todavía.</div>}
          </div>
        </>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div className="modal-acciones">
        {/* Quien solo mira el pipeline no lo cambia: ve el proyecto entero, sin
            el botón que lo guarda. */}
        {editable && (
          <Button variant="primary" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : editando ? "Guardar datos" : "Crear lead"}
          </Button>
        )}
        <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
        {editando && (
          <Button variant="outline" onClick={() => setInforme(true)} title="Mandar un informe de avance por correo">
            <Mail size={13} /> Informe
          </Button>
        )}
        {puedeBorrar && (
          <Button variant="outline" onClick={() => setBorrar(true)} style={{ color: colors.danger, borderColor: colors.dangerBorder }}>
            <Trash2 size={13} /> Borrar
          </Button>
        )}
      </div>

      {informe && <InformeLead lead={lead} onCerrar={() => setInforme(false)} />}

      {borrar && (
        <ConfirmarBorrado
          titulo="Borrar este proyecto" nombre={lead.nombre}
          usuarioId={currentUser?.id}
          revisar={revisarBorrado} borrar={ejecutarBorrado}
          onCancelar={() => setBorrar(false)}
          onBorrado={() => { setBorrar(false); onGuardado(); }}
        />
      )}
    </Modal>
  );
}
