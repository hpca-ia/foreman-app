import { useState } from "react";
import { EyeOff, Eye, Plus, FolderPlus, Check } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { rubrosInutiles, esconder, capitulosDeLaObra, ordenParaCapituloNuevo,
  moverACapitulo, agregarRubro } from "./curarControl";

// Acomodar el control: sacar el ruido y armar los capítulos que falten.
//
// EL PRESUPUESTO APROBADO NO SE TOCA. Nada de lo que se hace acá llega a la
// pestaña "Presupuesto original": ese documento tiene que poder imprimirse
// igual que el día que se firmó, porque es la única defensa que tiene una obra
// en una discusión de planillas. Cada rubro guarda con qué capítulo nació, y
// lo que se esconde se esconde solo de esta vista.

const lbl = { fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 };

export default function PanelCurar({ obra, rubros, porRubro, onCambio }) {
  const [abierto, setAbierto] = useState(null);   // "ruido" | "capitulos" | null
  const [marcados, setMarcados] = useState(new Set());
  const [nuevoCap, setNuevoCap] = useState("");
  const [nuevoRubro, setNuevoRubro] = useState({ capitulo: "", descripcion: "", unidad: "u", cantidad: "1", precio: "" });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const inutiles = rubrosInutiles(rubros, porRubro);
  const escondidos = rubros.filter(r => r.oculto);
  const capitulos = capitulosDeLaObra(rubros.filter(r => !r.oculto));

  const alternar = id => setMarcados(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  async function hacer(fn) {
    setOcupado(true); setError("");
    const err = await fn();
    setOcupado(false);
    if (err) { setError(typeof err === "string" ? err : err.error || "No se pudo."); return false; }
    setMarcados(new Set());
    await onCambio();
    return true;
  }

  if (!inutiles.length && !escondidos.length && !abierto) {
    return (
      <div style={{ marginTop: 10 }}>
        <button onClick={() => setAbierto("capitulos")}
          style={{ background: "none", border: "none", color: colors.muted, fontSize: 11.5,
            cursor: "pointer", fontFamily: colors.font, padding: 0 }}>
          <FolderPlus size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
          Acomodar capítulos del control
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, background: colors.surface, border: `1px solid ${colors.border}`,
      borderRadius: colors.radiusMd, padding: "10px 12px" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {inutiles.length > 0 && (
          <Button variant={abierto === "ruido" ? "primary" : "outline"} size="sm"
            onClick={() => setAbierto(a => (a === "ruido" ? null : "ruido"))}>
            <EyeOff size={12} /> {inutiles.length} {inutiles.length === 1 ? "rubro" : "rubros"} en $0
          </Button>
        )}
        <Button variant={abierto === "capitulos" ? "primary" : "outline"} size="sm"
          onClick={() => setAbierto(a => (a === "capitulos" ? null : "capitulos"))}>
          <FolderPlus size={12} /> Capítulos
        </Button>
        {escondidos.length > 0 && (
          <Button variant="outline" size="sm" disabled={ocupado}
            onClick={() => hacer(() => esconder(escondidos.map(r => r.id), false))}>
            <Eye size={12} /> Traer de vuelta {escondidos.length} escondido{escondidos.length === 1 ? "" : "s"}
          </Button>
        )}
        <span style={{ fontSize: 11, color: colors.muted, flex: 1, minWidth: 200, lineHeight: 1.45 }}>
          Nada de esto toca el presupuesto aprobado: esa pestaña se sigue viendo como se firmó.
        </span>
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 11.5, marginTop: 7 }}>{error}</div>}

      {/* EL RUIDO. Un presupuesto importado trae renglones en $0 —títulos que
          entraron como rubro, partidas sin precio, líneas de total que se
          colaron— y en una obra de ciento sesenta son ruido que se lee todos
          los días. Se esconden, no se borran: hoy estorban y el mes que viene
          alguien pregunta por uno. Y como están en cero, esconderlos no mueve
          un centavo de ningún total. */}
      {abierto === "ruido" && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 9 }}>
          <div style={{ fontSize: 11.5, color: colors.inkSoft, marginBottom: 7, lineHeight: 1.5 }}>
            Están en <strong>$0 y sin plata movida</strong>, así que esconderlos no cambia ningún total.
            Los que tengan factura encima no salen en esta lista —ésos son justo los que hay que mirar—.
          </div>
          <div style={{ maxHeight: 230, overflowY: "auto", border: `1px solid ${colors.border}`,
            borderRadius: colors.radiusSm, marginBottom: 8 }}>
            {inutiles.map(r => (
              <div key={r.id} onClick={() => alternar(r.id)}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 10px",
                  borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer",
                  background: marcados.has(r.id) ? colors.brandSoft : "transparent" }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                  border: `1.5px solid ${marcados.has(r.id) ? colors.brand : colors.border}`,
                  background: marcados.has(r.id) ? colors.brand : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {marcados.has(r.id) && <Check size={9} color="#fff" />}
                </div>
                <span style={{ color: colors.muted, fontSize: 10.5, flexShrink: 0, width: 28 }}>{r.numero}</span>
                <span style={{ fontSize: 11.5, color: colors.ink, flex: 1, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descripcion}</span>
                <span style={{ fontSize: 10, color: colors.muted, flexShrink: 0, maxWidth: 140,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.capitulo}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" disabled={ocupado || !marcados.size}
              onClick={() => hacer(() => esconder([...marcados], true))}>
              <EyeOff size={12} /> Esconder {marcados.size || ""}
            </Button>
            <Button variant="outline" size="sm" disabled={ocupado}
              onClick={() => setMarcados(new Set(inutiles.map(r => r.id)))}>
              Marcar los {inutiles.length}
            </Button>
          </div>
        </div>
      )}

      {/* LOS CAPÍTULOS. No son una tabla: son el nombre que llevan los rubros.
          Por eso crear uno es, necesariamente, mover algo adentro —o agregar un
          renglón nuevo, que es el otro camino—. */}
      {abierto === "capitulos" && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 9 }}>
          <div style={{ fontSize: 11.5, color: colors.inkSoft, marginBottom: 8, lineHeight: 1.5 }}>
            Los capítulos del control son el nombre que llevan los rubros, así que un capítulo nuevo
            nace con algo adentro: un renglón nuevo, o rubros que se le muden desde la pestaña de rubros.
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
            {capitulos.map(c => (
              <span key={c.nombre} title={`${c.rubros} rubros · $${fmt(c.base)}`}
                style={{ border: `1px solid ${colors.border}`, borderRadius: 20, padding: "3px 10px",
                  fontSize: 11, color: colors.inkSoft, background: "#fff" }}>
                {c.nombre} <span style={{ color: colors.muted }}>({c.rubros})</span>
              </span>
            ))}
          </div>

          {/* Un renglón nuevo. Va marcado como del control y nunca aparece en
              el presupuesto aprobado. */}
          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
            alignItems: "end" }}>
            <div>
              <label style={lbl}>CAPÍTULO</label>
              <input list="caps-control" value={nuevoRubro.capitulo}
                onChange={e => setNuevoRubro(r => ({ ...r, capitulo: e.target.value }))}
                placeholder="nuevo o existente"
                style={{ ...inputStyle, padding: "5px 8px", fontSize: 11.5 }} />
              <datalist id="caps-control">
                {capitulos.map(c => <option key={c.nombre} value={c.nombre} />)}
              </datalist>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>QUÉ ES</label>
              <input value={nuevoRubro.descripcion}
                onChange={e => setNuevoRubro(r => ({ ...r, descripcion: e.target.value }))}
                placeholder="descripción del rubro"
                style={{ ...inputStyle, padding: "5px 8px", fontSize: 11.5 }} />
            </div>
            <div>
              <label style={lbl}>UNIDAD</label>
              <input value={nuevoRubro.unidad}
                onChange={e => setNuevoRubro(r => ({ ...r, unidad: e.target.value }))}
                style={{ ...inputStyle, padding: "5px 8px", fontSize: 11.5 }} />
            </div>
            <div>
              <label style={lbl}>CANTIDAD</label>
              <input value={nuevoRubro.cantidad} inputMode="decimal"
                onChange={e => setNuevoRubro(r => ({ ...r, cantidad: e.target.value }))}
                style={{ ...inputStyle, padding: "5px 8px", fontSize: 11.5, textAlign: "right" }} />
            </div>
            <div>
              <label style={lbl}>P. UNITARIO</label>
              <input value={nuevoRubro.precio} inputMode="decimal" placeholder="0,00"
                onChange={e => setNuevoRubro(r => ({ ...r, precio: e.target.value }))}
                style={{ ...inputStyle, padding: "5px 8px", fontSize: 11.5, textAlign: "right" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Button variant="primary" size="sm"
              disabled={ocupado || !nuevoRubro.descripcion.trim() || !nuevoRubro.capitulo.trim()}
              onClick={async () => {
                const cap = nuevoRubro.capitulo.trim().toLocaleUpperCase("es");
                const ya = capitulos.find(c => c.nombre === cap);
                const ok = await hacer(() => agregarRubro(obra, {
                  capitulo: cap,
                  capituloOrden: ya ? ya.orden : ordenParaCapituloNuevo(rubros),
                  descripcion: nuevoRubro.descripcion,
                  unidad: nuevoRubro.unidad,
                  cantidad: Number(String(nuevoRubro.cantidad).replace(",", ".")),
                  precio: Number(String(nuevoRubro.precio).replace(",", ".")),
                }).then(r => r.error || null));
                if (ok) setNuevoRubro(r => ({ ...r, descripcion: "", precio: "" }));
              }}>
              <Plus size={12} /> Agregar el rubro
            </Button>
            <span style={{ fontSize: 11, color: colors.muted, flex: 1, minWidth: 190, lineHeight: 1.45 }}>
              Si el capítulo no existe, se crea con este rubro adentro. Lo que se agrega acá queda marcado
              como del control: no entra al presupuesto aprobado.
            </span>
          </div>

          {/* Renombrar un capítulo del control, sin tocar el aprobado. */}
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "end" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={lbl}>MUDAR LO MARCADO A UN CAPÍTULO</label>
              <input value={nuevoCap} onChange={e => setNuevoCap(e.target.value)}
                placeholder="marcá rubros arriba y escribí a qué capítulo van"
                style={{ ...inputStyle, padding: "5px 8px", fontSize: 11.5 }} />
            </div>
            <Button variant="outline" size="sm" disabled={ocupado || !marcados.size || !nuevoCap.trim()}
              onClick={async () => {
                const cap = nuevoCap.trim().toLocaleUpperCase("es");
                const ya = capitulos.find(c => c.nombre === cap);
                const ok = await hacer(() => moverACapitulo([...marcados], cap,
                  ya ? ya.orden : ordenParaCapituloNuevo(rubros)));
                if (ok) setNuevoCap("");
              }}>
              Mudar {marcados.size || ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
