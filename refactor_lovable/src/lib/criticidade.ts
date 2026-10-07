/**
 * Criticidade do item do checklist, lida do nome da pergunta. Fica num lugar
 * só para o score (checklist-facil) e o parecer (parecer) nunca divergirem.
 */

export type Criticidade = "Mandatório" | "Importantes" | "Desejáveis";

/** Criticidade escrita no nome da pergunta, ou null se não há marcação. */
export function criticidadeMarcada(pergunta: string): Criticidade | null {
  if (pergunta.includes("(Mandatório)")) return "Mandatório";
  if (pergunta.includes("(Importantes)")) return "Importantes";
  if (pergunta.includes("(Desejáveis)")) return "Desejáveis";
  return null;
}

/** Para o score: pergunta sem marcação conta como Desejáveis (peso 1), como no Python. */
export function criticidadeDaPergunta(pergunta: string): Criticidade {
  return criticidadeMarcada(pergunta) ?? "Desejáveis";
}
