import { colors } from "../../theme/colors";

// SALIR DE UNA PANTALLA ES UNA DECISIÓN, NO UN RESBALÓN.
//
// Antes, un clic en el fondo oscuro la cerraba. El fondo oscuro es casi toda
// la ventana: con una orden de cambio a medio escribir —título, justificación,
// cinco partidas con sus precios— un clic a dos centímetros del borde borraba
// todo eso sin preguntar y sin dejar nada. Lo escrito acá vive en memoria
// hasta que alguien aprieta guardar, así que cerrar de más no es una molestia:
// es trabajo perdido.
//
// Se sale por donde dice que se sale. Cada pantalla tiene su Cancelar, su
// Cerrar o su ×, y es la única puerta. Lo que se pierde al apretarla se
// perdió porque alguien decidió perderlo.
// `onClose` ya no se recibe: las pantallas lo siguen pasando y no hace falta
// leerlo, porque el fondo ya no cierra nada.
export default function Modal({ maxWidth = 420, children }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 300,
        padding: 20,
      }}
    >
      <div
        style={{
          background: colors.surface,
          borderRadius: colors.radiusLg,
          padding: 20,
          maxWidth,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(17,24,39,0.18)",
          fontFamily: colors.font,
        }}
      >
        {children}
      </div>
    </div>
  );
}
