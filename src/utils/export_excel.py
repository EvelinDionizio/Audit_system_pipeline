import json
import os
import glob
from datetime import datetime, timezone
from openpyxl import Workbook
from openpyxl.styles import (
    Font, PatternFill, Alignment, Border, Side, GradientFill
)
from openpyxl.utils import get_column_letter

# ── Paleta de cores ────────────────────────────────────────────────────────────
COR_AZUL_ESCURO   = "1F3864"
COR_AZUL_MEDIO    = "2E5FA3"
COR_AZUL_CLARO    = "D6E4F7"
COR_VERMELHO      = "C00000"
COR_VERMELHO_BG   = "FCE4D6"
COR_AMARELO_BG    = "FFF2CC"
COR_VERDE         = "217346"
COR_VERDE_BG      = "E2EFDA"
COR_CINZA_HEADER  = "F2F2F2"
COR_CINZA_BORDA   = "CCCCCC"
COR_BRANCO        = "FFFFFF"
COR_TEXTO_CLARO   = "FFFFFF"
COR_PARECER_BG    = "EEF4FB"   # azul muito claro para células de parecer

FONTE = "Arial"

# ── Helpers de estilo ──────────────────────────────────────────────────────────
def borda_fina():
    lado = Side(style="thin", color=COR_CINZA_BORDA)
    return Border(left=lado, right=lado, top=lado, bottom=lado)

def header_cell(ws, row, col, value, bg=COR_AZUL_ESCURO, fg=COR_TEXTO_CLARO, size=10, bold=True, wrap=False):
    cell = ws.cell(row=row, column=col, value=value)
    cell.font = Font(name=FONTE, bold=bold, size=size, color=fg)
    cell.fill = PatternFill("solid", fgColor=bg)
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=wrap)
    cell.border = borda_fina()
    return cell

def data_cell(ws, row, col, value, bg=COR_BRANCO, bold=False, wrap=True, align="left", color="000000"):
    cell = ws.cell(row=row, column=col, value=value)
    cell.font = Font(name=FONTE, size=10, bold=bold, color=color)
    cell.fill = PatternFill("solid", fgColor=bg)
    cell.alignment = Alignment(horizontal=align, vertical="top", wrap_text=wrap)
    cell.border = borda_fina()
    return cell

def badge_status(requer_rag, nao_conformes, parciais):
    if nao_conformes > 0:
        return ("⚠ NÃO CONFORME", COR_VERMELHO_BG, COR_VERMELHO)
    if parciais > 0:
        return ("◑ PARCIAL", COR_AMARELO_BG, "7F6000")
    return ("✓ CONFORME", COR_VERDE_BG, COR_VERDE)

def score_label(codigo):
    mapa = {1: "Não Atingiu", 2: "Parcial", 3: "Atingiu", 4: "Não Atingiu", 6: "N/A"}
    return mapa.get(codigo, "—")

def score_bg(codigo):
    if codigo in (1, 4): return COR_VERMELHO_BG
    if codigo == 2:       return COR_AMARELO_BG
    if codigo == 3:       return COR_VERDE_BG
    return COR_CINZA_HEADER

def fmt_data(iso):
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y %H:%M")
    except:
        return iso

def _extrair_secao(parecer: str, secao: str) -> str:
    """
    Extrai uma seção específica do parecer gerado pelo Claude.
    Ex: _extrair_secao(parecer, "Criticidade") → "Alta — ..."
    Retorna o texto completo se não encontrar a seção.
    """
    if not parecer:
        return "—"
    linhas = parecer.splitlines()
    capturando = False
    resultado = []
    for linha in linhas:
        linha_limpa = linha.strip().lstrip("#*").strip()
        if secao.lower() in linha_limpa.lower() and ("**" in linha or linha_limpa.startswith(secao)):
            capturando = True
            # Conteúdo na mesma linha após ":"
            if ":" in linha_limpa:
                resto = linha_limpa.split(":", 1)[1].strip()
                if resto:
                    resultado.append(resto)
            continue
        if capturando:
            if linha_limpa and any(
                s in linha_limpa
                for s in ["Constatação", "Fundamentação", "Recomendação", "Criticidade", "**"]
            ) and linha_limpa != linha_limpa.lstrip("#*").strip():
                break
            if linha_limpa:
                resultado.append(linha_limpa)
    return " ".join(resultado).strip() or parecer[:300]


