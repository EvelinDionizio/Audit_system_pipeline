/**
 * Auditorias fictícias que substituem o Checklist Fácil no modo
 * demonstração. Dados inventados, sem relação com clientes reais. Ficam no
 * formato cru da API, e quem as estrutura é o código real (checklist-facil.server),
 * então pesos e regras de conformidade são os mesmos da produção.
 * Cobrem não conformes, parciais, conformes e comentários com erro de
 * digitação, para exercitar todas as regras do parecer.
 */

type Resultado = "nc" | "parcial" | "conforme" | "na";

type ItemExemplo = {
  categoria: string;
  pergunta: string;
  resultado: Resultado;
  comentario?: string;
  anexos?: number;
};

const CODIGO: Record<Resultado, number> = { nc: 1, parcial: 2, conforme: 3, na: 6 };

type CabecalhoExemplo = {
  checklist_nome: string;
  unidade_nome: string;
  auditor_nome: string;
  data_inicio: string;
  data_conclusao: string | null;
  status: number;
  departamento: string[];
};

type Bruto = Record<string, unknown>;

/**
 * Monta a resposta crua no formato da API do Checklist Fácil. Quem estrutura
 * (pesos, conformidade, resumo) é o código real, em estruturarAvaliacao.
 */
function montar(id: number, cab: CabecalhoExemplo, itens: ItemExemplo[]): Bruto {
  const categorias = new Map<string, Bruto[]>();
  itens.forEach((item, i) => {
    const lista = categorias.get(item.categoria) ?? [];
    lista.push({
      id: id * 100 + i + 1,
      name: item.pergunta,
      answer: { evaluative: CODIGO[item.resultado] },
      comment: item.comentario ?? "",
      attachments: Array.from({ length: item.anexos ?? 0 }, (_, n) => ({ id: n + 1 })),
    });
    categorias.set(item.categoria, lista);
  });

  return {
    id,
    checklist: { name: cab.checklist_nome },
    unit: { name: cab.unidade_nome },
    user: { name: cab.auditor_nome },
    departments: cab.departamento.map((name) => ({ name })),
    status: cab.status,
    startedAt: cab.data_inicio,
    concludedAt: cab.data_conclusao,
    categories: [...categorias].map(([name, items]) => ({ name, items })),
  };
}
const AUDITORIAS: Record<number, Bruto> = {
  900000001: montar(
    900000001,
    {
      checklist_nome: "Segurança do Trabalho — Canteiro de Obras",
      unidade_nome: "Obra Residencial Vila Nova — São Paulo/SP",
      auditor_nome: "Carlos Mendes",
      data_inicio: "2026-09-29T08:30:00-03:00",
      data_conclusao: null,
      status: 3,
      departamento: ["Engenharia", "SESMT"],
    },
    [
      { categoria: "EPI", pergunta: "Os trabalhadores utilizam capacete com jugular nas frentes de trabalho? (Mandatório)", resultado: "nc", comentario: "3 trabalhadores sem capacete na laje do 4º andar.", anexos: 2 },
      { categoria: "EPI", pergunta: "Há registro de entrega de EPI assinado pelos trabalhadores? (Importantes)", resultado: "parcial", comentario: "Fichas de EPI parciallmente preenchidas, faltando CA dos equipamentos." },
      { categoria: "EPI", pergunta: "Os EPIs possuem Certificado de Aprovação (CA) válido? (Importantes)", resultado: "conforme" },
      { categoria: "Trabalho em Altura", pergunta: "Os trabalhadores utilizam cinto de segurança tipo paraquedista? (Mandatório)", resultado: "nc", comentario: "Montador de andaime sem cinto conectado à linha de vida.", anexos: 0 },
      { categoria: "Trabalho em Altura", pergunta: "Existe Análise de Risco e Permissão de Trabalho para atividades acima de 2 m? (Mandatório)", resultado: "parcial", comentario: "AR existe, mas a PT do dia não estava assinada pelo responsável." },
      { categoria: "Trabalho em Altura", pergunta: "Os trabalhadores possuem treinamento de NR-35 válido? (Importantes)", resultado: "conforme" },
      { categoria: "Instalações Elétricas", pergunta: "Os quadros elétricos provisórios estão fechados e sinalizados? (Mandatório)", resultado: "nc", comentario: "Quadro do térreo aberto e sem sinalizaçao de risco elétrico." },
      { categoria: "Instalações Elétricas", pergunta: "Os circuitos possuem dispositivo DR? (Importantes)", resultado: "conforme" },
      { categoria: "Documentação", pergunta: "O PGR da obra está atualizado e disponível no canteiro? (Mandatório)", resultado: "conforme", comentario: "PGR revisado em agosto, disponivel na secretaria da obra." },
      { categoria: "Sinalização", pergunta: "O canteiro possui sinalização de segurança adequada? (Desejáveis)", resultado: "parcial", comentario: "Faltam placas de uso obrigatório de EPI na entrada." },
    ],
  ),

  900000002: montar(
    900000002,
    {
      checklist_nome: "Higiene Ocupacional — Indústria",
      unidade_nome: "Metalúrgica Alfa — Campinas/SP",
      auditor_nome: "Juliana Prado",
      data_inicio: "2026-10-01T09:00:00-03:00",
      data_conclusao: null,
      status: 2,
      departamento: ["Produção"],
    },
    [
      { categoria: "Máquinas e Equipamentos", pergunta: "As prensas possuem proteções fixas e dispositivos de parada de emergência? (Mandatório)", resultado: "nc", comentario: "Prensa 03 com proteção lateral removida para manutençao e não recolocada." },
      { categoria: "Máquinas e Equipamentos", pergunta: "Há inventário atualizado das máquinas? (Importantes)", resultado: "conforme" },
      { categoria: "Ruído", pergunta: "Existe avaliação quantitativa de ruído nos postos de trabalho? (Importantes)", resultado: "parcial", comentario: "Laudo de 2024; setor de corte foi ampliado depois disso." },
      { categoria: "Ruído", pergunta: "Os protetores auriculares são adequados ao nível de ruído medido? (Importantes)", resultado: "conforme" },
      { categoria: "Saúde Ocupacional", pergunta: "O PCMSO está implementado com exames periódicos em dia? (Mandatório)", resultado: "conforme" },
      { categoria: "Saúde Ocupacional", pergunta: "Há audiometrias para os expostos a ruído acima do nível de ação? (Importantes)", resultado: "parcial", comentario: "12 de 40 trabalhadores com audiometria vencida." },
      { categoria: "Combate a Incêndio", pergunta: "Os extintores estão dentro da validade e desobstruídos? (Mandatório)", resultado: "conforme" },
    ],
  ),

  900000003: montar(
    900000003,
    {
      checklist_nome: "Conformidade Administrativa — Escritório",
      unidade_nome: "Escritório Central — São Paulo/SP",
      auditor_nome: "Carlos Mendes",
      data_inicio: "2026-09-22T14:00:00-03:00",
      data_conclusao: "2026-09-22T16:30:00-03:00",
      status: 3,
      departamento: ["Administrativo"],
    },
    [
      { categoria: "Ergonomia", pergunta: "Existe Análise Ergonômica Preliminar dos postos de trabalho? (Importantes)", resultado: "conforme" },
      { categoria: "Ergonomia", pergunta: "As cadeiras possuem regulagem de altura e apoio lombar? (Desejáveis)", resultado: "parcial", comentario: "Algumas cadeiras da recepção sem regulagem." },
      { categoria: "Combate a Incêndio", pergunta: "As rotas de fuga estão sinalizadas e desobstruídas? (Mandatório)", resultado: "conforme" },
      { categoria: "Documentação", pergunta: "O PGR contempla os riscos do ambiente administrativo? (Mandatório)", resultado: "conforme" },
      { categoria: "Primeiros Socorros", pergunta: "Há kit de primeiros socorros e pessoas treinadas? (Desejáveis)", resultado: "na" },
    ],
  ),
};

export const IDS_EXEMPLO = Object.keys(AUDITORIAS).map(Number);

/** Resposta crua da API para a avaliação de exemplo (passa por estruturarAvaliacao). */
export function avaliacaoBrutaDeExemplo(evaluationId: number): Bruto {
  const auditoria = AUDITORIAS[evaluationId];
  if (!auditoria) {
    throw new Error(
      `Modo demonstração: a avaliação #${evaluationId} não existe. Use uma das de exemplo: ${IDS_EXEMPLO.join(", ")}.`,
    );
  }
  return auditoria;
}
