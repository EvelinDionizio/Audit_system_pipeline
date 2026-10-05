import type { Cell, Worksheet } from "exceljs";
import type { PayloadRevisao } from "@/lib/analista.functions";

/**
 * Exportação Excel do painel (substitui src/utils/export_excel.py).
 *
 * Gerada no navegador com exceljs: a lib depende de APIs do Node que o
 * runtime edge não tem. Mesmas abas do Python: Resumo, Não Conformidades e
 * uma aba Audit_<id> por auditoria.
 */

// Cores das células da planilha (conteúdo do .xlsx, não da interface):
// mesma paleta do export_excel.py.
const COR = {
  azulEscuro: "1F3864",
  azulMedio: "2E5FA3",
  azulClaro: "D6E4F7",
  vermelho: "C00000",
  vermelhoBg: "FCE4D6",
  amareloBg: "FFF2CC",
  amareloTexto: "7F6000",
  verde: "217346",
  verdeBg: "E2EFDA",
  cinzaHeader: "F2F2F2",
  cinzaBorda: "CCCCCC",
  cinzaTexto: "666666",
  branco: "FFFFFF",
  preto: "000000",
  parecerBg: "EEF4FB",
} as const;

const FONTE = "Arial";

export type AuditoriaExportada = { evaluation_id: number; payload: PayloadRevisao };

type Item = PayloadRevisao["itens"][number] & {
  tipo_resposta?: string | null;
  resposta_codigo?: number | null;
};

type Cabecalho = PayloadRevisao["cabecalho"] & {
  data_conclusao?: string | null;
  departamento?: string[] | null;
};


// ── Estilo ───────────────────────────────────────────────────────────────────

type Estilo = {
  bg?: string;
  fg?: string;
  bold?: boolean;
  size?: number;
  horizontal?: "left" | "center";
  vertical?: "top" | "middle";
  wrap?: boolean;
};

const argb = (hex: string) => ({ argb: `FF${hex}` });
const LADO = { style: "thin" as const, color: argb(COR.cinzaBorda) };
const BORDA = { top: LADO, left: LADO, bottom: LADO, right: LADO };

function estilizar(cell: Cell, e: Estilo) {
  cell.font = { name: FONTE, size: e.size ?? 10, bold: e.bold ?? false, color: argb(e.fg ?? COR.preto) };
  if (e.bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: argb(e.bg) };
  cell.alignment = { horizontal: e.horizontal ?? "left", vertical: e.vertical ?? "top", wrapText: e.wrap ?? true };
  cell.border = BORDA;
}

function cabecalho(ws: Worksheet, linha: number, coluna: number, valor: string | number, e: Estilo = {}) {
  const cell = ws.getCell(linha, coluna);
  cell.value = valor;
  estilizar(cell, { bg: COR.azulEscuro, fg: COR.branco, bold: true, horizontal: "center", vertical: "middle", wrap: false, ...e });
}

function dado(ws: Worksheet, linha: number, coluna: number, valor: string | number, e: Estilo = {}) {
  const cell = ws.getCell(linha, coluna);
  cell.value = valor;
  estilizar(cell, { bg: COR.branco, ...e });
}

function titulo(ws: Worksheet, intervalo: string, texto: string, bg: string, size: number, altura: number) {
  ws.mergeCells(intervalo);
  const cell = ws.getCell(intervalo.split(":")[0] as string);
  cell.value = texto;
  cell.font = { name: FONTE, bold: true, size, color: argb(COR.branco) };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: argb(bg) };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = altura;
}

function larguras(ws: Worksheet, valores: number[]) {
  valores.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}


// ── Conteúdo ─────────────────────────────────────────────────────────────────

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? iso
    : data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const RESULTADO: Record<number, string> = { 1: "Não Atingiu", 2: "Parcial", 3: "Atingiu", 4: "Não Atingiu", 6: "N/A" };

function corResultado(codigo: number | null | undefined): string {
  if (codigo === 1 || codigo === 4) return COR.vermelhoBg;
  if (codigo === 2) return COR.amareloBg;
  if (codigo === 3) return COR.verdeBg;
  return COR.cinzaHeader;
}

