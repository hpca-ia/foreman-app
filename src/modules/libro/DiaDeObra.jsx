import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Plus, X, Check, Lock, Unlock } from "lucide-react";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import {
  CATEGORIAS, CLIMAS, abrirDia, contenidoDe, anotar, borrarEntrada,
  guardarClima, subirFoto, borrarFoto, enlacesDeFotos, avanceDeLaObra, hoyEnObra, estadoDelDia, reabrirDia, cerrarDia,
  abrirDiaPasado } from "./libro";

// El día de obra, pensado para el teléfono y para una mano sucia de cemento.
//
// Cada categoría es un bloque con lo ya escrito y un campo para agregar.
// Escribir y listo: sin modales, sin guardar, sin pasos. La foto se saca con la
// cámara del teléfono desde el mismo botón.
//
// El día de hoy está abierto; el de ayer se lee y no se toca —eso lo sostiene
// la base, no esta pantalla—.

const diaLargo = f => new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" });
const hora = t => new Date(t).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
const plata = n => (Number(n) || 0).toLocaleString("es-EC", { maximumFractionDigits: 0 });

export default function DiaDeObra({ lead, fecha, currentUser, puedeEscribir = true, puedeReabrir = false, onCambio }) {
  const [dia, setDia] = useState(null);
  const [entradas, setEntradas] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [enlaces, setEnlaces] = useState({});
  const [avance, setAvance] = useState(null);
  const [borradores, setBorradores] = useState({});
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  // Por qué se abre o se reabre un día que ya pasó. Se escribe en la pantalla
  // y no en el cuadrito del navegador: muchos navegadores lo bloquean sin
  // avisar, y entonces el botón se aprieta y no pasa nada.
  const [motivoAbrir, setMotivoAbrir] = useState("");
  const [reabriendo, setReabriendo] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const camRef = useRef(null);

  const esHoy = fecha === hoyEnObra();
  // El estado lo dice `estadoDelDia`, igual que la lista. Cuando cada pantalla
  // lo decidía por su cuenta, la lista prometía "Abierto" un día que adentro
  // salía con candado.
  const estado = estadoDelDia(dia, hoyEnObra());
  const abierto = estado.seEscribe;
  const sePuede = abierto && puedeEscribir;

  const cargar = useCallback(async () => {
    const r = await abrirDia(lead.id, fecha, currentUser);
    if (r.error) { setError(r.error === "sin_tablas" ? "Falta correr la migración 054." : r.error); return; }
    setDia(r.dia);
    if (!r.dia) { setEntradas([]); setFotos([]); return; }
    const { entradas: es, fotos: fs } = await contenidoDe(r.dia.id);
    setEntradas(es); setFotos(fs);
    setEnlaces(await enlacesDeFotos(fs));
  }, [lead.id, fecha, currentUser]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { avanceDeLaObra(lead.id).then(setAvance); }, [lead.id]);

  async function abrirPasado() {
    if (!motivoAbrir.trim()) return;
    setOcupado(true); setError("");
    const r = await abrirDiaPasado(lead.id, fecha, currentUser, motivoAbrir);
    setOcupado(false);
    if (r.error) { setError(r.error); return; }
    setMotivoAbrir(""); await cargar(); onCambio?.();
  }

  async function agregar(categoria) {
    const texto = borradores[categoria];
    if (!texto?.trim()) return;
    setOcupado(true); setError("");
    const r = await anotar(dia, categoria, texto, currentUser);
    setOcupado(false);
    if (r.error) { setError(r.error); return; }
    setEntradas(x => [...x, r.entrada]);
    setBorradores(b => ({ ...b, [categoria]: "" }));
    onCambio?.();
  }

  async function quitar(entrada) {
    if (!window.confirm("¿Quitar esta anotación?")) return;
    const err = await borrarEntrada(entrada.id);
    if (err) { setError(err); return; }
    setEntradas(x => x.filter(e => e.id !== entrada.id));
  }

  async function ponerFoto(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo || !dia) return;
    setSubiendo(true); setError("");
    const r = await subirFoto(dia, archivo, "", currentUser);
    setSubiendo(false);
    if (r.error) { setError(r.error); return; }
    const nuevas = [...fotos, r.foto];
    setFotos(nuevas);
    setEnlaces(await enlacesDeFotos(nuevas));
    onCambio?.();
  }

  if (error && !dia) {
    return <div style={{ fontSize: 12.5, color: colors.danger, padding: 12 }}>{error}</div>;
  }
  // UN DÍA QUE NADIE ABRIÓ. No es un error ni un día perdido: es un día en que
  // nadie entró, y pasa. Lo que no puede pasar es que no haya manera de
  // completarlo —ahí el libro se queda con un agujero que después nadie puede
  // explicar—. Se abre con motivo, y nace diciendo que se escribió después.
  if (!dia) {
    return (
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: colors.radiusMd, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, textTransform: "capitalize", marginBottom: 4 }}>
          {diaLargo(fecha)}
        </div>
        <div style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.5, marginBottom: 10 }}>
          Nadie escribió este día. Se puede completar ahora: el libro va a decir que se escribió después,
          con tu nombre y con el motivo — que es lo que lo mantiene válido.
        </div>
        {!puedeReabrir ? (
          <div style={{ fontSize: 12, color: colors.muted }}>
            Abrir un día que ya pasó es del gerente o de administración.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input value={motivoAbrir} onChange={e => setMotivoAbrir(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && motivoAbrir.trim()) abrirPasado(); }}
              placeholder="¿Por qué se escribe hoy? Ej: el residente no tuvo señal en obra"
              style={{ ...inputStyle, flex: 1, minWidth: 220, fontSize: 12.5, padding: "8px 10px" }} />
            <Button variant="primary" size="sm" disabled={ocupado || !motivoAbrir.trim()} onClick={abrirPasado}>
              <Unlock size={12} /> {ocupado ? "Abriendo…" : "Abrir y completar"}
            </Button>
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: colors.danger, marginTop: 8 }}>{error}</div>}
      </div>
    );
  }

  const deLaCategoria = id => entradas.filter(e => e.categoria === id);

  return (
    <div>
      {/* Qué día es, cómo estuvo el clima y si ya está cerrado. */}
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, textTransform: "capitalize", flex: 1, minWidth: 160 }}>{diaLargo(fecha)}</div>
          {!abierto && dia && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: colors.inkSoft, border: `1px solid ${colors.border}`, borderRadius: 14, padding: "3px 9px" }}>
              <Lock size={11} /> {estado.etiqueta.toUpperCase()}
            </span>
          )}
          {/* REABIERTO, dicho donde se lee. No es un detalle de auditoría: es
              lo que distingue un día escrito cuando pasó de uno completado
              después, y quien lee el libro tiene derecho a saberlo sin ir a
              buscarlo. */}
          {dia?.reabierto_at && (
            <span title={`${dia.reabierto_motivo || ""}${dia.reabierto_nombre ? ` — ${dia.reabierto_nombre}` : ""}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
                color: colors.warning, background: colors.warningSoft, borderRadius: 14, padding: "3px 9px" }}>
              <Unlock size={11} /> REABIERTO
              {Number(dia.reaperturas) > 1 ? ` ×${dia.reaperturas}` : ""}
            </span>
          )}
          {/* VOLVER A ABRIRLO. La obra no es prolija: el residente se va a las
              siete sin cargar la entrega de hormigón, y si la única salida es
              dejar el día incompleto para siempre, lo que se pierde es el
              registro entero. Se reabre con motivo, y el motivo queda escrito
              dentro del libro —no en una columna que nadie mira. */}
          {/* Reabrir no es de quien escribe: es del gerente o de administración.
              Quien lleva el libro lo completa el día; volver a abrir uno
              cerrado es una decisión sobre el registro, y por eso tiene su
              propio permiso. */}
          {!abierto && dia && puedeReabrir && !reabriendo && (
            <Button variant="outline" size="sm" disabled={ocupado}
              onClick={() => { setReabriendo(true); setMotivoAbrir(""); }}>
              <Unlock size={12} /> Reabrir
            </Button>
          )}
          {/* Y volver a cerrarlo cuando se terminó de completar. */}
          {abierto && dia && !esHoy && puedeReabrir && (
            <Button variant="secondary" size="sm" disabled={ocupado} onClick={async () => {
              setOcupado(true);
              const err = await cerrarDia(dia);
              setOcupado(false);
              if (err) { setError(err); return; }
              setError(""); await cargar();
            }}><Lock size={12} /> Cerrar de nuevo</Button>
          )}
        </div>

        {reabriendo && (
          <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
            <input autoFocus value={motivoAbrir} onChange={e => setMotivoAbrir(e.target.value)}
              onKeyDown={async e => {
                if (e.key === "Escape") { setReabriendo(false); return; }
                if (e.key === "Enter" && motivoAbrir.trim()) {
                  setOcupado(true);
                  const err = await reabrirDia(dia, currentUser, motivoAbrir);
                  setOcupado(false);
                  if (err) { setError(err); return; }
                  setError(""); setReabriendo(false); setMotivoAbrir(""); await cargar();
                }
              }}
              placeholder="¿Por qué se reabre? Queda escrito en el libro, con tu nombre"
              style={{ ...inputStyle, flex: 1, minWidth: 240, fontSize: 12.5, padding: "7px 9px" }} />
            <Button variant="primary" size="sm" disabled={ocupado || !motivoAbrir.trim()} onClick={async () => {
              setOcupado(true);
              const err = await reabrirDia(dia, currentUser, motivoAbrir);
              setOcupado(false);
              if (err) { setError(err); return; }
              setError(""); setReabriendo(false); setMotivoAbrir(""); await cargar();
            }}>{ocupado ? "Reabriendo…" : "Reabrir"}</Button>
            <Button variant="secondary" size="sm" onClick={() => setReabriendo(false)}>Cancelar</Button>
          </div>
        )}

        <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
          {CLIMAS.map(c => {
            const activo = dia.clima === c;
            return (
              <button key={c} disabled={!sePuede}
                onClick={async () => { setDia(d => ({ ...d, clima: c })); await guardarClima(dia.id, c); }}
                style={{ border: `1px solid ${activo ? colors.ink : colors.border}`, background: activo ? colors.ink : "#fff",
                  color: activo ? "#fff" : colors.inkSoft, borderRadius: 14, padding: "4px 11px", fontSize: 11.5,
                  cursor: sePuede ? "pointer" : "default", fontFamily: colors.font, opacity: !sePuede && !activo ? 0.5 : 1 }}>
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {!esHoy && (
        <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 12 }}>
          Este día ya pasó: se lee, no se escribe. El libro de cada día se cierra solo a la medianoche.
        </div>
      )}

      {/* Las categorías, una debajo de la otra. */}
      {CATEGORIAS.map(cat => {
        const suyas = deLaCategoria(cat.id);
        if (!sePuede && !suyas.length) return null;
        return (
          <div key={cat.id} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 6 }}>
              {cat.label.toUpperCase()}{suyas.length ? ` · ${suyas.length}` : ""}
            </div>

            {suyas.map(e => (
              <div key={e.id} style={{ display: "flex", gap: 8, padding: "5px 0", borderTop: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: colors.ink, lineHeight: 1.4, overflowWrap: "anywhere" }}>{e.contenido}</div>
                  {/* QUIÉN Y CUÁNDO, y si se escribió DESPUÉS del día.
                      Un libro completado más tarde no es lo mismo que uno
                      escrito el día que pasó, y quien lo lee tiene que poder
                      distinguirlos renglón por renglón —no solo saber que el
                      día entero se reabrió—. Se deduce de la fecha en que se
                      guardó: no hace falta guardar nada nuevo. */}
                  <div style={{ fontSize: 10, color: colors.muted }}>
                    {e.autor_nombre || "—"} · {hora(e.created_at)}
                    {String(e.created_at || "").slice(0, 10) > fecha && (
                      <span style={{ color: colors.warning, fontWeight: 600 }}>
                        {" "}· agregada el {String(e.created_at).slice(8, 10)}/{String(e.created_at).slice(5, 7)}
                      </span>
                    )}
                  </div>
                </div>
                {sePuede && (
                  <button onClick={() => quitar(e)} title="Quitar"
                    style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 0, alignSelf: "start" }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}

            {sePuede && (
              <div style={{ display: "flex", gap: 5, marginTop: suyas.length ? 7 : 0 }}>
                <input value={borradores[cat.id] || ""} placeholder={cat.pista}
                  onChange={ev => setBorradores(b => ({ ...b, [cat.id]: ev.target.value }))}
                  onKeyDown={ev => { if (ev.key === "Enter") { ev.preventDefault(); agregar(cat.id); } }}
                  style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "9px 10px", fontSize: 13 }} />
                {/* UN BOTÓN QUE DICE "GUARDAR".
                    Era un "+" sin texto al final del campo, y un icono solo no
                    se lee como "esto graba": uno escribe, mira la pantalla y no
                    sabe si quedó. Con la palabra se sabe antes de apretar, y se
                    sabe que hay que apretar. Enter sigue funcionando. */}
                <button onClick={() => agregar(cat.id)} disabled={ocupado || !(borradores[cat.id] || "").trim()}
                  style={{ border: "none", background: (borradores[cat.id] || "").trim() ? colors.brand : colors.neutralSoft,
                    borderRadius: 8, padding: "0 13px", fontSize: 12.5, fontWeight: 600, fontFamily: colors.font,
                    color: (borradores[cat.id] || "").trim() ? "#fff" : colors.muted,
                    cursor: (borradores[cat.id] || "").trim() ? "pointer" : "default",
                    display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                  <Plus size={13} /> {ocupado ? "Guardando…" : "Guardar"}
                </button>
              </div>
            )}
            {/* Y EL ERROR AL LADO DEL CAMPO que falló, no arriba de todo.
                Lo que se escribió sigue en el campo —no se pierde— y el aviso
                está donde uno está mirando. */}
            {sePuede && error && borradores[cat.id] && (
              <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 4, lineHeight: 1.45 }}>
                {error}
              </div>
            )}
          </div>
        );
      })}

      {/* Las fotos: con la cámara del teléfono, sin pasos de más. */}
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 6 }}>
          FOTOS{fotos.length ? ` · ${fotos.length}` : ""}
        </div>

        {fotos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 6, marginBottom: 8 }}>
            {fotos.map(f => (
              <div key={f.id} style={{ position: "relative" }}>
                {enlaces[f.id]
                  ? <a href={enlaces[f.id]} target="_blank" rel="noreferrer">
                      <img src={enlaces[f.id]} alt={f.descripcion || "Foto de obra"}
                        style={{ width: "100%", height: 92, objectFit: "cover", borderRadius: 8, border: `1px solid ${colors.border}`, display: "block" }} />
                    </a>
                  : <div style={{ width: "100%", height: 92, borderRadius: 8, background: colors.neutralSoft }} />}
                {sePuede && (
                  <button onClick={async () => { if (window.confirm("¿Quitar esta foto?")) { await borrarFoto(f); setFotos(x => x.filter(y => y.id !== f.id)); } }}
                    style={{ position: "absolute", top: 4, right: 4, background: "rgba(17,24,39,0.7)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", display: "flex", padding: 3 }}>
                    <X size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {sePuede && (
          <>
            <button onClick={() => camRef.current?.click()} disabled={subiendo}
              style={{ width: "100%", background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: 8, padding: "12px",
                color: colors.inkSoft, fontSize: 13, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Camera size={16} /> {subiendo ? "Subiendo…" : "Sacar una foto"}
            </button>
            {/* capture manda directo a la cámara trasera en el teléfono; en la
                computadora abre el explorador de archivos, como siempre. */}
            <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={ponerFoto} style={{ display: "none" }} />
          </>
        )}
      </div>

      {/* El avance no se escribe acá: se lee de Control de Obra. */}
      {avance && avance.capitulos.length > 0 && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 2 }}>CÓMO VA LA OBRA</div>
          <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 7 }}>
            Sale de Control de Obra. Al cerrar el día queda la foto de cómo estaba.
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 7 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: colors.ink }}>
              {avance.base ? Math.round((avance.invertido / avance.base) * 100) : 0}%
            </span>
            <span style={{ fontSize: 11.5, color: colors.muted }}>${plata(avance.invertido)} de ${plata(avance.base)}</span>
          </div>
          {avance.capitulos.slice(0, 6).map(c => {
            const pct = c.base ? Math.min(100, (c.invertido / c.base) * 100) : 0;
            return (
              <div key={c.capitulo} style={{ marginBottom: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: colors.inkSoft }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.capitulo}</span>
                  <span style={{ color: colors.muted }}>{Math.round(pct)}%</span>
                </div>
                <div style={{ height: 3, borderRadius: 3, background: colors.neutralSoft, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: colors.brand }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: colors.danger, marginTop: 8 }}>{error}</div>}

      {sePuede && !entradas.length && !fotos.length && (
        <div style={{ fontSize: 11.5, color: colors.muted, textAlign: "center", padding: "6px 0" }}>
          Escribí lo que va pasando. El libro se cierra solo a la medianoche.
        </div>
      )}

      {abierto && puedeEscribir && !entradas.length && !fotos.length && (
        <Button variant="outline" size="sm" style={{ marginTop: 8 }}
          onClick={async () => {
            if (!window.confirm("¿Cerrar el día como “sin novedades”? Queda registrado que hoy no hubo nada que anotar.")) return;
            await anotar(dia, "observaciones", "Sin novedades.", currentUser);
            cargar();
          }}>
          <Check size={13} /> Hoy no hubo novedades
        </Button>
      )}
    </div>
  );
}
