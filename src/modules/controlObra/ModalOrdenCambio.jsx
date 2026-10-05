import { useState, useRef } from "react";
import { Camera, X, Plus, Trash2 } from "lucide-react";
import { colors } from "../../theme/colors";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { crearOrden, agregarLinea, subirSoporte, siguienteItem, subtotales } from "./ordenesDeCambio";

// Una orden de cambio entera, de una sola vez.
//
// Antes se creaba con cuatro datos y el resto se llenaba después, campo por
// campo, dentro de la fila desplegada. Eso está bien para corregir y es pésimo
// para escribir: una orden de cambio se redacta de un tirón —el día que pasó
// lo que la motiva— y hay que tener delante todo lo que va a decir, porque la
// justificación se escribe mirando las partidas y las partidas se arman
// mirando la justificación.
//
// Partida en pedazos, lo que pasa es que queda a medio llenar: con título y
// sin argumentos, o con argumentos y sin precios. Y una orden de cambio a
// medio llenar no se puede mandar, así que no sirve de nada.
//
// Las fotos esperan en memoria hasta que la orden existe: subirlas antes
// dejaría archivos sueltos cada vez que alguien empieza una y la cancela.

const VACIA = {
  titulo: "", tipo: "", lugar: "Quito", fecha: new Date().toISOString().split("T")[0],
  emitido_por: "", justificacion: "", soportes: "", impacto_cronograma: "", dias_impacto: "",
};
// "aumenta" y no "agrega": es el valor que guarda la base y el que suma
// `subtotales`. Con el otro, la vista previa de totales mostraba cero.
const LINEA = () => ({ tipo: "aumenta", descripcion: "", unidad: "u", cantidad: 1, precio_unitario: "", obra_rubro_id: "" });

const TIPOS = ["Requerimiento del cliente", "Vicio oculto", "Cambio de especificación", "Error de proyecto", "Condición del terreno"];

