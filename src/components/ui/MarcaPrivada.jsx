import { colors } from "../../theme/colors";

// Una letra y no un ícono: se lee de un vistazo en una lista sin ocupar lugar,
// y el título explica qué significa al pasar el mouse o mantener el dedo.
export default function MarcaPrivada() {
  return (
    <span title="Privada: solo la ven los admins y la persona asignada" aria-label="Tarea privada"
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: 4, background: colors.ink, color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0, marginRight: 6, verticalAlign: "middle", lineHeight: 1 }}>
      P
    </span>
  );
}
