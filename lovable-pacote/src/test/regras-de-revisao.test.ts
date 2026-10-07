import { describe, expect, test } from "vitest";
import { estruturarAvaliacao } from "../lib/checklist-facil.server";
import { temErroOrtografico } from "../lib/parecer.server";

/** Resposta crua mínima da API com um item. */
function avaliacao(item: Record<string, unknown>) {
  return { categories: [{ name: "Geral", items: [{ id: 1, name: "Item (Importantes)", ...item }] }] };
}

const comTexto = (comment: string) => estruturarAvaliacao(avaliacao({ comment })).itens[0];
const comNota = (evaluative: number, name = "Item (Importantes)") =>
  estruturarAvaliacao({ categories: [{ name: "Geral", items: [{ id: 1, name, answer: { evaluative } }] }] });

describe("temErroOrtografico", () => {
  test.each([
    "Realizada instrução de segurança",
    "Obra em construção",
    "Área obstruída",
    "Transporte de materiais",
    "Inscrição no sindicato",
    "Perspectiva de entrega",
  ])("não marca palavra normal: %s", (comentario) => {
    expect(temErroOrtografico({ comentario })).toBe(false);
  });

  test("não marca siglas em maiúsculas", () => {
    expect(temErroOrtografico({ comentario: "PCMSO e SESMT atualizados" })).toBe(false);
  });

  test.each([
    "Fichas parciallmente preenchidas",
    "Item parcialmnte atendido",
    "Documento nao conformidade",
    "Registro zxcvbnm incompleto",
    "Sinalizaçao aaaaa faltando",
  ])("marca erro de digitação: %s", (comentario) => {
    expect(temErroOrtografico({ comentario })).toBe(true);
  });
});

describe("texto livre sem nota", () => {
  test.each([
    "Não existe plano de emergência",
    "Documento não apresentado",
    "Extintor inadequado",
    "Sem extintor adequado na área",
  ])("negação ou antônimo vira não conforme: %s", (comentario) => {
    const item = comTexto(comentario);
    expect(item?.nao_conforme).toBe(true);
    expect(item?.conforme).toBe(false);
  });

  test.each(["Existe plano de emergência", "Documento apresentado e adequado", "OK"])(
    "afirmação continua conforme: %s",
    (comentario) => {
      const item = comTexto(comentario);
      expect(item?.conforme).toBe(true);
      expect(item?.nao_conforme).toBe(false);
    },
  );

  test("palavras curtas só valem inteiras (Financeiro não é NC)", () => {
    const item = comTexto("Setor Financeiro concluído");
    expect(item?.nao_conforme).toBe(false);
  });
});

describe("score", () => {
  test("ponderado por criticidade: Mandatório 3, Importantes 2, Desejáveis 1", () => {
    const bruto = {
      categories: [
        {
          name: "Geral",
          items: [
            { id: 1, name: "A (Mandatório)", answer: { evaluative: 3 } }, // conforme, peso 3
            { id: 2, name: "B (Importantes)", answer: { evaluative: 1 } }, // NC, peso 2
            { id: 3, name: "C (Desejáveis)", answer: { evaluative: 2 } }, // parcial, peso 1
          ],
        },
      ],
    };
    // (3 + 0 + 0,5) / 6 = 58,3%
    expect(estruturarAvaliacao(bruto).resumo.percentual_conformidade).toBe(58.3);
  });

  test("não aplicável fica fora do cálculo", () => {
    const { resumo } = comNota(6);
    expect(resumo.total_nao_aplicaveis).toBe(1);
    expect(resumo.percentual_conformidade).toBeNull();
  });

  test("código de resposta desconhecido não vira zero ponto", () => {
    const bruto = {
      categories: [
        {
          name: "Geral",
          items: [
            { id: 1, name: "A (Importantes)", answer: { evaluative: 3 } },
            { id: 2, name: "B (Importantes)", answer: { evaluative: 99 } },
          ],
        },
      ],
    };
    expect(estruturarAvaliacao(bruto).resumo.percentual_conformidade).toBe(100);
  });
});
