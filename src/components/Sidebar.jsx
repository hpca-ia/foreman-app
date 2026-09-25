import { ListTodo, Wallet, HardHat, PiggyBank, Target } from "lucide-react";
import { rolInfo } from "../lib/roles";
import { colors } from "../theme/colors";
import Avatar from "./ui/Avatar";

export default function Sidebar({ puede, usuario, empresa, vista, setVista, admin, verPipeline }) {
  const navItem = (v, label, Icon) => (
    <button
      key={v}
      onClick={() => setVista(v)}
      title={label}
      style={{
        width: 38, height: 38, borderRadius: colors.radiusMd, border: "none", cursor: "pointer",
        background: vista === v ? colors.brandSoft : "transparent",
        color: vista === v ? colors.brand : colors.muted,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={18} />
    </button>
  );

  return (
    <div className="app-sidebar" style={{ display: "flex", alignItems: "center", background: colors.surface, flexShrink: 0 }}>
      {/* La barra es un riel de 60 px: el logo de HCA Studio es un letrero
          ancho y ahí adentro queda como un hilo. Va arriba, en el encabezado,
          donde se lee; acá queda la marca compacta. */}
      <div className="app-sidebar-logo" style={{ marginBottom: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: colors.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>F</span>
        </div>
      </div>

      {/* Dejó de ser solo tareas: tiene reuniones y gestiones de proyectos. */}
      {navItem("tareas", "Tablero", ListTodo)}
      {puede("presupuestos.ver") && navItem("presupuestos", "Presupuestos", Wallet)}
      {puede("controlObra.ver") && navItem("controlObra", "Control Obra", HardHat)}
      {puede("cajaChica.ver") && navItem("cajaChica", "Caja Chica", PiggyBank)}
      {verPipeline && navItem("leads", "Pipeline", Target)}

      <div className="app-sidebar-spacer" style={{ flex: 1 }} />

      <div className="app-sidebar-profile" title={`${usuario.name} · ${rolInfo(usuario.role).label}`}>
        <Avatar name={usuario.name} size={30} color={usuario.color || colors.brand} />
      </div>
    </div>
  );
}
