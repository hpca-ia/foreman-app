import { useState } from "react";
import { Link2, Copy, Check, Power } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";

// El enlace que se le manda al cliente.
//
// Una llave por proyecto, no una por persona: el enlace se reenvía entre el
// cliente, su mujer y su arquitecto, y eso está bien —todos ven lo mismo que
// ya les mandaríamos por correo. Lo que importa es que abra UN proyecto y que
// se pueda apagar.
//
// La llave la arma el navegador con el generador criptográfico, no con
// Math.random: ese es predecible, y una llave adivinable es una obra ajena
// abierta. Son 32 caracteres, que no se prueban a mano.
//
// Apagar y la llave son dos cosas separadas a propósito: al terminar la obra
// se apaga el portal sin borrar el enlace, y si meses después el cliente pide
// volver a ver las fotos se prende de nuevo con el mismo que ya tiene. Borrar
// la llave es para cuando el enlace se fue a donde no debía: ahí se genera una
// nueva y la vieja deja de abrir.

function nuevaLlave() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c]));
}

export default function EnlaceDelCliente({ lead, onCambio }) {
  const [token, setToken] = useState(lead?.portal_token || null);
  const [activo, setActivo] = useState(!!lead?.portal_activo);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const url = token ? `${window.location.origin}/?cliente=${token}` : "";

  async function guardar(campos) {
    setOcupado(true); setError("");
    const { error: e } = await supabase.from("leads").update(campos).eq("id", lead.id);
    setOcupado(false);
    if (e) {
      setError(/column|schema cache/i.test(e.message) ? "Falta correr la migración 073." : e.message);
      return false;
    }
    onCambio?.();
    return true;
  }

  async function prender() {
    const llave = token || nuevaLlave();
    if (await guardar({ portal_token: llave, portal_activo: true })) { setToken(llave); setActivo(true); }
  }

  async function apagar() {
    if (await guardar({ portal_activo: false })) setActivo(false);
  }

  async function rehacer() {
    if (!window.confirm("El enlace que ya le mandaste va a dejar de funcionar. ¿Generar uno nuevo?")) return;
    const llave = nuevaLlave();
    if (await guardar({ portal_token: llave, portal_activo: true })) { setToken(llave); setActivo(true); setCopiado(false); }
  }

  function copiar() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    });
  }

  if (!activo) {
    return (
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: colors.inkSoft, lineHeight: 1.5, marginBottom: 8 }}>
          <strong style={{ color: colors.ink }}>El cliente todavía no tiene acceso.</strong> Con el enlace prendido
          entra sin usuario ni contraseña y ve las fotos de avance, lo que salió de las visitas con él,
          y lo que le mandaste a aprobar. Lo interno no lo ve.
        </div>
        {error && <div style={{ fontSize: 11.5, color: colors.danger, marginBottom: 6 }}>{error}</div>}
        <Button variant="primary" size="sm" onClick={prender} disabled={ocupado}>
          <Link2 size={13} /> {token ? "Volver a abrirle el acceso" : "Crear el enlace del cliente"}
        </Button>
      </div>
    );
  }

  return (
    <div style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: colors.brand, letterSpacing: 0.4, marginBottom: 5 }}>
        ENLACE DEL CLIENTE
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input readOnly value={url} onFocus={e => e.target.select()}
          style={{ flex: 1, minWidth: 200, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "7px 9px",
            fontSize: 11.5, fontFamily: "ui-monospace, monospace", color: colors.inkSoft, background: "#fff" }} />
        <Button variant={copiado ? "secondary" : "primary"} size="sm" onClick={copiar}>
          {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
        </Button>
      </div>
      <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 7, lineHeight: 1.5 }}>
        Quien tenga este enlace entra sin contraseña y ve solo este proyecto. Mandáselo por correo o WhatsApp.
      </div>
      {error && <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 5 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={apagar} disabled={ocupado} style={chico}>
          <Power size={11} /> Cerrar el acceso
        </button>
        <button onClick={rehacer} disabled={ocupado} style={chico}>
          Cambiar el enlace
        </button>
      </div>
    </div>
  );
}

const chico = {
  background: "none", border: "none", padding: 0, color: colors.muted, fontSize: 11,
  fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "inline-flex",
  alignItems: "center", gap: 4,
};
