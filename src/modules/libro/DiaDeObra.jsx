import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Plus, X, Check, Lock } from "lucide-react";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import {
  CATEGORIAS, CLIMAS, abrirDia, contenidoDe, anotar, borrarEntrada,
  guardarClima, subirFoto, borrarFoto, enlacesDeFotos, avanceDeLaObra, hoyEnObra, estadoDelDia } from "./libro";

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

export default function DiaDeObra({ lead, fecha, currentUser, puedeEscribir = true, onCambio }) {
  const [dia, setDia] = useState(null);
  const [entradas, setEntradas] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [enlaces, setEnlaces] = useState({});
  const [avance, setAvance] = useState(null);
  const [borradores, setBorradores] = useState({});
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
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
  if (!dia) {
    return (
      <div style={{ fontSize: 13, color: colors.muted, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 20, textAlign: "center" }}>
        Ese día no tiene libro. Solo se puede escribir el del día en curso.
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
        </div>

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
                  <div style={{ fontSize: 10, color: colors.muted }}>{e.autor_nombre || "—"} · {hora(e.created_at)}</div>
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
                <button onClick={() => agregar(cat.id)} disabled={ocupado || !(borradores[cat.id] || "").trim()}
                  style={{ border: `1px solid ${colors.border}`, background: "#fff", borderRadius: 8, padding: "0 11px",
                    color: colors.inkSoft, cursor: "pointer", display: "flex", alignItems: "center",
                    opacity: (borradores[cat.id] || "").trim() ? 1 : 0.5 }}>
                  <Plus size={14} />
                </button>
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
