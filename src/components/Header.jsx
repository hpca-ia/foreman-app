import { Search, X, AlertTriangle, Settings, LogOut, Plus } from "lucide-react";
import { colors } from "../theme/colors";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";

export default function Header({ busqueda, setBusqueda, alertCount, onOpenAlerts, admin, onOpenAjustes, usuario, onLogout, onNuevaTarea }) {
  return (
    <div style={{ background: colors.surface, borderBottom: "1.5px solid #F0F1F3", padding: "0 16px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", height: 54, gap: 12, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: colors.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>F</span>
          </div>
          <span className="header-label" style={{ color: colors.ink, fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>FOREMAN</span>
          <span className="header-label" style={{ background: colors.neutralSoft, color: colors.muted, fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 4 }}>BETA</span>
        </div>
        <div className="header-search" style={{ background: colors.neutralSoft, borderRadius: colors.radiusMd, padding: "4px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <Search size={13} color={colors.muted} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar tareas..." style={{ background: "transparent", border: "none", outline: "none", fontSize: 12, color: colors.inkSoft, width: "100%", fontFamily: colors.font }} />
          {busqueda && <button onClick={() => setBusqueda("")} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", padding: 0, display: "flex" }}><X size={14} /></button>}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {alertCount > 0 && (
            <button onClick={onOpenAlerts} style={{ background: colors.dangerSoft, border: "none", borderRadius: 20, padding: "3px 10px", color: colors.danger, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <AlertTriangle size={11} /> {alertCount}
            </button>
          )}
          {admin && (
            <button onClick={onOpenAjustes} style={{ background: colors.neutralSoft, border: "none", borderRadius: colors.radiusMd, padding: "6px 10px", color: colors.inkSoft, fontSize: 12, cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
              <Settings size={13} /> <span className="header-label">Ajustes</span>
            </button>
          )}
          <Avatar name={usuario.name} size={30} color={usuario.color || colors.brand} />
          <button onClick={onLogout} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><LogOut size={15} /></button>
          <Button variant="primary" onClick={onNuevaTarea}><Plus size={14} /> <span className="header-label">Nueva tarea</span></Button>
        </div>
      </div>
    </div>
  );
}
