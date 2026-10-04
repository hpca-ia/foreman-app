import { useState } from "react";
import { Search, X, AlertTriangle, Settings, LogOut, Plus } from "lucide-react";
import { colors } from "../theme/colors";
import { logoEmpresa } from "../lib/marca";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";

// El encabezado no es el de un módulo: es el de FOREMAN.
//
// Decía "Buscar tareas…" y "Nueva tarea" en todas las pantallas, también
// parado en Control de Obra o en Presupuestos. Eso no era solo ruido: contaba
// mal qué es la app. Alguien que entra por primera vez y lee eso arriba de
// todo concluye que FOREMAN es una lista de pendientes con cosas colgadas.
//
// Ahora el buscador y el botón son los de la pantalla donde uno está, y donde
// esa pantalla tiene lo suyo —Compras busca compras, Observaciones crea
// observaciones— el encabezado no repite nada: se corre y deja lugar.
export default function Header({ busqueda, setBusqueda, alertCount, onOpenAlerts, admin, onOpenAjustes, usuario, onLogout, onNuevaTarea, buscaAca = true, accion = null }) {
  // Si el logo no carga queda la "F": la marca nunca desaparece del encabezado.
  const [sinLogo, setSinLogo] = useState(false);
  return (
    <div className="app-header" style={{ background: colors.surface, borderBottom: "1.5px solid #F0F1F3", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div className="app-header-inner" style={{ display: "flex", alignItems: "center", height: 54, gap: 12, maxWidth: 1600, margin: "0 auto", width: "100%" }}>
        <div className="app-marca" style={{ display: "inline-flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
          {sinLogo
            ? <div style={{ width: 22, height: 22, borderRadius: 6, background: colors.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>F</span>
              </div>
            : <img className="app-marca-logo" src={logoEmpresa()} alt="HCA Studio" onError={() => setSinLogo(true)}
                style={{ height: 22, maxWidth: 96, objectFit: "contain", display: "block" }} />}
          <span style={{ width: 1, height: 18, background: colors.border }} />
          <span className="app-marca-texto" style={{ color: colors.ink, fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>FOREMAN</span>
          <span className="header-label" style={{ background: colors.neutralSoft, color: colors.muted, fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 4 }}>BETA</span>
        </div>
        {buscaAca ? (
          <div className="header-search" style={{ background: colors.neutralSoft, borderRadius: colors.radiusMd, padding: "4px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={13} color={colors.muted} />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar en el tablero…" style={{ background: "transparent", border: "none", outline: "none", fontSize: 12, color: colors.inkSoft, width: "100%", fontFamily: colors.font }} />
            {busqueda && <button onClick={() => setBusqueda("")} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", padding: 0, display: "flex" }}><X size={14} /></button>}
          </div>
        ) : <div style={{ flex: 1 }} />}
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
          {/* Fuera del tablero, cada módulo tiene su propio botón de crear
              —"Pedir algo", "Observación", "Nuevo presupuesto"— y repetir acá
              uno que crea otra cosa es ofrecer la acción equivocada en el
              lugar más visible. Queda un "+" al que uno llega cuando quiere
              anotar algo sin perder dónde está. */}
          {accion ? (
            <Button variant="primary" onClick={accion.onClick}>
              <Plus size={14} /> <span className="header-label">{accion.label}</span>
            </Button>
          ) : (
            <button onClick={onNuevaTarea} title="Anotar una tarea"
              style={{ background: colors.neutralSoft, border: "none", borderRadius: colors.radiusMd,
                width: 32, height: 32, color: colors.inkSoft, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Plus size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
