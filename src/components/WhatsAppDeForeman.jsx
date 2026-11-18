import { useState, useEffect, useCallback } from "react";
import { MessageCircle, Check, AlertTriangle, Send, RefreshCw } from "lucide-react";
import Button from "./ui/Button";
import { whatsappDeForeman, probarWhatsApp } from "../modules/leads/proyecto";
import { ESTADOS_DE_WHATSAPP, momento } from "../modules/leads/aprobaciones.js";

// EL WHATSAPP DE FOREMAN: cómo está, la plantilla que hay que cargar en Meta,
// y probarlo.
//
// Hernán, 18/11/2026: «es importante ya integrar WhatsApp. ¿Qué pasos damos?».
// Su parte se hace afuera —en Meta y en Vercel— y son pasos que fallan en
// silencio: una variable que falta, un token vencido, una plantilla todavía
// sin aprobar, el webhook sin conectar. Acá FOREMAN dice en cuál está, da el
// texto exacto de la plantilla para copiarlo, y manda una prueba al celular de
// quien la pide antes de escribirle a un cliente.
//
// De lo que falta muestra el nombre de la variable, nunca un valor: el token y
// el secreto se cargan en Vercel y no pasan por esta pantalla.

const caja = { background: "var(--bg)", borderRadius: "var(--radius-md)", padding: 14, border: "1px solid var(--border)" };
const chico = { fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 };
const dato = { fontSize: 11.5, color: "var(--ink)", background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "6px 8px", whiteSpace: "pre-wrap", overflowWrap: "anywhere", userSelect: "all" };
const rotulo = { fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, margin: "8px 0 3px" };

export default function WhatsAppDeForeman({ usuario }) {
  const [estado, setEstado] = useState(null);
  const [verPlantilla, setVerPlantilla] = useState(false);
  const [probando, setProbando] = useState(false);
  const [dijo, setDijo] = useState(null);   // { ok, texto }

  const leer = useCallback(async () => { setEstado(await whatsappDeForeman()); }, []);
  useEffect(() => { leer(); }, [leer]);

  async function probar() {
    setProbando(true); setDijo(null);
    const r = await probarWhatsApp(usuario?.id);
    setDijo(r.error ? { ok: false, texto: r.error }
      : { ok: true, texto: `Meta lo aceptó: va al celular de ${r.enviadoA} (termina en ${r.termina}). Si en un minuto no te llega, tocá «Ver si llegó».` });
    setProbando(false);
    leer();
  }

  const p = estado?.plantilla;
  const prueba = estado?.ultimaPrueba;
  const dePrueba = prueba ? ESTADOS_DE_WHATSAPP[prueba.estado] || ESTADOS_DE_WHATSAPP.enviado : null;

  return (
    <div className="whatsapp-de-foreman" style={caja}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 4 }}>
        <MessageCircle size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />WhatsApp de FOREMAN
      </div>
      <div style={{ ...chico, marginBottom: 8 }}>
        Con el número configurado en Meta, pedirle una aprobación al cliente le escribe solo por WhatsApp, además del correo, y en «Aprobaciones» se ve si le llegó.
      </div>

      {!estado ? <div style={chico}>Mirando cómo está…</div> : (
        <>
          {estado.configurado ? (
            <div className="whatsapp-configurado" role="status" style={{ fontSize: 12, color: "var(--success)", fontWeight: 600 }}>
              <Check size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Las cuatro variables están cargadas en Vercel.
            </div>
          ) : (
            <div className="whatsapp-sin-configurar" role="status" style={{ fontSize: 12, color: "var(--warning)", lineHeight: 1.5 }}>
              <AlertTriangle size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              Todavía no está configurado. Falta cargar en Vercel: <strong>{estado.falta.join(", ") || "las variables de WhatsApp"}</strong>.
              <div style={chico}>Mientras tanto, al pedir una aprobación se abre tu WhatsApp con el mensaje ya escrito.</div>
            </div>
          )}
          {estado.sinMigracion && (
            <div className="whatsapp-sin-migracion" style={{ fontSize: 11.5, color: "var(--warning)", lineHeight: 1.5, marginTop: 6 }}>
              Falta correr la migración 189: sin ella el mensaje sale igual, pero FOREMAN no puede anotar si llegó.
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <Button variant="outline" size="sm" disabled={probando || !estado.configurado} onClick={probar}>
              <Send size={12} /> {probando ? "Mandando…" : "Mandarme una prueba"}
            </Button>
            {prueba && (
              <Button variant="outline" size="sm" onClick={leer}><RefreshCw size={12} /> Ver si llegó</Button>
            )}
            <button className="ver-la-plantilla" onClick={() => setVerPlantilla(v => !v)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font)", fontSize: 11.5, fontWeight: 600, color: "var(--brand)" }}>
              {verPlantilla ? "Ocultar la plantilla" : "Ver la plantilla para cargar en Meta"}
            </button>
          </div>
          {dijo && (
            <div className="prueba-dijo" role={dijo.ok ? "status" : "alert"} style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 6, color: dijo.ok ? "var(--ink-soft)" : "var(--danger)", overflowWrap: "anywhere" }}>{dijo.texto}</div>
          )}
          {prueba && (
            <div className="ultima-prueba" style={{ ...chico, marginTop: 6 }}>
              La última prueba ({prueba.usuario_nombre || "—"}, {momento(prueba.created_at)}):{" "}
              <strong style={{ color: `var(--${dePrueba.tono === "muted" ? "ink-soft" : dePrueba.tono})` }}>{dePrueba.dice}</strong>
              {prueba.estado === "fallo" && prueba.error ? ` — ${prueba.error}` : ""}
              {prueba.estado === "enviado" && ". Meta todavía no avisó la entrega: si pasa más de un minuto y el mensaje sí te llegó, el webhook no está conectado."}
              {(prueba.estado === "entregado" || prueba.estado === "leido") && ". El webhook está conectado: Meta avisa las entregas."}
            </div>
          )}

          {verPlantilla && p && (
            <div className="la-plantilla" style={{ marginTop: 10 }}>
              <div style={chico}>En WhatsApp Manager → Plantillas de mensajes → Crear plantilla. Tiene que quedar igual a esto, con los cuatro huecos y el botón: si no, Meta rechaza lo que manda FOREMAN.</div>
              <div style={rotulo}>NOMBRE · CATEGORÍA · IDIOMA</div>
              <div style={dato}>{p.nombre} · {p.categoria} · Español ({p.idioma})</div>
              <div style={rotulo}>CUERPO</div>
              <div style={dato}>{p.cuerpo}</div>
              <div style={rotulo}>MUESTRAS DE LOS HUECOS (Meta las pide para revisarla)</div>
              <div style={dato}>{(p.ejemplos?.cuerpo || []).map((e, i) => `{{${i + 1}}} ${e}`).join("\n")}</div>
              <div style={rotulo}>PIE (opcional)</div>
              <div style={dato}>{p.pie}</div>
              <div style={rotulo}>BOTÓN · «Ir al sitio web», con URL dinámica</div>
              <div style={dato}>{`Texto: ${p.boton?.texto}\nURL: ${p.boton?.url}\nMuestra del hueco: ${p.ejemplos?.boton}`}</div>
              <div style={rotulo}>WEBHOOK (en la app de Meta → WhatsApp → Configuración), suscrito al campo «messages»</div>
              <div style={dato}>{estado.webhook}</div>
              <div style={chico}>El «token de verificación» que pide Meta es el mismo valor que cargaste en WHATSAPP_VERIFY_TOKEN.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
