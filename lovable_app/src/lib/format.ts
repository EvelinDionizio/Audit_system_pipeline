import type { Nivel } from "./types";

export const STATUS_LABELS: Record<number, string> = {
  2: "Em Andamento",
  3: "Em Análise",
  4: "Reprovado",
  5: "Reaberto",
  6: "Concluído",
};

export function nivelDoScore(pct: number): Exclude<Nivel, "sem_dados"> {
  return pct >= 90 ? "excelente" : pct >= 75 ? "bom" : pct >= 60 ? "regular" : "critico";
}

/** Classes Tailwind por nível de conformidade (círculo, badge e barra). */
export const NIVEL_CLASSES: Record<Nivel, { borda: string; texto: string; badge: string; barra: string }> = {
  excelente: { borda: "border-bh-verde", texto: "text-bh-verde", badge: "bg-bh-verde-lt text-bh-verde", barra: "bg-bh-verde" },
  bom: { borda: "border-blue-500", texto: "text-blue-500", badge: "bg-blue-100 text-blue-800", barra: "bg-blue-500" },
  regular: { borda: "border-bh-amarelo", texto: "text-bh-amarelo", badge: "bg-bh-amarelo-lt text-bh-amarelo", barra: "bg-bh-amarelo" },
  critico: { borda: "border-bh-vermelho", texto: "text-bh-vermelho", badge: "bg-bh-vermelho-lt text-bh-vermelho", barra: "bg-bh-vermelho" },
  sem_dados: { borda: "border-bh-cinza", texto: "text-bh-cinza", badge: "bg-bh-cinza-lt text-bh-cinza", barra: "bg-bh-cinza" },
};

export function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Number(v)}%`;
}

export function fmtDataBR(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

/** Remove marcação markdown do texto do Claude (porta de limparMarkdown das páginas originais). */
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

/**
 * Extrai uma seção do parecer (ex.: "Criticidade") — porta de _extrair_secao() do export_excel.py.
 * Retorna o início do parecer quando a seção não é encontrada.
 */
export function extrairSecao(parecer: string | null | undefined, secao: string): string {
  if (!parecer) return "—";
  const resultado: string[] = [];
  let capturando = false;
  const alvo = secao.toLowerCase();
  for (const linha of parecer.split("\n")) {
    const limpa = linha.trim().replace(/^[#*]+/, "").trim();
    if (!capturando && limpa.toLowerCase().includes(alvo) && (linha.includes("**") || limpa.startsWith(secao) || /^\d+\./.test(limpa))) {
      capturando = true;
      const idx = limpa.indexOf(":");
      if (idx >= 0) {
        const resto = limpa.slice(idx + 1).replace(/\*\*/g, "").trim();
        if (resto) resultado.push(resto);
      }
      continue;
    }
    if (capturando) {
      if (limpa && /Constatação|Fundamentação|Recomendação|Texto para|\*\*/.test(limpa) && linha.trim() !== limpa) break;
      if (limpa) resultado.push(limpa.replace(/\*\*/g, ""));
    }
  }
  return resultado.join(" ").trim() || parecer.slice(0, 300);
}
