import { initials } from "../../lib/dates";
import { colors } from "../../theme/colors";

export default function Avatar({ name, size = 32, color = colors.brand }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.32,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials(name || "?")}
    </div>
  );
}
