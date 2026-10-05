import { Badge } from "@/components/ui/badge";
import { type Nivel, NIVEL_ESTILO, fmtPct, nivelDoScore } from "@/lib/format";

/** Percentual de conformidade colorido pelo nível. */
export function ScoreBadge({ pct, nivel }: { pct: number | null | undefined; nivel?: Nivel }) {
  const n = nivel ?? nivelDoScore(pct);
  return (
    <Badge variant={NIVEL_ESTILO[n].badge} className="min-w-12">
      {fmtPct(pct)}
    </Badge>
  );
}
