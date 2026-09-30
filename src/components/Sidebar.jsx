import { ListTodo, Wallet, HardHat, PiggyBank, Target, ShoppingCart, BookOpen, ClipboardList } from "lucide-react";
import { rolInfo } from "../lib/roles";
import { colors } from "../theme/colors";
import Avatar from "./ui/Avatar";

// El menú de la izquierda.
//
// Era un riel de iconos sin nombre: hay que acordarse de que el casco es
// Control de Obra y el chanchito la caja chica, y cada vez que entra alguien
// nuevo hay que explicárselo. Ahora cada cosa dice cómo se llama.
//
// Y va agrupado como fluye el trabajo, que es la misma cadena que sostiene
// FOREMAN por dentro: el proyecto nace en el pipeline, se le hace un
// presupuesto, y si se aprueba pasa a la obra —donde se controla la plata, se
// escribe el libro, se pide material y se rinde la caja—. Un menú ordenado por
// esa historia se aprende solo; uno ordenado por cuándo se programó cada
// módulo, no.

export default function Sidebar({ puede, usuario, empresa, vista, setVista, admin, verPipeline }) {
  // En el teléfono la barra es de abajo y hay siete: ahí "Control de Obra" no
  // entra y empuja a los de al lado. El nombre corto es para esa barra, y solo
  // para esa: en la computadora se lee el completo.
  const item = (v, label, Icon, corto = label) => (
    <button
      key={v}
      onClick={() => setVista(v)}
      title={label}
      className="app-nav-item"
      style={{
        border: "none", cursor: "pointer", textAlign: "left",
        background: vista === v ? colors.brandSoft : "transparent",
        color: vista === v ? colors.brand : colors.inkSoft,
        fontWeight: vista === v ? 600 : 500,
        fontFamily: colors.font, borderRadius: colors.radiusMd,
      }}
    >
      <Icon size={17} strokeWidth={vista === v ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
      <span className="app-nav-label">{label}</span>
      <span className="app-nav-corto">{corto}</span>
    </button>
  );

  // Cada grupo con lo que de verdad tenga: un título sobre un hueco es peor
  // que no tener título.
  const grupos = [
    [null, [puede("tareas.ver") && item("tareas", "Tablero", ListTodo)]],
    ["PROYECTOS", [
      verPipeline && item("leads", "Pipeline", Target),
      puede("presupuestos.ver") && item("presupuestos", "Presupuestos", Wallet, "Presup."),
    ]],
    ["OBRA", [
      puede("controlObra.ver") && item("controlObra", "Control de Obra", HardHat, "Obra"),
      puede("libro.ver") && item("libro", "Libro de Obra", BookOpen, "Libro"),
      puede("observaciones.ver") && item("observaciones", "Observaciones", ClipboardList, "Observ."),
      puede("compras.ver") && item("compras", "Compras", ShoppingCart),
      puede("cajaChica.ver") && item("cajaChica", "Caja Chica", PiggyBank, "Caja"),
    ]],
  ].map(([titulo, hijos]) => [titulo, hijos.filter(Boolean)]).filter(([, hijos]) => hijos.length);

  return (
    <div className="app-sidebar" style={{ background: colors.surface, flexShrink: 0 }}>
      <div className="app-sidebar-logo">
        <div style={{ width: 34, height: 34, borderRadius: 9, background: colors.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>F</span>
        </div>
        <div className="app-nav-label" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink, letterSpacing: 0.3 }}>FOREMAN</div>
          <div style={{ fontSize: 10, color: colors.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {empresa?.nombre || "HCA Studio"}
          </div>
        </div>
      </div>

      {grupos.map(([titulo, hijos]) => (
        <div key={titulo || "inicio"} className="app-nav-grupo">
          {titulo && <div className="app-nav-titulo">{titulo}</div>}
          {hijos}
        </div>
      ))}

      <div className="app-sidebar-spacer" style={{ flex: 1 }} />

      <div className="app-sidebar-profile" title={`${usuario.name} · ${rolInfo(usuario.role).label}`}>
        <Avatar name={usuario.name} size={28} color={usuario.color || colors.brand} />
        <div className="app-nav-label" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {usuario.name}
          </div>
          <div style={{ fontSize: 10, color: colors.muted }}>{rolInfo(usuario.role).label}</div>
        </div>
      </div>
    </div>
  );
}
