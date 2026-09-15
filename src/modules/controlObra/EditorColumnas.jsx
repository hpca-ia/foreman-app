import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";

// Para cuando NOVA lee mal las columnas: la persona elige cuál es cuál, viendo
// el título de cada columna y un ejemplo de lo que trae. Al crear la obra, lo
// que eligió queda guardado como formato para el próximo Excel igual.

const letra = i => {
  let s = "", n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

const CAMPOS = [
  ["col_descripcion", "Descripción", true],
  ["col_cantidad", "Cantidad", true],
  ["col_precio", "Precio unitario", true],
  ["col_total", "Total de la fila", false],
  ["col_unidad", "Unidad", false],
  ["col_item", "Código", false],
  ["col_capitulo", "Capítulo (solo si tiene su propia columna)", false],
];

export default function EditorColumnas({ filas = [], mapa = {}, onCambiar }) {
  const encabezado = filas[mapa.fila_encabezado ?? 0] || [];
  const ancho = Math.max(0, ...filas.slice(0, 60).map(f => f.length));

  // Un ejemplo por columna: el primer valor no vacío debajo del encabezado.
  const ejemplo = i => {
    for (let r = (mapa.fila_encabezado ?? 0) + 1; r < Math.min(filas.length, (mapa.fila_encabezado ?? 0) + 30); r++) {
      const v = filas[r]?.[i];
      if (v !== "" && v != null) return typeof v === "number" ? v.toLocaleString("es-EC", { maximumFractionDigits: 2 }) : String(v).slice(0, 24);
    }
    return "";
  };
  const opciones = Array.from({ length: ancho }, (_, i) => ({
    i, texto: `${letra(i)} · ${String(encabezado[i] ?? "").trim().slice(0, 24) || "(sin título)"}${ejemplo(i) ? ` — ej. ${ejemplo(i)}` : ""}`,
  }));

  const cambiar = (k, v) => onCambiar({ ...mapa, [k]: v === "" ? null : Number(v) });
  const lbl = { fontSize: 11, color: colors.inkSoft, fontWeight: 500, display: "block", marginBottom: 3 };
  const campo = { ...inputStyle, padding: "6px 8px", fontSize: 12 };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
      <div>
        <label style={lbl}>Fila con los títulos de columna</label>
        <select value={mapa.fila_encabezado ?? 0} onChange={e => cambiar("fila_encabezado", e.target.value)} style={campo}>
          {filas.slice(0, 30).map((f, r) => (
            <option key={r} value={r}>Fila {r + 1}: {f.map(c => String(c ?? "").trim()).filter(Boolean).join(" · ").slice(0, 60) || "(vacía)"}</option>
          ))}
        </select>
      </div>
      {CAMPOS.map(([k, t, obligatorio]) => (
        <div key={k}>
          <label style={lbl}>{t}{obligatorio && <span style={{ color: colors.danger }}> *</span>}</label>
          <select value={mapa[k] ?? ""} onChange={e => cambiar(k, e.target.value)} style={{ ...campo, borderColor: obligatorio && mapa[k] == null ? colors.dangerBorder : colors.border }}>
            <option value="">— ninguna —</option>
            {opciones.map(o => <option key={o.i} value={o.i}>{o.texto}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}
