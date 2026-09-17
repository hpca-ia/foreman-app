import { useState, useEffect } from "react";
import { loadFromStorage, saveToStorage } from "../lib/storage";
import { rolInfo } from "../lib/roles";
import { hashPin, deUsuario } from "../lib/equipo";
import { estadoLogin, entrar, haySesion } from "../lib/sesion";
import { colors } from "../theme/colors";
import Avatar from "./ui/Avatar";

function Wordmark() {
  // El logo de la empresa si ya lo subieron; si no, la marca de FOREMAN.
  let logo = null;
  try { logo = JSON.parse(localStorage.getItem("foreman_empresa") || "{}").logoUrl || null; } catch {}
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      {logo
        ? <img src={logo} alt="" style={{ width: 54, height: 54, objectFit: "contain", borderRadius: 12 }} />
        : <div style={{ width: 54, height: 54, borderRadius: 14, background: colors.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 28, fontWeight: 700 }}>F</span>
          </div>}
      <span style={{ color: colors.ink, fontSize: 30, fontWeight: 700, letterSpacing: 0.2 }}>FOREMAN</span>
      <span style={{ background: colors.neutralSoft, color: colors.muted, fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4 }}>BETA</span>
    </div>
  );
}

export default function LoginScreen({ onLogin, users }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [step, setStep] = useState("pick");
  // { configurado, usuarios }: si el PIN se verifica en el servidor. Mientras no
  // lo esté, se entra como antes, comparando en el teléfono.
  const [servidor, setServidor] = useState(null);
  const [entrando, setEntrando] = useState(false);

  useEffect(() => { estadoLogin().then(setServidor); }, []);

  // Con la base cerrada la lista de usuarios no se puede leer antes de entrar:
  // la da el servidor, sin las huellas de los PIN.
  const lista = servidor?.configurado && servidor.usuarios?.length ? servidor.usuarios.map(deUsuario) : users;

  useEffect(() => {
    if (!servidor) return;
    (async () => {
      try {
        const s = localStorage.getItem("foreman_session");
        if (!s) return;
        const { userId, expires } = JSON.parse(s);
        if (new Date(expires) <= new Date()) return;
        // Una sesión guardada de antes del cambio no sirve: hay que volver a poner el PIN.
        if (servidor.configurado && !(await haySesion())) { localStorage.removeItem("foreman_session"); return; }
        const u = users.find(x => x.id === userId) || lista.find(x => x.id === userId);
        if (u) onLogin(u);
      } catch {}
    })();
  }, [servidor, users]);

  function guardarSesion(id) {
    const exp = new Date();
    exp.setDate(exp.getDate() + 7);
    saveToStorage("foreman_session", { userId: id, expires: exp.toISOString() });
  }

  function selectUser(u) {
    setSel(u); setPin(""); setErr(""); setStep("pin");
  }

  function handlePin(d) {
    if (pin.length >= 8) return;
    const n = pin + d;
    setPin(n);
    // Con PIN de largo variable no se puede entrar solo: la app no sabe cuántos
    // dígitos tiene el de cada quien —eso solo lo sabe el servidor—, así que se
    // confirma con el botón. Con 8, que es el máximo, entra directo.
    if (n.length === 8) probar(n);
  }

  function probar(n) {
    if (n.length < 4 || entrando) return;
    setErr("");
    setTimeout(async () => {
        const local = users.find(x => x.id === sel.id) || sel;
        if (servidor?.configurado) {
          setEntrando(true);
          const r = await entrar(sel.id, n);
          setEntrando(false);
          if (r.usuario) { guardarSesion(sel.id); onLogin(users.find(x => x.id === sel.id) || deUsuario(r.usuario)); return; }
          // Un PIN malo o demasiados intentos se dicen tal cual. Si lo que falló
          // es el servidor, mientras la base siga abierta se entra como antes.
          if (!(r.status >= 500 && local.pin_hash)) { setErr(r.error); setPin(""); return; }
        }
        // En la base solo está la huella del PIN; en un equipo que todavía no
        // subió su lista puede seguir estando el PIN viejo en texto.
        if (!local.pin_hash && !local.pin) { setErr("Este usuario no tiene PIN. Pídele a un admin que le asigne uno."); setPin(""); return; }
        const ok = local.pin_hash ? (await hashPin(local.id, n)) === local.pin_hash : n === local.pin;
        if (ok) {
          guardarSesion(local.id);
          onLogin(local);
        } else {
          setErr("PIN incorrecto"); setPin("");
        }
    }, 200);
  }

  const btnS = {
    width: "100%", background: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd,
    padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
    transition: "all 0.15s", fontFamily: colors.font,
  };

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <Wordmark />
        <div style={{ fontSize: 12, color: colors.muted, fontFamily: colors.font }}>Sesión guardada por 7 días</div>
      </div>

      {step === "pick" && (
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ fontSize: 10, color: colors.muted, fontFamily: colors.font, letterSpacing: 1, marginBottom: 10, textAlign: "center", fontWeight: 600 }}>SELECCIONA TU PERFIL</div>
          {lista.map(u => (
            <button
              key={u.id}
              onClick={() => selectUser(u)}
              style={btnS}
              onMouseEnter={e => { e.currentTarget.style.borderColor = colors.brand; e.currentTarget.style.boxShadow = "0 4px 12px rgba(15,61,62,0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.boxShadow = "none"; }}
            >
              <Avatar name={u.name} size={40} color={u.color || colors.brand} />
              <div style={{ textAlign: "left" }}>
                <div style={{ color: colors.ink, fontSize: 15, fontWeight: 600, fontFamily: colors.font }}>{u.name}</div>
                <div style={{ color: colors.muted, fontSize: 12, fontFamily: colors.font }}>{rolInfo(u.role).label}</div>
              </div>
              <div style={{ marginLeft: "auto", color: colors.border, fontSize: 18 }}>›</div>
            </button>
          ))}
        </div>
      )}

      {step === "pin" && sel && (
        <div style={{ width: "100%", maxWidth: 280, textAlign: "center", fontFamily: colors.font }}>
          <button onClick={() => { setStep("pick"); setErr(""); }} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", fontSize: 13, marginBottom: 20, display: "flex", alignItems: "center", gap: 4, margin: "0 auto 20px" }}>← Volver</button>
          <Avatar name={sel.name} size={60} color={sel.color || colors.brand} />
          <div style={{ color: colors.ink, fontSize: 18, fontWeight: 700, marginTop: 12 }}>{sel.name}</div>
          <div style={{ color: colors.muted, fontSize: 13, marginBottom: 20, marginTop: 6 }}>Escríbelo y pulsa Enter, o tócalo abajo</div>
          <input type="password" inputMode="numeric" autoFocus value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={e => { if (e.key === "Enter") probar(pin); }}
            placeholder="Escribe tu PIN y pulsa Enter"
            style={{ width: "100%", textAlign: "center", letterSpacing: 6, fontSize: 18, padding: "10px 12px", marginBottom: 16,
              background: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd, color: colors.ink,
              fontFamily: colors.font, outline: "none", boxSizing: "border-box" }} />

          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 20 }}>
            {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: pin.length > i ? colors.brand : colors.border, transition: "background 0.15s" }} />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, maxWidth: 220, margin: "0 auto" }}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"].map((d, i) => (
              <button
                key={i}
                disabled={d === "✓" && (pin.length < 4 || entrando)}
                onClick={() => { if (d === "⌫") setPin(p => p.slice(0, -1)); else if (d === "✓") probar(pin); else handlePin(d); }}
                style={{
                  background: d === "✓" ? (pin.length >= 4 ? colors.brand : colors.neutralSoft) : colors.surface,
                  border: `1.5px solid ${d === "✓" && pin.length >= 4 ? colors.brand : colors.border}`,
                  borderRadius: colors.radiusMd, height: 54, color: d === "✓" ? (pin.length >= 4 ? "#fff" : colors.muted) : colors.ink,
                  fontSize: 18, fontWeight: 500, cursor: d === "✓" && pin.length < 4 ? "default" : "pointer", fontFamily: colors.font, transition: "all 0.1s",
                }}
                onMouseEnter={e => { if (d !== "✓") { e.currentTarget.style.background = colors.brandSoft; e.currentTarget.style.borderColor = colors.brand; } }}
                onMouseLeave={e => { if (d !== "✓") { e.currentTarget.style.background = colors.surface; e.currentTarget.style.borderColor = colors.border; } }}
              >
                {d}
              </button>
            ))}
          </div>
          {entrando && <div style={{ color: colors.muted, fontSize: 12, marginTop: 14 }}>Entrando…</div>}
          {err && <div style={{ color: colors.danger, fontSize: 12, marginTop: 14 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
