import { colors } from "../../theme/colors";

export default function Card({ style, children, ...rest }) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: colors.radiusMd,
        padding: 14,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
