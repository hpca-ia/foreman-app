import { colors } from "../../theme/colors";

export const inputStyle = {
  width: "100%",
  background: colors.bg,
  border: `1.5px solid ${colors.border}`,
  borderRadius: colors.radiusMd,
  color: colors.ink,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: colors.font,
  boxSizing: "border-box",
  outline: "none",
};

export default function Input({ style, as = "input", ...rest }) {
  const Tag = as;
  return <Tag style={{ ...inputStyle, ...style }} {...rest} />;
}
