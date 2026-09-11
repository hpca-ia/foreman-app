import { daysUntil } from "../lib/dates";
import { colors } from "../theme/colors";
import Badge from "./ui/Badge";

export default function FechaBadge({ due, status }) {
  if (status === "listo") return null;
  const d = daysUntil(due);
  if (d < 0) return <Badge color={colors.danger} bg={colors.dangerSoft}>Vencida {Math.abs(d)}d</Badge>;
  if (d === 0) return <Badge color={colors.warning} bg={colors.warningSoft}>Hoy</Badge>;
  if (d <= 2) return <Badge color={colors.warning} bg={colors.warningSoft}>en {d}d</Badge>;
  return <Badge color={colors.muted} bg={colors.neutralSoft}>en {d}d</Badge>;
}
