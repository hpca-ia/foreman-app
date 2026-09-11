import { colors } from "../../theme/colors";

const VARIANTS = {
  primary: { background: colors.brand, border: "none", color: "#fff" },
  secondary: { background: colors.neutralSoft, border: "none", color: colors.inkSoft },
  outline: { background: colors.surface, border: `1.5px solid ${colors.border}`, color: colors.inkSoft },
  danger: { background: colors.dangerSoft, border: `1px solid #F3C6C6`, color: colors.danger },
};

const SIZES = {
  sm: { padding: "5px 10px", fontSize: 11, borderRadius: colors.radiusSm },
  md: { padding: "7px 14px", fontSize: 12, borderRadius: colors.radiusMd },
  lg: { padding: 12, fontSize: 14, borderRadius: colors.radiusMd },
};

export default function Button({ variant = "primary", size = "md", disabled, style, children, ...rest }) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  return (
    <button
      disabled={disabled}
      style={{
        ...v,
        ...s,
        fontFamily: colors.font,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
