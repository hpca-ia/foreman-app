import { colors } from "../../theme/colors";

export default function Modal({ onClose, maxWidth = 420, children }) {
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
      onClick={onClose}
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
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
