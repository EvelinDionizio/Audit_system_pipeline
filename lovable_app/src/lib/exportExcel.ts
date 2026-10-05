// Exportação do painel de auditorias para Excel — porta de src/utils/export_excel.py.
// Mesmas abas (Resumo, Não Conformidades, Audit_<id>), cores, larguras e alturas.
import ExcelJS from "exceljs";
import { extrairSecao } from "./format";
import type { Payload, PayloadItem } from "./types";

const COR = {
  azulEscuro: "1F3864",
  azulMedio: "2E5FA3",
  azulClaro: "D6E4F7",
  vermelho: "C00000",
  vermelhoBg: "FCE4D6",
  amareloBg: "FFF2CC",
  amareloTx: "7F6000",
  verde: "217346",
  verdeBg: "E2EFDA",
  cinzaHeader: "F2F2F2",
  cinzaBorda: "CCCCCC",
  branco: "FFFFFF",
  parecerBg: "EEF4FB",
};
const FONTE = "Arial";
const SEM_PARECER = "Parecer não gerado — API key pendente.";

const argb = (hex: string) => ({ argb: `FF${hex}` });
const fill = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: argb(hex) });
const borda = (): Partial<ExcelJS.Borders> => {
  const lado = { style: "thin" as const, color: argb(COR.cinzaBorda) };
  return { top: lado, left: lado, bottom: lado, right: lado };
};

type Valor = string | number | null | undefined;

function headerCell(ws: ExcelJS.Worksheet, r: number, c: number, v: Valor, bg = COR.azulEscuro, fg = COR.branco) {
  const cell = ws.getCell(r, c);
  cell.value = v ?? null;
  cell.font = { name: FONTE, bold: true, size: 10, color: argb(fg) };
  cell.fill = fill(bg);
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = borda();
  return cell;
}

function dataCell(
  ws: ExcelJS.Worksheet, r: number, c: number, v: Valor,
  { bg = COR.branco, bold = false, align = "left", color = "000000" }:
    { bg?: string; bold?: boolean; align?: "left" | "center"; color?: string } = {},
) {
  const cell = ws.getCell(r, c);
  cell.value = v ?? null;
  cell.font = { name: FONTE, size: 10, bold, color: argb(color) };
  cell.fill = fill(bg);
  cell.alignment = { horizontal: align, vertical: "top", wrapText: true };
  cell.border = borda();
  return cell;
}

