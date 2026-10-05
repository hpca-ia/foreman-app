import { useEffect, useState, useCallback } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import FotosAlVuelo from "./FotosAlVuelo";
import VisorFotos from "../../components/VisorFotos";

// Las fotos de avance: cómo va la obra.
//
// No son observaciones y por eso viven aparte. Una observación es algo que
// está mal y hay que arreglar; esto es lo contrario, y el cliente lo pide
// todas las semanas. Hoy se manda por WhatsApp, donde se mezcla con los
// audios y a los tres meses no hay forma de encontrar cómo estaba la losa en
// agosto.
//
// Se agrupan por día, en orden, y eso solo arma el historial del avance: la
// misma esquina en marzo, en mayo y en agosto, una debajo de la otra.
//
// Cada foto dice si el cliente la ve. Arranca en que sí —para eso se sacan—,
// pero la que muestra el desorden de un día malo se apaga con un toque.

export default function PanelAvance({ lead, currentUser, puedeSubir = true }) {
  const [fotos, setFotos] = useState([]);
  const [enlaces, setEnlaces] = useState({});
  const [sinTabla, setSinTabla] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [nuevas, setNuevas] = useState([]);
  const [datos, setDatos] = useState({ fecha: new Date().toISOString().split("T")[0], titulo: "" });
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [mirando, setMirando] = useState(null);

  const cargar = useCallback(async () => {
    if (!lead?.id) return;
    setCargando(true);
    const { data, error: e } = await supabase.from("obra_avance_fotos")
      .select("*").eq("lead_id", lead.id).order("fecha", { ascending: false }).order("id", { ascending: false });
    if (e) { setSinTabla(/relation|does not exist|schema cache/i.test(e.message)); setCargando(false); return; }
    setFotos(data || []);
    if (data?.length) {
      const { data: firmados } = await supabase.storage.from("task-files")
        .createSignedUrls(data.map(f => f.storage_path), 3600);
      const mapa = {};
      (firmados || []).forEach((x, i) => { if (x?.signedUrl) mapa[data[i].id] = x.signedUrl; });
      setEnlaces(mapa);
    }
    setCargando(false);
  }, [lead?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function subir() {
    if (!nuevas.length) return;
    setSubiendo(true); setError("");
    for (const archivo of nuevas) {
      const limpio = archivo.name.replace(/[^\w.\-]/g, "_").slice(-60);
      const ruta = `avance-${lead.id}/${Date.now()}-${limpio}`;
      const { error: e1 } = await supabase.storage.from("task-files").upload(ruta, archivo, { upsert: false });
      if (e1) { setError(e1.message); break; }
      const { error: e2 } = await supabase.from("obra_avance_fotos").insert({
        lead_id: lead.id, obra_id: lead.obra_id || null,
        fecha: datos.fecha, titulo: datos.titulo?.trim() || null,
        storage_path: ruta, visible_cliente: true,
        subido_por: currentUser?.id ?? null, subido_nombre: currentUser?.name || null,
      });
      if (e2) { setError(e2.message); break; }
    }
    setSubiendo(false);
    setNuevas([]); setDatos(d => ({ ...d, titulo: "" }));
    await cargar();
  }

  async function verLaVe(f) {
    await supabase.from("obra_avance_fotos").update({ visible_cliente: !f.visible_cliente }).eq("id", f.id);
    cargar();
  }

  async function quitar(f) {
    if (!window.confirm("¿Borrar esta foto?")) return;
    await supabase.storage.from("task-files").remove([f.storage_path]);
    await supabase.from("obra_avance_fotos").delete().eq("id", f.id);
    cargar();
  }

  if (sinTabla) {
    return (
      <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>
        Falta correr la migración 072 para usar las fotos de avance.
      </div>
    );
  }

  // Por día: es como se mira el avance, y es como lo pide el cliente.
  const porDia = [];
  fotos.forEach(f => {
    const ultimo = porDia[porDia.length - 1];
    if (ultimo && ultimo.fecha === f.fecha) ultimo.fotos.push(f);
    else porDia.push({ fecha: f.fecha, fotos: [f] });
  });

  const tira = fotos.filter(f => enlaces[f.id])
    .map(f => ({ ...f, url: enlaces[f.id], titulo: f.titulo || dia(f.fecha) }));

  return (
    <div>
      {puedeSubir && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14, display: "grid", gap: 8 }}>
          <FotosAlVuelo fotos={nuevas} onCambio={setNuevas} etiqueta="Fotos de cómo va la obra" />
          {nuevas.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8 }}>
                <input type="date" value={datos.fecha} onChange={e => setDatos(d => ({ ...d, fecha: e.target.value }))} style={inputStyle} />
                <input value={datos.titulo} onChange={e => setDatos(d => ({ ...d, titulo: e.target.value }))}
                  placeholder="¿De qué son? Ej: losa del segundo piso" style={inputStyle} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Button variant="primary" size="sm" onClick={subir} disabled={subiendo}>
                  {subiendo ? "Subiendo…" : `Guardar ${nuevas.length} ${nuevas.length === 1 ? "foto" : "fotos"}`}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setNuevas([])}>Cancelar</Button>
              </div>
            </>
          )}
          {error && <div style={{ fontSize: 11.5, color: colors.danger }}>{error}</div>}
        </div>
      )}

      {cargando ? (
        <div style={{ textAlign: "center", color: colors.muted, padding: "30px 0", fontSize: 13 }}>Cargando…</div>
      ) : !fotos.length ? (
        <div style={{ textAlign: "center", color: colors.muted, padding: "34px 16px", fontSize: 13,
          background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
          Todavía no hay fotos de avance. Son las que el cliente pide todas las semanas.
        </div>
      ) : porDia.map(g => (
        <div key={g.fecha} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 6 }}>
            {dia(g.fecha).toUpperCase()} · {g.fotos.length} {g.fotos.length === 1 ? "foto" : "fotos"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 6 }}>
            {g.fotos.map(f => (
              <div key={f.id} style={{ position: "relative" }}>
                {enlaces[f.id] ? (
                  <img src={enlaces[f.id]} alt={f.titulo || ""}
                    onClick={() => setMirando(Math.max(0, tira.findIndex(x => x.id === f.id)))}
                    style={{ width: "100%", height: 94, objectFit: "cover", borderRadius: 7,
                      border: `1px solid ${colors.border}`, display: "block", cursor: "zoom-in",
                      opacity: f.visible_cliente ? 1 : 0.5 }} />
                ) : <div style={{ width: "100%", height: 94, borderRadius: 7, background: colors.neutralSoft }} />}
                {puedeSubir && (
                  <div style={{ position: "absolute", top: 3, right: 3, display: "flex", gap: 3 }}>
                    <button onClick={() => verLaVe(f)}
                      title={f.visible_cliente ? "El cliente la ve — tocá para ocultarla" : "El cliente NO la ve"}
                      style={botonFoto}>
                      {f.visible_cliente ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                    <button onClick={() => quitar(f)} title="Borrarla" style={botonFoto}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
                {f.titulo && (
                  <div style={{ fontSize: 10, color: colors.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.titulo}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {mirando !== null && (
        <VisorFotos fotos={tira} indice={mirando} onIndice={setMirando} onCerrar={() => setMirando(null)} />
      )}
    </div>
  );
}

const botonFoto = {
  background: "rgba(17,24,39,0.7)", border: "none", borderRadius: 5, color: "#fff",
  cursor: "pointer", display: "flex", padding: 3,
};

const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