function statusAuditoria(nc: number, parciais: number) {
  if (nc > 0) return { rotulo: "⚠ NÃO CONFORME", bg: COR.vermelhoBg, fg: COR.vermelho };
  if (parciais > 0) return { rotulo: "◑ PARCIAL", bg: COR.amareloBg, fg: COR.amareloTexto };
  return { rotulo: "✓ CONFORME", bg: COR.verdeBg, fg: COR.verde };
}

/** O parecer agora vem por seção; na planilha vira um texto único, como antes. */
function textoParecer(item: Item): string {
  const p = item.parecer;
  if (!p) return item.erro_parecer ?? "Parecer não gerado.";
  return [
    `Constatação: ${p.constatacao}`,
    `Fundamentação normativa: ${p.fundamentacao}`,
    `Recomendação: ${p.recomendacao}`,
    `Texto para o campo: ${p.texto_campo}`,
  ].join("\n\n");
}

function criticidade(item: Item) {
  const p = item.parecer;
  if (!p) return { texto: "—", bg: COR.branco, fg: COR.preto };
  const texto = `${p.criticidade} — ${p.justificativa_criticidade}`;
  if (p.criticidade === "Alta") return { texto, bg: COR.vermelhoBg, fg: COR.vermelho };
  if (p.criticidade === "Média") return { texto, bg: COR.amareloBg, fg: COR.amareloTexto };
  return { texto, bg: COR.verdeBg, fg: COR.verde };
}

const abaDaAuditoria = (id: number) => `Audit_${id}`;
const itensDe = (a: AuditoriaExportada) => a.payload.itens as Item[];


// ── Abas ─────────────────────────────────────────────────────────────────────

function abaResumo(ws: Worksheet, auditorias: AuditoriaExportada[]) {
  titulo(ws, "A1:I1", "PAINEL DE AUDITORIAS — CHECKLIST FÁCIL", COR.azulEscuro, 14, 36);

  ws.mergeCells("A2:I2");
  const sub = ws.getCell("A2");
  sub.value = `Gerado em ${new Date().toLocaleString("pt-BR")}  |  ${auditorias.length} auditoria(s)`;
  sub.font = { name: FONTE, size: 10, color: argb(COR.cinzaTexto) };
  sub.fill = { type: "pattern", pattern: "solid", fgColor: argb(COR.cinzaHeader) };
  sub.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 22;

  const kpis: [string, number, string][] = [
    ["Auditorias", auditorias.length, COR.azulMedio],
    ["Não Conformes", auditorias.reduce((s, a) => s + a.payload.resumo.total_nao_conformes, 0), COR.vermelho],
    ["Parciais", auditorias.reduce((s, a) => s + a.payload.resumo.total_parciais, 0), COR.amareloTexto],
    ["Com Parecer", auditorias.reduce((s, a) => s + itensDe(a).filter((i) => i.parecer).length, 0), COR.verde],
  ];
  ws.getRow(4).height = 40;
  ws.getRow(5).height = 22;
  kpis.forEach(([rotulo, valor, cor], i) => {
    const col = 1 + i * 2;
    ws.mergeCells(4, col, 4, col + 1);
    ws.mergeCells(5, col, 5, col + 1);
    const v = ws.getCell(4, col);
    v.value = valor;
    v.font = { name: FONTE, bold: true, size: 20, color: argb(cor) };
    v.alignment = { horizontal: "center", vertical: "middle" };
    const l = ws.getCell(5, col);
    l.value = rotulo;
    l.font = { name: FONTE, size: 10, color: argb("444444") };
    l.alignment = { horizontal: "center", vertical: "middle" };
  });

  const titulos = ["ID", "Checklist", "Unidade", "Data Início", "Data Conclusão", "Não Conf.", "Parciais", "Status", "Aba de Detalhes"];
  ws.getRow(7).height = 28;
  titulos.forEach((t, i) => cabecalho(ws, 7, i + 1, t, { bg: COR.azulMedio }));

  auditorias.forEach((a, i) => {
    const linha = 8 + i;
    const cab = a.payload.cabecalho as Cabecalho;
    const { total_nao_conformes: nc, total_parciais: parciais } = a.payload.resumo;
    const status = statusAuditoria(nc, parciais);
    const alt = linha % 2 === 0 ? COR.cinzaHeader : COR.branco;
    ws.getRow(linha).height = 36;

    dado(ws, linha, 1, a.evaluation_id, { bg: alt, bold: true, horizontal: "center" });
    dado(ws, linha, 2, cab.checklist_nome ?? "—", { bg: alt });
    dado(ws, linha, 3, cab.unidade_nome ?? "—", { bg: alt });
    dado(ws, linha, 4, fmtData(cab.data_inicio), { bg: alt, horizontal: "center" });
    dado(ws, linha, 5, fmtData(cab.data_conclusao), { bg: alt, horizontal: "center" });
    dado(ws, linha, 6, nc, { bg: nc > 0 ? COR.vermelhoBg : alt, fg: nc > 0 ? COR.vermelho : COR.preto, bold: true, horizontal: "center" });
    dado(ws, linha, 7, parciais, {
      bg: parciais > 0 ? COR.amareloBg : alt,
      fg: parciais > 0 ? COR.amareloTexto : COR.preto,
      bold: true,
      horizontal: "center",
    });
    dado(ws, linha, 8, status.rotulo, { bg: status.bg, fg: status.fg, bold: true, horizontal: "center" });

    const aba = abaDaAuditoria(a.evaluation_id);
    const link = ws.getCell(linha, 9);
    link.value = { text: aba, hyperlink: `#'${aba}'!A1` };
    estilizar(link, { bg: alt, fg: COR.azulMedio, horizontal: "center" });
  });

  larguras(ws, [14, 28, 30, 18, 18, 11, 11, 18, 18]);
}