export default function ModalOrdenCambio({ obra, proyecto, rubros = [], currentUser, onCerrar, onCreada }) {
  const [f, setF] = useState(VACIA);
  const [lineas, setLineas] = useState([LINEA()]);
  const [fotos, setFotos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const camRef = useRef(null);

  const conMonto = lineas.filter(l => l.descripcion?.trim());
  const sub = subtotales(conMonto.map(l => ({
    ...l, cantidad: Number(l.cantidad) || 0, precio_unitario: Number(l.precio_unitario) || 0,
  })));

  async function guardar() {
    if (!f.titulo.trim()) { setError("Ponele un título: es lo que se cita después en las actas."); return; }
    if (!conMonto.length) { setError("Una orden de cambio sin partidas no se puede mandar a nadie."); return; }
    setGuardando(true); setError("");

    const r = await crearOrden(obra.id, { ...f, dias_impacto: Number(f.dias_impacto) || null }, currentUser);
    if (r.error) { setError(r.error); setGuardando(false); return; }
    const orden = r.orden;

    // El impacto en el cronograma no entra en crearOrden —es de la 056 y vive
    // aparte—, así que se guarda enseguida.
    if (f.impacto_cronograma?.trim() || f.dias_impacto) {
      await import("./ordenesDeCambio").then(m => m.guardarOrden(orden.id, {
        impacto_cronograma: f.impacto_cronograma?.trim() || null,
        dias_impacto: Number(f.dias_impacto) || null,
        soportes: f.soportes?.trim() || null,
      }));
    }

    const puestas = [];
    for (const l of conMonto) {
      const linea = {
        tipo: l.tipo,
        obra_rubro_id: l.obra_rubro_id ? Number(l.obra_rubro_id) : null,
        item: siguienteItem(puestas, l.tipo),
        descripcion: l.descripcion.trim(),
        unidad: l.unidad || "u",
        cantidad: Number(l.cantidad) || 0,
        precio_unitario: Number(l.precio_unitario) || 0,
      };
      const res = await agregarLinea(orden.id, linea, puestas);
      if (res?.error) { setError(res.error); setGuardando(false); return; }
      puestas.push(linea);
    }

    for (const [i, archivo] of fotos.entries()) {
      await subirSoporte(orden, archivo, "", currentUser, i);
    }

    setGuardando(false);
    onCreada?.(orden);
  }

  const lbl = { fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };
  const mini = { ...inputStyle, padding: "7px 9px", fontSize: 12.5 };

  return (
    <Modal onClose={onCerrar} maxWidth={720}>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, marginBottom: 2 }}>Nueva orden de cambio</div>
      <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 12 }}>
        {proyecto || obra?.nombre} · se numera sola al guardar
      </div>

      <div style={{ display: "grid", gap: 9 }}>
        <div>
          <label style={lbl}>TÍTULO</label>
          <input autoFocus value={f.titulo} onChange={e => setF(v => ({ ...v, titulo: e.target.value }))}
            placeholder="Ej: Refuerzo de cimentación en eje 4 por suelo no apto" style={mini} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 130px", gap: 8 }}>
          <div>
            <label style={lbl}>POR QUÉ SE ORIGINA</label>
            <select value={f.tipo} onChange={e => setF(v => ({ ...v, tipo: e.target.value }))} style={mini}>
              <option value="">Elegí…</option>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>LUGAR</label>
            <input value={f.lugar} onChange={e => setF(v => ({ ...v, lugar: e.target.value }))} style={mini} />
          </div>
          <div>
            <label style={lbl}>FECHA</label>
            <input type="date" value={f.fecha} onChange={e => setF(v => ({ ...v, fecha: e.target.value }))} style={mini} />
          </div>
        </div>

        <div>
          <label style={lbl}>CAPÍTULO I · ARGUMENTOS</label>
          <textarea value={f.justificacion} onChange={e => setF(v => ({ ...v, justificacion: e.target.value }))} rows={3}
            placeholder="Por qué se pide, qué pasa si no se hace, y en qué se apoya. Es lo que lee quien aprueba."
            style={{ ...mini, resize: "vertical" }} />
        </div>

        {/* Los soportes acá y no después: quien aprueba deja de tener que
            creerle a la palabra escrita, y la foto se saca el mismo día. */}
        <div>
          <label style={lbl}>SOPORTES GRÁFICOS{fotos.length ? ` · ${fotos.length}` : ""}</label>
          {fotos.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {fotos.map((x, i) => (
                <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 7, overflow: "hidden", background: colors.bg }}>
                  <img src={URL.createObjectURL(x)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button onClick={() => setFotos(v => v.filter((_, k) => k !== i))}
                    style={{ position: "absolute", top: 2, right: 2, width: 17, height: 17, borderRadius: "50%", border: "none",
                      background: "rgba(0,0,0,.6)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => camRef.current?.click()}
            style={{ width: "100%", background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: 8, padding: "9px",
              color: colors.inkSoft, fontSize: 12, cursor: "pointer", fontFamily: colors.font,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Camera size={13} /> Foto de lo que se encontró, o el plano de la solución
          </button>
          <input ref={camRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => { const f2 = [...e.target.files]; e.target.value = ""; setFotos(v => [...v, ...f2]); }} />
        </div>

        {/* Las partidas. Es la parte que se arma mirando los argumentos, y por
            eso tiene que estar en la misma pantalla. */}
        <div>
          <label style={lbl}>CAPÍTULO II · PARTIDAS</label>
          {lineas.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "88px 1fr 58px 70px 90px 26px", gap: 5, marginBottom: 5, alignItems: "center" }}>
              <select value={l.tipo} onChange={e => setLineas(v => v.map((x, k) => k === i ? { ...x, tipo: e.target.value } : x))}
                style={{ ...mini, padding: "6px 5px", fontSize: 11.5 }}>
                <option value="aumenta">Agrega</option>
                <option value="quita">Quita</option>
              </select>
              {/* Lo que se quita se ELIGE del presupuesto, no se escribe: es
                  un rubro que ya está contratado, con su cantidad y su precio.
                  Tipeado a mano se pone otro número y la resta no cuadra con
                  lo que de verdad sale del contrato. */}
              {l.tipo === "quita" ? (
                <select value={l.obra_rubro_id || ""} style={{ ...mini, padding: "6px 8px" }}
                  onChange={e => {
                    const r = rubros.find(x => String(x.id) === e.target.value);
                    setLineas(v => v.map((x, k) => k === i ? {
                      ...x, obra_rubro_id: e.target.value,
                      descripcion: r?.descripcion || "", unidad: r?.unidad || "u",
                      cantidad: r?.cantidad ?? 1, precio_unitario: r?.precio_unitario ?? "",
                    } : x));
                  }}>
                  <option value="">¿Qué rubro se saca?</option>
                  {rubros.filter(r => !r.anulado_por_oc && (Number(r.total_base) || 0) > 0).map(r => (
                    <option key={r.id} value={r.id}>{r.numero}. {String(r.descripcion || "").slice(0, 70)}</option>
                  ))}
                </select>
              ) : (
                <input value={l.descripcion} onChange={e => setLineas(v => v.map((x, k) => k === i ? { ...x, descripcion: e.target.value } : x))}
                  placeholder="Qué se hace" style={{ ...mini, padding: "6px 8px" }} />
              )}
              <input value={l.unidad} onChange={e => setLineas(v => v.map((x, k) => k === i ? { ...x, unidad: e.target.value } : x))}
                placeholder="und" style={{ ...mini, padding: "6px 5px", fontSize: 11.5 }} />
              <input type="number" step="0.01" value={l.cantidad} onChange={e => setLineas(v => v.map((x, k) => k === i ? { ...x, cantidad: e.target.value } : x))}
                placeholder="cant" style={{ ...mini, padding: "6px 5px", fontSize: 11.5 }} />
              <input type="number" step="0.01" value={l.precio_unitario} onChange={e => setLineas(v => v.map((x, k) => k === i ? { ...x, precio_unitario: e.target.value } : x))}
                placeholder="P.U." style={{ ...mini, padding: "6px 5px", fontSize: 11.5 }} />
              <button onClick={() => setLineas(v => v.length === 1 ? [LINEA()] : v.filter((_, k) => k !== i))}
                style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 2 }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button onClick={() => setLineas(v => [...v, LINEA()])}
            style={{ background: "none", border: `1px dashed ${colors.border}`, borderRadius: 7, padding: "6px 10px",
              color: colors.inkSoft, fontSize: 11.5, cursor: "pointer", fontFamily: colors.font }}>
            <Plus size={11} style={{ verticalAlign: -1 }} /> Otra partida
          </button>
        </div>

        {conMonto.length > 0 && (
          <div style={{ display: "flex", gap: 16, background: colors.bg, borderRadius: 8, padding: "9px 12px", flexWrap: "wrap" }}>
            {/* `subtotales` devuelve adiciones/reducciones, no agrega/quita.
                Leyendo los nombres equivocados daban undefined → 0, y el
                cuadro mostraba "AGREGA $0 · QUITA $0 · NETO $465,40": tres
                números de los cuales uno solo era cierto, que es peor que no
                mostrar ninguno. */}
            {[["Agrega", sub.adiciones, colors.brand], ["Quita", sub.reducciones, colors.danger], ["Neto", sub.total, sub.total < 0 ? colors.danger : colors.ink]].map(([k, v, c]) => (
              <div key={k}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>{k.toUpperCase()}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c }}>
                  ${(Math.abs(Number(v) || 0)).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
          <div>
            <label style={lbl}>CAPÍTULO III · IMPACTO EN EL PLAZO</label>
            <input value={f.impacto_cronograma} onChange={e => setF(v => ({ ...v, impacto_cronograma: e.target.value }))}
              placeholder="Qué se atrasa y por qué" style={mini} />
          </div>
          <div>
            <label style={lbl}>DÍAS</label>
            <input type="number" value={f.dias_impacto} onChange={e => setF(v => ({ ...v, dias_impacto: e.target.value }))}
              placeholder="0" style={mini} />
          </div>
        </div>
        <div style={{ fontSize: 10, color: colors.muted, marginTop: -4 }}>
          Esos días los lee el cronograma valorado cuando la orden se aprueba, para ofrecer extender el plazo.
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: colors.danger, marginTop: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button variant="primary" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar la orden"}
        </Button>
        <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
      </div>
      <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 7 }}>
        Después se decide qué hacer con ella: bajar el PDF, pedirle el visto al Director, o mandársela al cliente.
      </div>
    </Modal>
  );
}
