import { useState, useEffect } from "react";
import { loadFromStorage, saveToStorage } from "../lib/storage";
import { rolInfo } from "../lib/roles";
import { colors } from "../theme/colors";
import Avatar from "./ui/Avatar";

function Wordmark() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: colors.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>F</span>
      </div>
      <span style={{ color: colors.ink, fontSize: 22, fontWeight: 700, letterSpacing: 0.2 }}>FOREMAN</span>
      <span style={{ background: colors.neutralSoft, color: colors.muted, fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4 }}>BETA</span>
    </div>
  );
}

export default function LoginScreen({ onLogin, users }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [step, setStep] = useState("pick");

  useEffect(() => {
    try {
      const s = localStorage.getItem("foreman_session");
      if (s) {
        const { userId, expires } = JSON.parse(s);
        if (new Date(expires) > new Date()) {
          const u = users.find(u => u.id === userId);
          if (u) onLogin(u);
        }
      }
    } catch {}
  }, []);

  function selectUser(u) {
    setSel(u); setPin(""); setErr(""); setStep("pin");
  }

  function handlePin(d) {
    if (pin.length >= 4) return;
    const n = pin + d;
    setPin(n);
    if (n.length === 4) {
      setTimeout(() => {
        if (n === sel.pin) {
          const exp = new Date();
          exp.setDate(exp.getDate() + 7);
          saveToStorage("foreman_session", { userId: sel.id, expires: exp.toISOString() });
          onLogin(sel);
        } else {
          setErr("PIN incorrecto"); setPin("");
        }
      }, 200);
    }
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
          {users.map(u => (
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
          <div style={{ color: colors.muted, fontSize: 13, marginBottom: 28, marginTop: 6 }}>Ingresa tu PIN</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 28 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: pin.length > i ? colors.brand : colors.border, transition: "background 0.15s" }} />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, maxWidth: 220, margin: "0 auto" }}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) => (
              <button
                key={i}
                onClick={() => { if (d === "⌫") setPin(p => p.slice(0, -1)); else if (d !== "") handlePin(d); }}
                style={{
                  background: d === "" ? "transparent" : colors.surface, border: d === "" ? "none" : `1.5px solid ${colors.border}`,
                  borderRadius: colors.radiusMd, height: 54, color: colors.ink, fontSize: 18, fontWeight: 500,
                  cursor: d === "" ? "default" : "pointer", fontFamily: colors.font, transition: "all 0.1s",
                }}
                onMouseEnter={e => { if (d !== "") { e.currentTarget.style.background = colors.brandSoft; e.currentTarget.style.borderColor = colors.brand; } }}
                onMouseLeave={e => { if (d !== "") { e.currentTarget.style.background = colors.surface; e.currentTarget.style.borderColor = colors.border; } }}
              >
                {d}
              </button>
            ))}
          </div>
          {err && <div style={{ color: colors.danger, fontSize: 12, marginTop: 14 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
