import { useState, useEffect } from "react";
import { Mail, Users, Globe, User } from "lucide-react";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";

// El informe del proyecto por correo. NOVA escribe el borrador con lo que hay
// en la base —avance, lo que sigue, fechas—, y antes de mandarlo se lee y se
// corrige: es lo que va a leer un cliente, y ahí no se improvisa.

const DESTINOS = [
  { id: "responsable", label: "Al responsable", nota: "Quien tiene la etapa en curso", Icono: User },
  { id: "equipo", label: "Al equipo", nota: "Los que ven este proyecto", Icono: Users },
  { id: "todos", label: "Equipo y externos", nota: "También cliente y proveedores", Icono: Globe },
];

export default function InformeLead({ lead, onCerrar }) {
  const [a, setA] = useState("equipo");
  const [texto, setTexto] = useState("");
  const [para, setPara] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setResultado(null);
    fetch("/api/pipeline-informe", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, a, soloTexto: true, motivo: "informe de avance" }),
    })
      .then(r => r.json())
      .then(d => { if (!vivo) return; setTexto(d.texto || ""); setPara(d.destinatarios || []); setCargando(false); })
      .catch(() => { if (vivo) { setTexto(""); setCargando(false); } });
    return () => { vivo = false; };
  }, [lead.id, a]);

  async function enviar() {
    setEnviando(true); setResultado(null);
    try {
      const r = await fetch("/api/pipeline-informe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, a, texto, motivo: "informe de avance" }),
      });
      const d = await r.json();
      setResultado(d.ok ? { ok: true, msg: `Enviado a ${(d.enviadoA || []).join(", ")}` } : { ok: false, msg: d.error || "No se pudo enviar" });
    } catch (e) {
      setResultado({ ok: false, msg: "Sin conexión: " + e.message });
    }
    setEnviando(false);
  }

  return (
    <Modal onClose={onCerrar} maxWidth={520}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Mail size={16} color={colors.brand} />
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>Informe de {lead.nombre}</div>
      </div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 12 }}>
        NOVA lo escribió con lo que hay en el proyecto. Léelo, corrígelo y mándalo.
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {DESTINOS.map(({ id, label, nota, Icono }) => {
          const activo = a === id;
          return (
            <button key={id} onClick={() => setA(id)}
              style={{ display: "flex", alignItems: "center", gap: 7, textAlign: "left", padding: "7px 11px", borderRadius: colors.radiusSm, cursor: "pointer", fontFamily: colors.font,
                border: `1.5px solid ${activo ? colors.brand : colors.border}`, background: activo ? colors.brand : "#fff", color: activo ? "#fff" : colors.ink }}>
              <Icono size={13} />
              <span><span style={{ display: "block", fontSize: 12, fontWeight: 600 }}>{label}</span>
                <span style={{ display: "block", fontSize: 10, opacity: 0.8 }}>{nota}</span></span>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: para.length ? colors.inkSoft : colors.warning, marginBottom: 8 }}>
        {cargando ? "NOVA está escribiendo el borrador…"
          : para.length ? `Va a: ${para.join(", ")}`
          : "Nadie de ese grupo tiene correo cargado. Agrégalo en Ajustes, o en las personas del proyecto."}
      </div>

      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={12} disabled={cargando}
        placeholder={cargando ? "" : "Escribe el informe…"}
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontSize: 13, marginBottom: 12 }} />

      {resultado && (
        <div style={{ fontSize: 12, marginBottom: 10, color: resultado.ok ? colors.success : colors.danger }}>{resultado.msg}</div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="outline" style={{ flex: 1 }} onClick={onCerrar}>{resultado?.ok ? "Cerrar" : "Cancelar"}</Button>
        <Button variant="primary" style={{ flex: 2 }} onClick={enviar} disabled={enviando || cargando || !texto.trim() || !para.length}>
          {enviando ? "Enviando…" : "Enviar por correo"}
        </Button>
      </div>
    </Modal>
  );
}