function abaNaoConformidades(ws: Worksheet, auditorias: AuditoriaExportada[]) {
  titulo(ws, "A1:H1", "CONSOLIDADO DE NÃO CONFORMIDADES E ITENS PARCIAIS", COR.vermelho, 13, 32);

  const titulos = ["ID Auditoria", "Checklist", "Categoria", "Pergunta", "Classificação", "Comentário do Auditor", "Parecer Técnico", "Criticidade"];
  ws.getRow(2).height = 28;
  titulos.forEach((t, i) => cabecalho(ws, 2, i + 1, t, { bg: COR.azulMedio }));

  let linha = 3;
  for (const a of auditorias) {
    for (const item of itensDe(a).filter((i) => i.nao_conforme || i.parcial)) {
      ws.getRow(linha).height = 100;
      const nc = Boolean(item.nao_conforme);
      const crit = criticidade(item);

      dado(ws, linha, 1, a.evaluation_id, { bold: true, horizontal: "center" });
      dado(ws, linha, 2, a.payload.cabecalho.checklist_nome ?? "—");
      dado(ws, linha, 3, item.categoria ?? "—", { bg: COR.azulClaro });
      dado(ws, linha, 4, item.pergunta ?? "—");
      dado(ws, linha, 5, nc ? "Não Conforme" : "Parcial", {
        bg: nc ? COR.vermelhoBg : COR.amareloBg,
        fg: nc ? COR.vermelho : COR.amareloTexto,
        bold: true,
        horizontal: "center",
      });
      dado(ws, linha, 6, item.comentario || item.resposta_texto || "—");
      dado(ws, linha, 7, textoParecer(item), { bg: COR.parecerBg });
      dado(ws, linha, 8, crit.texto, { bg: crit.bg, fg: crit.fg, bold: true, horizontal: "center" });
      linha++;
    }
  }

  larguras(ws, [14, 24, 26, 40, 16, 50, 70, 18]);
}

