import { useRef, useState } from "react";

// Dictado por voz, el mismo que usa NOVA en tareas, para poder usarlo también
// en el pipeline. Los navegadores no cortan solos cuando uno deja de hablar:
// se corta a los 2 segundos sin palabras nuevas, a los 7 si no se oyó nada, y
// nunca pasa de 25. Sin eso el micrófono queda abierto hasta que alguien lo
// toca, y eso asusta.

const MOTIVOS = {
  "not-allowed": "Falta permiso del micrófono. Dáselo a FOREMAN en los ajustes del navegador.",
  "service-not-allowed": "El navegador bloqueó el dictado. Prueba en Safari o Chrome.",
  "no-speech": "No se escuchó nada. Acerca el teléfono y vuelve a intentar.",
  "audio-capture": "No encuentro micrófono en este equipo.",
  "network": "Sin conexión para el dictado.",
  "aborted": "",
};

export function useDictado({ onParcial, onListo }) {
  const recRef = useRef(null);
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState("");

  function dictar() {
    // Tocar el micrófono mientras escucha = "ya terminé": corta y procesa.
    if (recRef.current) { try { recRef.current.stop(); } catch {} return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Este navegador no sabe dictar. Usa el micrófono del teclado de tu teléfono, que funciona igual.");
      return;
    }
    setError("");
    let r;
    try { r = new SR(); } catch {
      setError("No se pudo abrir el dictado. Usa el micrófono del teclado de tu teléfono.");
      return;
    }
    r.lang = "es-EC"; r.continuous = false; r.interimResults = true;

    let oido = "";
    let silencio = null;
    const cortar = () => { try { r.stop(); } catch {} };
    const limpiar = () => { clearTimeout(silencio); clearTimeout(tope); };
    const tope = setTimeout(cortar, 25000);
    silencio = setTimeout(cortar, 7000);

    r.onresult = e => {
      const t = Array.from(e.results).map(x => x[0].transcript).join("");
      if (t) { oido = t; onParcial?.(t); }
      clearTimeout(silencio);
      silencio = setTimeout(cortar, 2000);
    };
    r.onerror = ev => {
      limpiar(); recRef.current = null; setGrabando(false);
      const m = MOTIVOS[ev.error];
      setError(m === "" ? "" : (m || `El dictado falló (${ev.error}). Usa el micrófono del teclado de tu teléfono.`));
    };
    r.onend = () => {
      limpiar(); recRef.current = null; setGrabando(false);
      if (oido.trim()) onListo?.(oido.trim());
      else setError(v => v || "No llegó nada del micrófono. Si abriste FOREMAN desde WhatsApp, ábrelo en Safari o Chrome.");
    };
    try { r.start(); recRef.current = r; setGrabando(true); } catch {
      limpiar();
      setError("El dictado ya estaba andando. Espera un momento y vuelve a intentar.");
    }
  }

  return { grabando, error, setError, dictar };
}