function coloredCell(ws: ExcelJS.Worksheet, r: number, c: number, v: Valor, bg: string, fg: string) {
  const cell = dataCell(ws, r, c, v, { bg, bold: true, align: "center", color: fg });
  return cell;
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function scoreLabel(codigo: number | null): string {
  const mapa: Record<number, string> = { 1: "Não Atingiu", 2: "Parcial", 3: "Atingiu", 4: "Não Atingiu", 6: "N/A" };
  return codigo !== null ? mapa[codigo] ?? "—" : "—";
}

function scoreBg(codigo: number | null): string {
  if (codigo === 1 || codigo === 4) return COR.vermelhoBg;
  if (codigo === 2) return COR.amareloBg;
  if (codigo === 3) return COR.verdeBg;
  return COR.cinzaHeader;
}

function coresCriticidade(crit: string): [string, string] {
  const c = crit.toUpperCase();
  if (c.includes("ALTA")) return [COR.vermelhoBg, COR.vermelho];
  if (c.includes("MÉDIA") || c.includes("MEDIA")) return [COR.amareloBg, COR.amareloTx];
  return [COR.verdeBg, COR.verde];
}

function larguras(ws: ExcelJS.Worksheet, ws_: number[]) {
  ws_.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

function titulo(ws: ExcelJS.Worksheet, range: string, texto: string, bg: string, size: number, altura: number) {
  ws.mergeCells(range);
  const c = ws.getCell(range.split(":")[0]);
  c.value = texto;
  c.font = { name: FONTE, bold: true, size, color: argb(COR.branco) };
  c.fill = fill(bg);
  c.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = altura;
}

// ── Aba RESUMO ───────────────────────────────────────────────────────────────
function buildResumo(wb: ExcelJS.Workbook, payloads: Payload[]) {
  const ws = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
  titulo(ws, "A1:I1", "PAINEL DE AUDITORIAS — CHECKLIST FÁCIL", COR.azulEscuro, 14, 36);

  ws.mergeCells("A2:I2");
  const sub = ws.getCell("A2");
  const agora = new Date();
  sub.value = `Gerado em ${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}  |  ${payloads.length} auditoria(s) em análise`;
  sub.font = { name: FONTE, size: 10, color: argb("666666") };
  sub.fill = fill(COR.cinzaHeader);
  sub.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 22;

  const totalNc = payloads.reduce((s, p) => s + p.resumo.total_nao_conformes, 0);
  const totalPc = payloads.reduce((s, p) => s + p.resumo.total_parciais, 0);
  const totalPareceres = payloads.reduce((s, p) => s + (p.resumo.total_com_parecer ?? 0), 0);
  const kpis: [string, number, string][] = [
    ["Auditorias", payloads.length, COR.azulMedio],
    ["Não Conformes", totalNc, COR.vermelho],
    ["Parciais", totalPc, COR.amareloTx],
    ["Com Parecer", totalPareceres, COR.verde],
  ];
  ws.getRow(3).height = 10;
  ws.getRow(4).height = 40;
  ws.getRow(5).height = 22;
  ws.getRow(6).height = 10;
  kpis.forEach(([label, valor, cor], i) => {
    const col = 1 + i * 2;
    ws.mergeCells(4, col, 4, col + 1);
    ws.mergeCells(5, col, 5, col + 1);
    const v = ws.getCell(4, col);
    v.value = String(valor);
    v.font = { name: FONTE, bold: true, size: 20, color: argb(cor) };
    v.alignment = { horizontal: "center", vertical: "middle" };
    const l = ws.getCell(5, col);
    l.value = label;
    l.font = { name: FONTE, size: 10, color: argb("444444") };
    l.alignment = { horizontal: "center", vertical: "middle" };
  });

  const headers = ["ID", "Checklist", "Unidade", "Data Início", "Data Conclusão", "Não Conf.", "Parciais", "Status", "Aba de Detalhes"];
  ws.getRow(7).height = 28;
  headers.forEach((h, i) => headerCell(ws, 7, i + 1, h, COR.azulMedio));

  payloads.forEach((p, idx) => {
    const r = 8 + idx;
    const { cabecalho: cab, resumo: res } = p;
    ws.getRow(r).height = 36;
    const [label, bg, fg] =
      res.total_nao_conformes > 0 ? ["⚠ NÃO CONFORME", COR.vermelhoBg, COR.vermelho]
      : res.total_parciais > 0 ? ["◑ PARCIAL", COR.amareloBg, COR.amareloTx]
      : ["✓ CONFORME", COR.verdeBg, COR.verde];
    const alt = r % 2 === 0 ? COR.cinzaHeader : COR.branco;

    dataCell(ws, r, 1, cab.id, { bg: alt, bold: true, align: "center" });
    dataCell(ws, r, 2, cab.checklist_nome, { bg: alt });
    dataCell(ws, r, 3, cab.unidade_nome, { bg: alt });
    dataCell(ws, r, 4, fmtData(cab.data_inicio), { bg: alt, align: "center" });
    dataCell(ws, r, 5, fmtData(cab.data_conclusao), { bg: alt, align: "center" });
    const nc = res.total_nao_conformes;
    const pc = res.total_parciais;
    coloredCell(ws, r, 6, nc, nc > 0 ? COR.vermelhoBg : alt, nc > 0 ? COR.vermelho : "000000");
    coloredCell(ws, r, 7, pc, pc > 0 ? COR.amareloBg : alt, pc > 0 ? COR.amareloTx : "000000");
    coloredCell(ws, r, 8, label, bg, fg);
    dataCell(ws, r, 9, `Audit_${cab.id}`, { bg: alt, color: COR.azulMedio, align: "center" });
  });

  larguras(ws, [14, 28, 30, 18, 18, 11, 11, 18, 18]);
}

// ── Aba NÃO CONFORMIDADES ────────────────────────────────────────────────────
function buildNaoConformidades(wb: ExcelJS.Workbook, payloads: Payload[]) {
  const ws = wb.addWorksheet("Não Conformidades", { views: [{ showGridLines: false }] });
  titulo(ws, "A1:H1", "CONSOLIDADO DE NÃO CONFORMIDADES E ITENS PARCIAIS", COR.vermelho, 13, 32);

  const headers = ["ID Auditoria", "Checklist", "Categoria", "Pergunta", "Classificação", "Comentário do Auditor", "Parecer Técnico", "Criticidade"];
  ws.getRow(2).height = 28;
  headers.forEach((h, i) => headerCell(ws, 2, i + 1, h, COR.azulMedio));

  let row = 3;
  for (const p of payloads) {
    for (const item of p.itens.filter((i) => i.nao_conforme || i.parcial)) {
      ws.getRow(row).height = 100;
      const parecer = item.parecer ?? "";
      const crit = parecer ? extrairSecao(parecer, "Criticidade") : "—";
      const [bgCrit, fgCrit] = coresCriticidade(crit);

      dataCell(ws, row, 1, p.cabecalho.id, { align: "center", bold: true });
      dataCell(ws, row, 2, p.cabecalho.checklist_nome);
      dataCell(ws, row, 3, item.categoria, { bg: COR.azulClaro });
      dataCell(ws, row, 4, item.pergunta);
      coloredCell(ws, row, 5, item.nao_conforme ? "Não Conforme" : "Parcial",
        item.nao_conforme ? COR.vermelhoBg : COR.amareloBg, item.nao_conforme ? COR.vermelho : COR.amareloTx);
      dataCell(ws, row, 6, item.comentario || item.resposta_texto || "—");
      dataCell(ws, row, 7, parecer || SEM_PARECER, { bg: COR.parecerBg });
      coloredCell(ws, row, 8, crit, bgCrit, fgCrit);
      row++;
    }
  }
  larguras(ws, [14, 24, 26, 40, 16, 50, 70, 18]);
}

// ── Aba por AUDITORIA ────────────────────────────────────────────────────────
function buildAuditoria(wb: ExcelJS.Workbook, p: Payload) {
  const { cabecalho: cab, resumo: res } = p;
  const ws = wb.addWorksheet(`Audit_${cab.id}`.slice(0, 31), { views: [{ showGridLines: false }] });
  titulo(ws, "A1:H1", `AUDITORIA #${cab.id} — ${cab.checklist_nome ?? ""}`, COR.azulEscuro, 13, 32);

  const meta: [string, Valor, string, Valor][] = [
    ["Unidade", cab.unidade_nome, "Auditor", cab.auditor_nome],
    ["Início", fmtData(cab.data_inicio), "Conclusão", fmtData(cab.data_conclusao)],
    ["Depto.", (cab.departamento ?? []).join(", ") || "—", "Itens relevantes", res.total_itens_relevantes],
    ["Não Conf.", res.total_nao_conformes, "Parciais", res.total_parciais],
  ];
  meta.forEach(([l1, v1, l2, v2], i) => {
    const r = 2 + i;
    ws.getRow(r).height = 22;
    headerCell(ws, r, 1, l1, COR.azulClaro, COR.azulEscuro);
    dataCell(ws, r, 2, v1);
    headerCell(ws, r, 4, l2, COR.azulClaro, COR.azulEscuro);
    dataCell(ws, r, 5, v2);
  });
  ws.getRow(6).height = 10;

  const headers = ["Categoria", "Pergunta", "Tipo", "Resultado", "Comentário do Auditor", "Resposta Texto", "Parecer Técnico", "Criticidade"];
  ws.getRow(7).height = 28;
  headers.forEach((h, i) => headerCell(ws, 7, i + 1, h, COR.azulMedio));

  let row = 8;
  let catAtual: string | null = null;
  for (const item of p.itens as PayloadItem[]) {
    if (item.categoria !== catAtual) {
      catAtual = item.categoria;
      ws.mergeCells(row, 1, row, 8);
      const c = ws.getCell(row, 1);
      c.value = `  ${catAtual}`;
      c.font = { name: FONTE, bold: true, size: 10, color: argb(COR.branco) };
      c.fill = fill(COR.azulMedio);
      c.alignment = { horizontal: "left", vertical: "middle" };
      ws.getRow(row).height = 22;
      row++;
    }

    const problema = item.nao_conforme || item.parcial;
    ws.getRow(row).height = problema ? 120 : 70;
    const bgRow = item.nao_conforme ? COR.vermelhoBg : item.parcial ? COR.amareloBg : COR.branco;
    const parecer = item.parecer ?? "";
    const crit = parecer ? extrairSecao(parecer, "Criticidade") : "—";
    const [bgCrit, fgCrit] = coresCriticidade(crit);

    dataCell(ws, row, 1, item.categoria, { bg: bgRow });
    dataCell(ws, row, 2, item.pergunta, { bg: bgRow });
    dataCell(ws, row, 3, item.tipo_resposta === "texto" ? "Texto" : "Avaliativo", { bg: bgRow, align: "center" });
    coloredCell(ws, row, 4, scoreLabel(item.resposta_codigo), scoreBg(item.resposta_codigo), "000000");
    dataCell(ws, row, 5, item.comentario || "—", { bg: bgRow });
    dataCell(ws, row, 6, item.resposta_texto || "—", { bg: bgRow });
    if (problema) {
      dataCell(ws, row, 7, parecer || SEM_PARECER, { bg: COR.parecerBg });
      coloredCell(ws, row, 8, crit, bgCrit, fgCrit);
    } else {
      dataCell(ws, row, 7, "—");
      dataCell(ws, row, 8, "—", { align: "center" });
    }
    row++;
  }
  larguras(ws, [26, 40, 10, 16, 50, 40, 70, 18]);
}

export async function exportarExcel(payloads: Payload[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  buildResumo(wb, payloads);
  buildNaoConformidades(wb, payloads);
  payloads.forEach((p) => buildAuditoria(wb, p));

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `painel_auditorias_${ts}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