function abaAuditoria(ws: Worksheet, a: AuditoriaExportada) {
  const cab = a.payload.cabecalho as Cabecalho;
  const res = a.payload.resumo;
  titulo(ws, "A1:H1", `AUDITORIA #${a.evaluation_id} — ${cab.checklist_nome ?? ""}`, COR.azulEscuro, 13, 32);

  const meta: [string, string | number, string, string | number][] = [
    ["Unidade", cab.unidade_nome ?? "—", "Auditor", cab.auditor_nome ?? "—"],
    ["Início", fmtData(cab.data_inicio), "Conclusão", fmtData(cab.data_conclusao)],
    ["Depto.", cab.departamento?.join(", ") || "—", "Itens relevantes", res.total_itens_relevantes],
    ["Não Conf.", res.total_nao_conformes, "Parciais", res.total_parciais],
  ];
  meta.forEach(([r1, v1, r2, v2], i) => {
    const linha = 2 + i;
    ws.getRow(linha).height = 22;
    cabecalho(ws, linha, 1, r1, { bg: COR.azulClaro, fg: COR.azulEscuro });
    dado(ws, linha, 2, v1);
    cabecalho(ws, linha, 4, r2, { bg: COR.azulClaro, fg: COR.azulEscuro });
    dado(ws, linha, 5, v2);
  });

  const titulos = ["Categoria", "Pergunta", "Tipo", "Resultado", "Comentário do Auditor", "Resposta Texto", "Parecer Técnico", "Criticidade"];
  ws.getRow(7).height = 28;
  titulos.forEach((t, i) => cabecalho(ws, 7, i + 1, t, { bg: COR.azulMedio }));

  let linha = 8;
  let categoriaAtual: string | null = null;
  for (const item of itensDe(a)) {
    const categoria = item.categoria ?? "Geral";
    if (categoria !== categoriaAtual) {
      categoriaAtual = categoria;
      ws.mergeCells(linha, 1, linha, 8);
      const c = ws.getCell(linha, 1);
      c.value = `  ${categoria}`;
      c.font = { name: FONTE, bold: true, size: 10, color: argb(COR.branco) };
      c.fill = { type: "pattern", pattern: "solid", fgColor: argb(COR.azulMedio) };
      c.alignment = { horizontal: "left", vertical: "middle" };
      ws.getRow(linha).height = 22;
      linha++;
    }

    const problema = Boolean(item.nao_conforme || item.parcial);
    const bg = item.nao_conforme ? COR.vermelhoBg : item.parcial ? COR.amareloBg : COR.branco;
    ws.getRow(linha).height = problema ? 120 : 70;

    dado(ws, linha, 1, categoria, { bg });
    dado(ws, linha, 2, item.pergunta ?? "—", { bg });
    dado(ws, linha, 3, item.tipo_resposta === "texto" ? "Texto" : "Avaliativo", { bg, horizontal: "center" });
    dado(ws, linha, 4, (item.resposta_codigo != null && RESULTADO[item.resposta_codigo]) || "—", {
      bg: corResultado(item.resposta_codigo),
      bold: true,
      horizontal: "center",
    });
    dado(ws, linha, 5, item.comentario || "—", { bg });
    dado(ws, linha, 6, item.resposta_texto || "—", { bg });

    if (problema) {
      const crit = criticidade(item);
      dado(ws, linha, 7, textoParecer(item), { bg: COR.parecerBg });
      dado(ws, linha, 8, crit.texto, { bg: crit.bg, fg: crit.fg, bold: true, horizontal: "center" });
    } else {
      dado(ws, linha, 7, "—");
      dado(ws, linha, 8, "—", { horizontal: "center" });
    }
    linha++;
  }

  larguras(ws, [26, 40, 10, 16, 50, 40, 70, 18]);
}


// ── Entrada principal (substitui generate_excel) ─────────────────────────────

export async function exportarExcel(auditorias: AuditoriaExportada[]): Promise<void> {
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;

  const wb = new ExcelJS.Workbook();
  const semGrade = { views: [{ showGridLines: false }] };
  abaResumo(wb.addWorksheet("Resumo", semGrade), auditorias);
  abaNaoConformidades(wb.addWorksheet("Não Conformidades", semGrade), auditorias);
  for (const a of auditorias) {
    abaAuditoria(wb.addWorksheet(abaDaAuditoria(a.evaluation_id), semGrade), a);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const carimbo = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `painel_auditorias_${carimbo}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