# ── Aba RESUMO ─────────────────────────────────────────────────────────────────
def build_resumo(wb, payloads):
    ws = wb.active
    ws.title = "Resumo"
    ws.sheet_view.showGridLines = False

    # Título
    ws.merge_cells("A1:I1")
    t = ws["A1"]
    t.value = "PAINEL DE AUDITORIAS — CHECKLIST FÁCIL"
    t.font = Font(name=FONTE, bold=True, size=14, color=COR_TEXTO_CLARO)
    t.fill = PatternFill("solid", fgColor=COR_AZUL_ESCURO)
    t.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 36

    ws.merge_cells("A2:I2")
    sub = ws["A2"]
    sub.value = f"Gerado em {datetime.now().strftime('%d/%m/%Y às %H:%M')}  |  {len(payloads)} auditoria(s) em análise"
    sub.font = Font(name=FONTE, size=10, color="666666")
    sub.fill = PatternFill("solid", fgColor=COR_CINZA_HEADER)
    sub.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 22

    # KPIs
    total    = len(payloads)
    total_nc = sum(p["resumo"]["total_nao_conformes"] for p in payloads)
    total_pc = sum(p["resumo"]["total_parciais"] for p in payloads)
    rag_sim  = sum(1 for p in payloads if p["resumo"]["requer_rag"])
    total_pareceres = sum(p["resumo"].get("total_com_parecer", 0) for p in payloads)

    kpis = [
        ("Auditorias",    str(total),           COR_AZUL_MEDIO),
        ("Não Conformes", str(total_nc),         COR_VERMELHO),
        ("Parciais",      str(total_pc),         "7F6000"),
        ("Com Parecer",   str(total_pareceres),  COR_VERDE),
    ]
    ws.row_dimensions[3].height = 10
    ws.row_dimensions[4].height = 40
    ws.row_dimensions[5].height = 22
    ws.row_dimensions[6].height = 10

    kpi_cols = [1, 3, 5, 7]
    for (label, value, cor), col in zip(kpis, kpi_cols):
        ws.merge_cells(start_row=4, start_column=col, end_row=4, end_column=col+1)
        ws.merge_cells(start_row=5, start_column=col, end_row=5, end_column=col+1)
        v = ws.cell(row=4, column=col, value=value)
        v.font = Font(name=FONTE, bold=True, size=20, color=cor)
        v.alignment = Alignment(horizontal="center", vertical="center")
        l = ws.cell(row=5, column=col, value=label)
        l.font = Font(name=FONTE, size=10, color="444444")
        l.alignment = Alignment(horizontal="center", vertical="center")

    # Cabeçalho da tabela
    headers = ["ID", "Checklist", "Unidade", "Data Início", "Data Conclusão",
               "Não Conf.", "Parciais", "Status", "Aba de Detalhes"]
    ws.row_dimensions[7].height = 28
    for i, h in enumerate(headers, 1):
        header_cell(ws, 7, i, h, bg=COR_AZUL_MEDIO)

    # Linhas
    for r, p in enumerate(payloads, 8):
        cab = p["cabecalho"]
        res = p["resumo"]
        ws.row_dimensions[r].height = 36

        label, bg, fg = badge_status(res["requer_rag"], res["total_nao_conformes"], res["total_parciais"])
        alt_bg = COR_CINZA_HEADER if r % 2 == 0 else COR_BRANCO

        data_cell(ws, r, 1, cab["id"],               bg=alt_bg, bold=True, align="center")
        data_cell(ws, r, 2, cab["checklist_nome"],    bg=alt_bg)
        data_cell(ws, r, 3, cab["unidade_nome"],      bg=alt_bg)
        data_cell(ws, r, 4, fmt_data(cab["data_inicio"]),    bg=alt_bg, align="center")
        data_cell(ws, r, 5, fmt_data(cab["data_conclusao"]), bg=alt_bg, align="center")

        nc = ws.cell(row=r, column=6, value=res["total_nao_conformes"])
        nc.font = Font(name=FONTE, size=10, bold=True, color=COR_VERMELHO if res["total_nao_conformes"] > 0 else "000000")
        nc.fill = PatternFill("solid", fgColor=COR_VERMELHO_BG if res["total_nao_conformes"] > 0 else alt_bg)
        nc.alignment = Alignment(horizontal="center", vertical="top")
        nc.border = borda_fina()

        pc = ws.cell(row=r, column=7, value=res["total_parciais"])
        pc.font = Font(name=FONTE, size=10, bold=True, color="7F6000" if res["total_parciais"] > 0 else "000000")
        pc.fill = PatternFill("solid", fgColor=COR_AMARELO_BG if res["total_parciais"] > 0 else alt_bg)
        pc.alignment = Alignment(horizontal="center", vertical="top")
        pc.border = borda_fina()

        st = ws.cell(row=r, column=8, value=label)
        st.font = Font(name=FONTE, size=10, bold=True, color=fg)
        st.fill = PatternFill("solid", fgColor=bg)
        st.alignment = Alignment(horizontal="center", vertical="top")
        st.border = borda_fina()

        aba = f"Audit_{cab['id']}"
        data_cell(ws, r, 9, aba, bg=alt_bg, color=COR_AZUL_MEDIO, align="center")

    larguras = [14, 28, 30, 18, 18, 11, 11, 18, 18]
    for i, w in enumerate(larguras, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


# ── Aba NÃO CONFORMIDADES ──────────────────────────────────────────────────────
def build_nao_conformidades(wb, payloads):
    ws = wb.create_sheet("Não Conformidades")
    ws.sheet_view.showGridLines = False

    ws.merge_cells("A1:H1")
    t = ws["A1"]
    t.value = "CONSOLIDADO DE NÃO CONFORMIDADES E ITENS PARCIAIS"
    t.font = Font(name=FONTE, bold=True, size=13, color=COR_TEXTO_CLARO)
    t.fill = PatternFill("solid", fgColor=COR_VERMELHO)
    t.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 32

    headers = [
        "ID Auditoria", "Checklist", "Categoria", "Pergunta",
        "Classificação", "Comentário do Auditor",
        "Parecer Técnico", "Criticidade",
    ]
    ws.row_dimensions[2].height = 28
    for i, h in enumerate(headers, 1):
        header_cell(ws, 2, i, h, bg=COR_AZUL_MEDIO)

    row = 3
    for p in payloads:
        cab = p["cabecalho"]
        itens_criticos = [i for i in p["itens"] if i.get("nao_conforme") or i.get("parcial")]

        for item in itens_criticos:
            ws.row_dimensions[row].height = 100
            clf    = "Não Conforme" if item.get("nao_conforme") else "Parcial"
            bg_clf = COR_VERMELHO_BG if item.get("nao_conforme") else COR_AMARELO_BG
            fg_clf = COR_VERMELHO if item.get("nao_conforme") else "7F6000"

            parecer     = item.get("parecer") or ""
            criticidade = _extrair_secao(parecer, "Criticidade") if parecer else "—"
            parecer_resumido = parecer if parecer else "Parecer não gerado — API key pendente."

            # Cor da criticidade
            crit_upper = criticidade.upper()
            if "ALTA" in crit_upper:
                bg_crit, fg_crit = COR_VERMELHO_BG, COR_VERMELHO
            elif "MÉDIA" in crit_upper or "MEDIA" in crit_upper:
                bg_crit, fg_crit = COR_AMARELO_BG, "7F6000"
            else:
                bg_crit, fg_crit = COR_VERDE_BG, COR_VERDE

            data_cell(ws, row, 1, cab["id"],              align="center", bold=True)
            data_cell(ws, row, 2, cab["checklist_nome"])
            data_cell(ws, row, 3, item["categoria"],      bg=COR_AZUL_CLARO)
            data_cell(ws, row, 4, item["pergunta"])

            c = ws.cell(row=row, column=5, value=clf)
            c.font = Font(name=FONTE, size=10, bold=True, color=fg_clf)
            c.fill = PatternFill("solid", fgColor=bg_clf)
            c.alignment = Alignment(horizontal="center", vertical="top", wrap_text=True)
            c.border = borda_fina()

            comentario = item.get("comentario") or item.get("resposta_texto") or "—"
            data_cell(ws, row, 6, comentario)
            data_cell(ws, row, 7, parecer_resumido, bg=COR_PARECER_BG)

            crit_cell = ws.cell(row=row, column=8, value=criticidade)
            crit_cell.font = Font(name=FONTE, size=10, bold=True, color=fg_crit)
            crit_cell.fill = PatternFill("solid", fgColor=bg_crit)
            crit_cell.alignment = Alignment(horizontal="center", vertical="top", wrap_text=True)
            crit_cell.border = borda_fina()

            row += 1

    larguras = [14, 24, 26, 40, 16, 50, 70, 18]
    for i, w in enumerate(larguras, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


# ── Aba por AUDITORIA ──────────────────────────────────────────────────────────
def build_auditoria(wb, payload):
    cab = payload["cabecalho"]
    res = payload["resumo"]
    aba_nome = f"Audit_{cab['id']}"
    ws = wb.create_sheet(aba_nome)
    ws.sheet_view.showGridLines = False

    # Título
    ws.merge_cells("A1:H1")
    t = ws["A1"]
    t.value = f"AUDITORIA #{cab['id']} — {cab['checklist_nome']}"
    t.font = Font(name=FONTE, bold=True, size=13, color=COR_TEXTO_CLARO)
    t.fill = PatternFill("solid", fgColor=COR_AZUL_ESCURO)
    t.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 32

    # Metadados
    meta = [
        ("Unidade",   cab["unidade_nome"],               "Auditor", cab["auditor_nome"]),
        ("Início",    fmt_data(cab["data_inicio"]),       "Conclusão", fmt_data(cab["data_conclusao"])),
        ("Depto.",    ", ".join(cab.get("departamento") or []) or "—",
         "Itens relevantes", res["total_itens_relevantes"]),
        ("Não Conf.", res["total_nao_conformes"],         "Parciais", res["total_parciais"]),
    ]
    for r_off, (l1, v1, l2, v2) in enumerate(meta, 2):
        ws.row_dimensions[r_off].height = 22
        header_cell(ws, r_off, 1, l1, bg=COR_AZUL_CLARO, fg=COR_AZUL_ESCURO, bold=True)
        data_cell(ws, r_off, 2, v1, bold=False)
        header_cell(ws, r_off, 4, l2, bg=COR_AZUL_CLARO, fg=COR_AZUL_ESCURO, bold=True)
        data_cell(ws, r_off, 5, v2, bold=False)

    ws.row_dimensions[6].height = 10

    # Cabeçalho da tabela de itens
    headers = [
        "Categoria", "Pergunta", "Tipo", "Resultado",
        "Comentário do Auditor", "Resposta Texto",
        "Parecer Técnico", "Criticidade",
    ]
    ws.row_dimensions[7].height = 28
    for i, h in enumerate(headers, 1):
        header_cell(ws, 7, i, h, bg=COR_AZUL_MEDIO)

    # Itens agrupados por categoria
    row = 8
    cat_atual = None
    for item in payload["itens"]:
        if item["categoria"] != cat_atual:
            cat_atual = item["categoria"]
            ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=8)
            c = ws.cell(row=row, column=1, value=f"  {cat_atual}")
            c.font = Font(name=FONTE, bold=True, size=10, color=COR_TEXTO_CLARO)
            c.fill = PatternFill("solid", fgColor=COR_AZUL_MEDIO)
            c.alignment = Alignment(horizontal="left", vertical="center")
            ws.row_dimensions[row].height = 22
            row += 1

        tem_problema = item.get("nao_conforme") or item.get("parcial")
        altura = 120 if tem_problema else 70
        ws.row_dimensions[row].height = altura

        bg_row = COR_VERMELHO_BG if item.get("nao_conforme") else \
                 COR_AMARELO_BG  if item.get("parcial")       else COR_BRANCO

        parecer     = item.get("parecer") or ""
        criticidade = _extrair_secao(parecer, "Criticidade") if parecer else "—"

        # Cor da criticidade
        crit_upper = criticidade.upper()
        if "ALTA" in crit_upper:
            bg_crit, fg_crit = COR_VERMELHO_BG, COR_VERMELHO
        elif "MÉDIA" in crit_upper or "MEDIA" in crit_upper:
            bg_crit, fg_crit = COR_AMARELO_BG, "7F6000"
        else:
            bg_crit, fg_crit = COR_VERDE_BG, COR_VERDE

        data_cell(ws, row, 1, item["categoria"],   bg=bg_row)
        data_cell(ws, row, 2, item["pergunta"],     bg=bg_row)

        tipo = "Texto" if item["tipo_resposta"] == "texto" else "Avaliativo"
        data_cell(ws, row, 3, tipo, bg=bg_row, align="center")

        s = ws.cell(row=row, column=4, value=score_label(item["resposta_codigo"]))
        s.font = Font(name=FONTE, size=10, bold=True)
        s.fill = PatternFill("solid", fgColor=score_bg(item["resposta_codigo"]))
        s.alignment = Alignment(horizontal="center", vertical="top", wrap_text=True)
        s.border = borda_fina()

        data_cell(ws, row, 5, item.get("comentario") or "—",     bg=bg_row)
        data_cell(ws, row, 6, item.get("resposta_texto") or "—", bg=bg_row)

        if tem_problema:
            parecer_texto = parecer if parecer else "Parecer não gerado — API key pendente."
            data_cell(ws, row, 7, parecer_texto, bg=COR_PARECER_BG)

            crit_cell = ws.cell(row=row, column=8, value=criticidade)
            crit_cell.font = Font(name=FONTE, size=10, bold=True, color=fg_crit)
            crit_cell.fill = PatternFill("solid", fgColor=bg_crit)
            crit_cell.alignment = Alignment(horizontal="center", vertical="top", wrap_text=True)
            crit_cell.border = borda_fina()
        else:
            data_cell(ws, row, 7, "—", bg=COR_BRANCO)
            data_cell(ws, row, 8, "—", bg=COR_BRANCO, align="center")

        row += 1

    larguras = [26, 40, 10, 16, 50, 40, 70, 18]
    for i, w in enumerate(larguras, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


# ── ENTRADA PRINCIPAL ──────────────────────────────────────────────────────────
def generate_excel(payloads: list[dict], output_path: str):
    wb = Workbook()
    build_resumo(wb, payloads)
    build_nao_conformidades(wb, payloads)
    for p in payloads:
        build_auditoria(wb, p)
    wb.save(output_path)
    print(f"[ExportExcel] Planilha salva em: {output_path}")


def load_payloads_from_output(output_dir: str) -> list[dict]:
    files = sorted(glob.glob(os.path.join(output_dir, "audit_*.json")))
    payloads = []
    for f in files:
        with open(f, encoding="utf-8") as fp:
            payloads.append(json.load(fp))
    print(f"[ExportExcel] {len(payloads)} payload(s) carregado(s) de {output_dir}")
    return payloads


if __name__ == "__main__":
    import sys
    output_dir = os.path.join(os.path.dirname(__file__), "..", "output")
    payloads = load_payloads_from_output(output_dir)

    if not payloads:
        print("[ExportExcel] Nenhum payload encontrado em output/. Rode main.py primeiro.")
        sys.exit(1)

    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%S")
    out_path = os.path.join(output_dir, f"painel_auditorias_{timestamp}.xlsx")
    generate_excel(payloads, out_path)
