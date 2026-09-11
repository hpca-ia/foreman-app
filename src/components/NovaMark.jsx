import { colors } from "../theme/colors";

export default function NovaMark({ size = 26 }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="38" fill={colors.ink} />
        <text x="40" y="55" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="40" fontWeight="700" fill={colors.brand}>N</text>
        <circle cx="58" cy="20" r="10" fill={colors.brand} />
      </svg>
    </div>
  );
}
