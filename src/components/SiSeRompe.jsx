import { Component } from "react";
import { colors } from "../theme/colors";

// UNA PANTALLA EN BLANCO NO SE PUEDE ARREGLAR.
//
// Cuando algo se rompe dibujando, React desmonta TODO: la obra entera
// desaparece y queda un fondo gris. Desde afuera no hay diferencia entre "se
// rompió", "no cargó" y "no tengo permiso", y lo único que se puede contar es
// "se queda en blanco" — que no alcanza para encontrar nada.
//
// Peor: el error se lo lleva una pestaña, pero la obra tiene quince. Un
// problema en Beneficios no puede dejar sin Control, sin Planillas y sin
// Facturas a alguien que está en la obra con el teléfono.
//
// Esto corta la caída donde pasó. Lo de alrededor sigue funcionando, y lo que
// se rompió dice qué fue, en una línea que se puede copiar y mandar.

export default class SiSeRompe extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, donde: "" };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // La primera línea del stack de componentes: el nombre del que se rompió.
    const donde = String(info?.componentStack || "").trim().split("\n")[0]?.trim() || "";
    this.setState({ donde });
    // Y queda en la consola entero, para cuando haga falta el detalle.
    console.error("FOREMAN se rompió dibujando:", error, info);
  }

  render() {
    const { error, donde } = this.state;
    if (!error) return this.props.children;

    const texto = [
      `${this.props.que || "Esta parte"} se rompió al dibujarse.`,
      error.message || String(error),
      donde ? `En ${donde}` : "",
    ].filter(Boolean).join("\n");

    return (
      <div style={{ fontFamily: colors.font, background: colors.dangerSoft,
        border: `1px solid ${colors.dangerBorder}`, borderRadius: colors.radiusMd, padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.danger, marginBottom: 4 }}>
          {this.props.que || "Esta parte"} se rompió
        </div>
        <div style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.5, marginBottom: 8 }}>
          El resto de la obra sigue funcionando: cambiá de pestaña y seguí trabajando. Lo que falló es esto, y
          esto es lo que dijo:
        </div>
        <div style={{ fontSize: 12, color: colors.ink, background: "#fff", border: `1px solid ${colors.border}`,
          borderRadius: colors.radiusSm, padding: "8px 10px", fontFamily: "ui-monospace, monospace",
          whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 9 }}>
          {texto}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => { try { navigator.clipboard.writeText(texto); } catch { /* sin portapapeles se lee de la pantalla */ } }}
            style={{ background: colors.brand, color: "#fff", border: "none", borderRadius: 7,
              padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
            Copiar el error
          </button>
          <button onClick={() => this.setState({ error: null, donde: "" })}
            style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 7,
              padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: colors.font, color: colors.inkSoft }}>
            Volver a intentarlo
          </button>
        </div>
      </div>
    );
  }
}
