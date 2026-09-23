import { useState } from "react";
import { Check, Link as Enlace } from "lucide-react";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import InlineFiles from "./InlineFiles";

// Al completar una tarea, la prueba de lo que se hizo.
//
// "Listo" sin nada detrás obliga a preguntar: ¿listo cómo, dónde quedó? Acá se
// deja la foto, el PDF firmado o el enlace a donde está, y una línea de qué se
// hizo. Nada de eso es obligatorio —hay tareas que son una llamada— pero
// pedirlo en el momento es la única forma de que exista.
//
// Sirve igual para aprobar: quien aprueba puede dejar el documento firmado.

export default function CompletarTarea({ tarea, modo = "completar", onConfirmar, onCerrar }) {
  const [enlace, setEnlace] = useState(tarea.prueba_enlace || "");
  const [nota, setNota] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const aprobar = modo === "aprobar", devolver = modo === "devolver";
  const titulo = aprobar ? "Aprobar" : devolver ? "Devolver para corregir" : "Completar la tarea";

  async function confirmar() {
    setTrabajando(true);
    await onConfirmar({ enlace: enlace.trim() || null, nota: nota.trim() });
    setTrabajando(false);
    onCerrar();
  }

  return (
    <Modal onClose={onCerrar} maxWidth={430}>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, marginBottom: 3 }}>{titulo}</div>
      <div style={{ fontSize: 12.5, color: colors.inkSoft, marginBottom: 14, overflowWrap: "anywhere" }}>{tarea.title}</div>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={{ color: colors.muted, fontSize: 11, fontWeight: 500, marginBottom: 4, display: "block" }}>
            {devolver ? "¿Qué hay que corregir? *" : aprobar ? "Comentario de la aprobación" : "¿Qué se hizo?"}
          </label>
          <textarea value={nota} onChange={e => setNota(e.target.value)} autoFocus
            placeholder={devolver ? "Lo que falta o hay que cambiar" : "Opcional: una línea de cómo quedó"}
            style={{ ...inputStyle, minHeight: 56, resize: "vertical" }} />
        </div>

        {!devolver && (
          <>
            <div>
              <label style={{ color: colors.muted, fontSize: 11, fontWeight: 500, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                <Enlace size={11} /> Enlace de la prueba
              </label>
              <input value={enlace} onChange={e => setEnlace(e.target.value)} placeholder="https://… foto, plano firmado, carpeta" style={inputStyle} />
            </div>

            <div>
              <div style={{ color: colors.muted, fontSize: 11, fontWeight: 500, marginBottom: 4 }}>O sube la foto o el archivo</div>
              <InlineFiles taskId={tarea.id} />
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Button variant="primary" size="lg" style={{ flex: 1 }} disabled={trabajando || (devolver && !nota.trim())} onClick={confirmar}>
          <Check size={14} /> {aprobar ? "Aprobar" : devolver ? "Devolver" : "Completar"}
        </Button>
        <Button variant="outline" size="lg" onClick={onCerrar}>Cancelar</Button>
      </div>
      {!devolver && (
        <div style={{ fontSize: 11, color: colors.muted, marginTop: 8, textAlign: "center" }}>
          Todo esto es opcional: hay tareas que son una llamada y no dejan papel.
        </div>
      )}
    </Modal>
  );
}
