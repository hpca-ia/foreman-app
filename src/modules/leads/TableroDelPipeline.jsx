import { useState } from "react";
import { colors } from "../../theme/colors";
import Avatar from "../../components/ui/Avatar";
import { inputStyle } from "../../components/ui/Input";
import { useArrastre } from "../../lib/arrastrarConElDedo";
import { useAvisoAbajo } from "../../components/AvisoAbajo";
import { porTipo, estadoDelLead, loQueDice, alCambiarEtapa, alResponder, alEsperar, alAprobar, alPerder, nombreDeEtapa, hoyISO } from "./pipeline";
import { avanceDe } from "./tareasDelProyecto";
import { aplicar } from "./proyecto";
import { ESTADOS_DE_TARJETA, estadoDeTarjeta, pasaElFiltro, tambienEnCurso, columnasDelTipo, columnaDelLead, alSoltarLead } from "./tablero";

// EL PIPELINE, COMO TABLERO (tablero.js cuenta por qué).
//
// Una franja por tipo —Diseño, Construcción, Diseño y construcción— y en cada
// una sus etapas como columnas. Cada proyecto es una tarjeta en la columna de
// su etapa: se mantiene apretada y se arrastra a otra para cambiarla; mientras
// se arrastra aparecen abajo «Aprobado» y «Perdido», y soltarla ahí pide
// confirmar. Un toque la abre. Retomar y dejar en espera, de un toque en la
// misma tarjeta.

