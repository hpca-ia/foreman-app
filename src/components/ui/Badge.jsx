import { colors } from "../../theme/colors";

export default function Badge({ color = colors.muted, bg, dot = true, children, style }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: bg || colors.neutralSoft,
        padding: "2px 8px",
        borderRadius: 20,
        fontFamily: colors.font,
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />}
      {children}
    </span>
  );
}
