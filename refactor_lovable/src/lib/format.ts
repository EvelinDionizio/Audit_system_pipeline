export type Nivel = "excelente" | "bom" | "regular" | "critico" | "sem_dados";

/** Status das aplicações no Checklist Fácil. */
export const STATUS_LABELS: Record<number, string> = {
  2: "Em Andamento",
  3: "Em Análise",
  4: "Reprovado",
  5: "Reaberto",
  6: "Concluído",
};

/** Mesmas faixas de enrichment_service.py. */
export function nivelDoScore(pct: number | null | undefined): Nivel {
  if (pct === null || pct === undefined) return "sem_dados";
  return pct >= 90 ? "excelente" : pct >= 75 ? "bom" : pct >= 60 ? "regular" : "critico";
}

export function normalizarNivel(nivel: string | null | undefined): Nivel {
  return nivel === "excelente" || nivel === "bom" || nivel === "regular" || nivel === "critico"
    ? nivel
    : "sem_dados";
}

/** Classes semânticas por nível de conformidade. */
export const NIVEL_ESTILO: Record<
  Nivel,
  { badge: "success" | "info" | "warning" | "destructive" | "neutral"; texto: string; borda: string; barra: string }
> = {
  excelente: { badge: "success", texto: "text-success", borda: "border-success", barra: "bg-success" },
  bom: { badge: "info", texto: "text-info", borda: "border-info", barra: "bg-info" },
  regular: { badge: "warning", texto: "text-warning", borda: "border-warning", barra: "bg-warning" },
  critico: { badge: "destructive", texto: "text-destructive", borda: "border-destructive", barra: "bg-destructive" },
  sem_dados: { badge: "neutral", texto: "text-muted-foreground", borda: "border-muted-foreground", barra: "bg-muted-foreground" },
};

export function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Number(v)}%`;
}

export function fmtDataBR(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

export function fmtDataHoraBR(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

/** Remove marcação markdown do texto do Claude (limparMarkdown das páginas originais). */
export function limparMarkdown(txt: string | null | undefined): string {
  if (!txt) return "";
  return txt
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/---\s*/g, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/ {3,}/g, "")
    .trim();
}