export default function TableroDelPipeline({ leads = [], tareasDe = () => [], catalogo = [], currentUser, editableDe = () => false, filtro = null, onAbrir, onCambio }) {
  const hoy = hoyISO();
  const [aviso, avisar] = useAvisoAbajo();
  // Aprobado o perdido, soltado abajo: se confirma antes.
  const [cierre, setCierre] = useState(null);   // { lead, que, motivo, error }

  async function guardar(lead, cambio, texto, deshacer = null) {
    const r = await aplicar(lead, cambio, currentUser);
    if (r.error) { avisar(r.error); return null; }
    onCambio?.(r.lead);
    if (texto) avisar(texto, deshacer ? () => deshacer(r.lead) : null);
    return r.lead;
  }

  const { agarrar, arrastrando, sobre } = useArrastre({
    alSoltar: (lead, destino) => {
      const r = alSoltarLead(lead, destino, catalogo);
      if (!r) return;
      if (r.error) { avisar(r.error); return; }
      if (r.cerrar) { setCierre({ lead, que: r.cerrar, motivo: "", error: "" }); return; }
      const antes = lead.etapa;
      guardar(lead, r.cambio, `${lead.nombre} pasó a ${nombreDeEtapa(r.cambio.campos.etapa, catalogo) || "otra etapa"}.`,
        nuevo => guardar(nuevo, alCambiarEtapa(nuevo, antes, catalogo), `${lead.nombre} volvió a ${nombreDeEtapa(antes, catalogo) || "su etapa"}.`));
    },
  });

  async function cerrar() {
    const { lead, que, motivo } = cierre;
    const cambio = que === "ganado" ? alAprobar() : alPerder(motivo);
    if (cambio.error) { setCierre(c => ({ ...c, error: cambio.error })); return; }
    if (await guardar(lead, cambio, que === "ganado" ? `${lead.nombre}: aprobado. Ahora está en «En marcha».` : `${lead.nombre}: perdido.`)) setCierre(null);
  }

  const grupos = porTipo(leads, catalogo);
  return (
    <div className="tablero-del-pipeline">
      {grupos.map(g => {
        const columnas = columnasDelTipo(g.tipo, g.leads, catalogo);
        return (
          <section key={g.tipo || "sin"} className="franja-del-tipo" data-tipo={g.tipo || ""}
            style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, marginBottom: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${colors.neutralSoft}` }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: g.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: colors.ink }}>{g.label}</span>
              <span style={{ fontSize: 12, color: colors.muted, fontWeight: 600 }}>{g.leads.length} {g.leads.length === 1 ? "proyecto" : "proyectos"}</span>
              {!g.tipo && <span style={{ fontSize: 11.5, color: colors.warning }}>Elegí en su ficha de qué tipo es cada uno: eso decide sus etapas.</span>}
            </div>
            <div className="columnas-de-etapa" style={{ display: "flex", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              {columnas.map((c, k) => {
                const aca = g.leads.filter(l => columnaDelLead(l, columnas) === c.id);
                const lugar = `etapa:${g.tipo}:${c.id || ""}`;
                const encima = sobre === lugar && arrastrando;
                return (
                  <div key={c.id || "sin"} className="columna-de-etapa" data-soltar={c.id ? lugar : undefined} data-etapa={c.id || ""}
                    style={{ flex: "0 0 auto", width: aca.length ? 232 : 132, minHeight: 150, padding: "10px 8px 12px",
                      borderRight: k < columnas.length - 1 ? `1px dashed ${colors.neutralSoft}` : "none",
                      background: encima ? colors.brandSoft : "transparent", transition: "background .12s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 4px 8px", fontSize: 11.5, fontWeight: 700, color: encima ? colors.brand : colors.inkSoft }}>
                      {c.id && <span style={{ fontSize: 10, color: colors.muted }}>{columnas.filter(x => x.id).indexOf(c) + 1}</span>}
                      <span>{c.nombre}</span>
                      {aca.length > 0 && <span style={{ background: colors.neutralSoft, borderRadius: 8, padding: "0 6px", fontSize: 10.5 }}>{aca.length}</span>}
                    </div>
                    {encima && <div style={{ border: `1.5px dashed ${colors.brand}`, borderRadius: 11, height: 54, margin: "0 2px 8px", opacity: 0.6 }} />}
                    {aca.map(l => (
                      <Tarjeta key={l.id} lead={l} tareas={tareasDe(l.id)} catalogo={catalogo} hoy={hoy} filtro={filtro}
                        editable={editableDe(l)} agarrar={agarrar} onAbrir={() => onAbrir?.(l)}
                        onRetomar={() => guardar(l, alResponder(l, hoy), `${l.nombre}: retomado.`)}
                        onEspera={() => guardar(l, alEsperar({ que: null, recordarEl: null, hoy }),
                          `${l.nombre} queda en espera, sin recordatorio. En su ficha se dice qué se espera y cuándo recordarlo.`)} />
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Mientras se arrastra un proyecto: las dos salidas, abajo. */}
      {arrastrando && (
        <div className="salidas-del-pipeline" style={{ position: "fixed", left: "50%", bottom: 16, transform: "translateX(-50%)", display: "flex", gap: 10, zIndex: 900 }}>
          {[["cierre:ganado", "✓ Aprobado", "pasa a En marcha", colors.success, colors.successSoft],
            ["cierre:perdido", "✕ Perdido", "se cierra con su motivo", colors.danger, colors.dangerSoft]].map(([lugar, txt, sub, c, bg]) => (
            <div key={lugar} data-soltar={lugar}
              style={{ minWidth: 170, textAlign: "center", borderRadius: 14, padding: "13px 18px", fontSize: 13, fontWeight: 700, fontFamily: colors.font,
                border: `2px dashed ${c}`, color: c, background: sobre === lugar ? bg : "#fff", boxShadow: "0 8px 24px rgba(15,23,42,.12)" }}>
              {txt}<div style={{ fontWeight: 500, fontSize: 11, marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Aprobado o perdido: se confirma, como en la ficha. */}
      {cierre && (
        <div className="cerrar-el-lead" style={{ position: "fixed", left: "50%", bottom: 16, transform: "translateX(-50%)", zIndex: 950, width: "min(460px, calc(100vw - 24px))",
          background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 14, boxShadow: "0 14px 40px rgba(15,23,42,.22)", fontFamily: colors.font, display: "grid", gap: 8 }}>
          {cierre.que === "ganado" ? (
            <div style={{ fontSize: 13, color: colors.ink, lineHeight: 1.5 }}>
              <strong>¿{cierre.lead.nombre} aprobado?</strong> Sale del pipeline y pasa a los proyectos en marcha. Sus tareas siguen siendo suyas.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>¿Por qué se perdió {cierre.lead.nombre}?</div>
              <input value={cierre.motivo} autoFocus placeholder="Precio, plazo, se fue con otro…"
                onChange={e => setCierre(c => ({ ...c, motivo: e.target.value, error: "" }))}
                onKeyDown={e => { if (e.key === "Enter") cerrar(); }}
                style={{ ...inputStyle, padding: "7px 9px", fontSize: 13 }} />
            </>
          )}
          {cierre.error && <div style={{ fontSize: 11.5, color: colors.danger }}>{cierre.error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="confirmar-cierre" onClick={cerrar}
              style={{ border: "none", borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: colors.font, color: "#fff",
                background: cierre.que === "ganado" ? colors.success : colors.danger }}>
              {cierre.que === "ganado" ? "Aprobar" : "Cerrar como perdido"}
            </button>
            <button onClick={() => setCierre(null)}
              style={{ border: `1px solid ${colors.border}`, background: "#fff", borderRadius: 9, padding: "8px 13px", fontSize: 12.5, cursor: "pointer", fontFamily: colors.font, color: colors.inkSoft }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {aviso}
    </div>
  );
}

// LA TARJETA: en qué está, qué dice, cuánto va, dónde más tiene algo abierto.
function Tarjeta({ lead, tareas, catalogo, hoy, filtro, editable, agarrar, onAbrir, onRetomar, onEspera }) {
  const estado = estadoDelLead(lead, tareas, hoy);
  const k = estadoDeTarjeta(estado);
  const E = ESTADOS_DE_TARJETA[k];
  const avance = avanceDe(tareas);
  const tambien = tambienEnCurso(lead, tareas, catalogo);
  const props = editable ? agarrar(lead, { alTocar: onAbrir }) : { onClick: onAbrir, role: "button", tabIndex: 0, onKeyDown: e => { if (e.key === "Enter") onAbrir(); }, style: { cursor: "pointer" } };
  const enEspera = k === "espera" || k === "revisar";
  return (
    <div className="tarjeta-del-lead" data-lead={lead.id} data-estado={k} {...props}
      style={{ ...props.style, position: "relative", background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 12, padding: "10px 10px 9px 14px", margin: "0 2px 8px",
        boxShadow: "0 1px 2px rgba(16,24,40,.05)", opacity: pasaElFiltro(k, filtro) ? 1 : 0.28, fontFamily: colors.font, outline: "none" }}>
      <span style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 4, borderRadius: "0 4px 4px 0", background: E.color }} />
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div className="nombre-del-lead" style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, flex: 1, minWidth: 0, color: colors.ink, overflowWrap: "anywhere" }}>{lead.nombre}</div>
        {avance.total > 1 && <Anillo hechas={avance.hechas} total={avance.total} />}
      </div>
      <span className="estado-de-la-tarjeta" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 8px", marginTop: 6, background: E.fondo, color: E.color }}>
        {E.icono} {E.label}
      </span>
      <div className="lo-que-dice" style={{ fontSize: 12, color: colors.inkSoft, marginTop: 5, lineHeight: 1.35 }}>{loQueDice(estado)}</div>
      {tambien.length > 0 && (
        <div className="tambien-en-curso" style={{ fontSize: 11, color: colors.brand, marginTop: 5, lineHeight: 1.35, fontWeight: 600 }}>
          También en curso en {tambien.map(t => `${t.nombre} · ${t.abiertas}`).join(", ")}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        {lead.responsable_nombre && <span title={lead.responsable_nombre}><Avatar name={lead.responsable_nombre} size={22} /></span>}
        {lead.contacto && <span style={{ fontSize: 10.5, color: colors.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{lead.contacto}</span>}
        {editable && (enEspera ? (
          <button className="retomar-desde-la-tarjeta" onClick={e => { e.stopPropagation(); onRetomar(); }}
            style={{ marginLeft: "auto", border: `1px solid ${colors.brand}`, background: colors.brand, color: "#fff", borderRadius: 8, padding: "4px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: colors.font, flexShrink: 0 }}>
            Retomar
          </button>
        ) : (
          <button className="espera-desde-la-tarjeta" onClick={e => { e.stopPropagation(); onEspera(); }} title="Dejar en espera"
            style={{ marginLeft: "auto", border: `1px solid ${colors.border}`, background: "#fff", color: colors.brand, borderRadius: 8, padding: "4px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, flexShrink: 0 }}>
            ⏸ Espera
          </button>
        ))}
      </div>
    </div>
  );
}

// Cuánto va su checklist, en un anillo.
function Anillo({ hechas, total }) {
  const r = 14, L = 2 * Math.PI * r, p = total ? hechas / total : 0;
  return (
    <div className="anillo-del-lead" title={`${hechas} de ${total} actividades hechas`} style={{ position: "relative", width: 34, height: 34, flexShrink: 0 }}>
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r={r} fill="none" stroke={colors.neutralSoft} strokeWidth="4" />
        <circle cx="17" cy="17" r={r} fill="none" stroke={p === 1 ? colors.success : colors.brand} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${L * p} ${L}`} transform="rotate(-90 17 17)" />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: colors.inkSoft }}>
        {hechas}/{total}
      </span>
    </div>
  );
}
