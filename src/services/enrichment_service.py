from api.client import get

EVALUATION_DETAIL_ENDPOINT = "v2/evaluations/{evaluation_id}"

# Códigos de resposta conforme documentação Checklist Fácil
SCORES_NAO_CONFORME  = {1, 4}   # Não atingiu
SCORES_PARCIAL       = {2}       # Atingiu parcialmente
SCORES_CONFORME      = {3, 5}    # Atingiu / Atingiu totalmente
SCORES_NAO_APLICAVEL = {6}       # Não se aplica

# Pesos por criticidade (extraída do nome do item)
PESO_MANDATORIO  = 3.0
PESO_IMPORTANTES = 2.0
PESO_DESEJAVEL   = 1.0

SCORE_LABELS = {
    1: "Não atingiu",
    2: "Atingiu parcialmente",
    3: "Atingiu",
    4: "Não atingiu",
    5: "Atingiu totalmente",
    6: "Não se aplica",
}

# Palavras que indicam não conformidade em respostas de texto livre
PALAVRAS_NAO_CONFORME = [
    "não conforme", "nao conforme", "nc", "reprovado",
    "não atende", "nao atende", "não possui", "nao possui",
    "ausente", "inexistente", "irregular", "pendente",
]

# Palavras que indicam conformidade parcial em respostas de texto livre
PALAVRAS_PARCIAL = [
    "parcial", "parciallment", "incompleto", "em parte",
    "parcialmente", "insuficiente", "em andamento",
]

# Palavras que indicam conformidade em respostas de texto livre
PALAVRAS_CONFORME = [
    "conforme", "ok", "sim", "atende", "possui", "regular",
    "adequado", "existe", "apresentado", "formalizado",
]


def _detectar_conformidade_texto(texto: str) -> tuple[bool, bool, bool]:
    """
    Detecta não conformidade, parcialidade e conformidade a partir de texto livre.
    Retorna (nao_conforme, parcial, conforme).
    """
    t = texto.lower().strip()
    if not t:
        return False, False, False

    nao_conforme = any(p in t for p in PALAVRAS_NAO_CONFORME)
    parcial      = any(p in t for p in PALAVRAS_PARCIAL) and not nao_conforme
    conforme     = any(p in t for p in PALAVRAS_CONFORME) and not nao_conforme and not parcial

    return nao_conforme, parcial, conforme


def get_audit_detail(evaluation_id: int) -> dict | None:
    endpoint = EVALUATION_DETAIL_ENDPOINT.format(evaluation_id=evaluation_id)
    data = get(endpoint, use_integration=True)
    if not data or data == {"data": []}:
        print(f"[EnrichmentService] Avaliação {evaluation_id} não encontrada.")
        return None
    return data.get("data") if isinstance(data.get("data"), dict) else data


def extract_audit_payload(raw: dict) -> dict:
    if not raw:
        return {}
    cabecalho = _extract_header(raw)
    itens     = _extract_all_items(raw)
    resumo    = _build_summary(itens)
    return {"cabecalho": cabecalho, "itens": itens, "resumo": resumo}


def _criticidade(pergunta: str) -> str:
    if "(Mandatório)" in pergunta:
        return "Mandatório"
    if "(Importantes)" in pergunta:
        return "Importantes"
    if "(Desejáveis)" in pergunta:
        return "Desejáveis"
    return "Desejáveis"


def _peso(pergunta: str) -> float:
    c = _criticidade(pergunta)
    return PESO_MANDATORIO if c == "Mandatório" else PESO_IMPORTANTES if c == "Importantes" else PESO_DESEJAVEL


def _extract_header(raw: dict) -> dict:
    return {
        "id":              raw.get("id"),
        "checklist_nome":  (raw.get("checklist") or {}).get("name"),
        "unidade_nome":    (raw.get("unit") or {}).get("name"),
        "auditor_nome":    (raw.get("user") or {}).get("name"),
        "departamento":    [d.get("name") for d in raw.get("departments", [])],
        "status":          raw.get("status"),
        "pontuacao_total": raw.get("score"),
        "plataforma":      raw.get("platform"),
        "data_inicio":     raw.get("startedAt"),
        "data_conclusao":  raw.get("concludedAt"),
        "comentario_final": raw.get("finalComment") or "",
    }


def _extract_all_items(raw: dict) -> list[dict]:
    itens = []
    for category in raw.get("categories", []):
        cat_nome = category.get("name", "")
        for item in category.get("items", []):
            answer     = item.get("answer") or {}
            comentario = (item.get("comment") or "").strip()
            resp_texto = (answer.get("text") or "").strip()
            score      = answer.get("evaluative")

            # Inclui itens com score avaliativo OU texto
            if score is None and not comentario and not resp_texto:
                continue

            nao_aplicavel = score in SCORES_NAO_APLICAVEL
            pergunta      = item.get("name", "")
            resp_label    = SCORE_LABELS.get(score) if score is not None else None

            # Conformidade por score avaliativo (carinhas)
            nc_score  = score in SCORES_NAO_CONFORME
            par_score = score in SCORES_PARCIAL
            ok_score  = score in SCORES_CONFORME

            # Conformidade por texto livre (quando não há score)
            texto_analise = resp_texto or comentario or ""
            nc_texto, par_texto, ok_texto = (False, False, False)
            if score is None and texto_analise:
                nc_texto, par_texto, ok_texto = _detectar_conformidade_texto(texto_analise)

            nao_conforme = nc_score or nc_texto
            parcial      = par_score or par_texto
            conforme     = ok_score or ok_texto

            itens.append({
                "id":              item.get("id"),
                "categoria":       cat_nome,
                "pergunta":        pergunta,
                "criticidade":     _criticidade(pergunta),
                "peso":            _peso(pergunta),
                "tipo_resposta":   "texto" if score is None else "avaliativo",
                "resposta_codigo": score,
                "resposta_texto":  resp_texto or resp_label or None,
                "comentario":      comentario or None,
                "nao_conforme":    nao_conforme,
                "parcial":         parcial,
                "conforme":        conforme,
                "nao_aplicavel":   nao_aplicavel,
                "total_anexos":    len(item.get("attachments", [])),
            })
    return itens


def _build_summary(itens: list[dict]) -> dict:
    total          = len(itens)
    nao_conformes  = sum(1 for i in itens if i["nao_conforme"])
    parciais       = sum(1 for i in itens if i["parcial"])
    conformes      = sum(1 for i in itens if i["conforme"])
    nao_aplicaveis = sum(1 for i in itens if i["nao_aplicavel"])

    # Score ponderado — itens de texto livre também entram no cálculo
    avaliados = [i for i in itens if not i["nao_aplicavel"] and
                 (i["resposta_codigo"] is not None or i["nao_conforme"] or i["parcial"] or i["conforme"])]

    if avaliados:
        soma_pesos  = sum(i["peso"] for i in avaliados)
        soma_pontos = sum(
            i["peso"] * (1.0 if i["conforme"] else 0.5 if i["parcial"] else 0.0)
            for i in avaliados
        )
        percentual = round((soma_pontos / soma_pesos) * 100, 1) if soma_pesos > 0 else None
    else:
        percentual = None

    if percentual is None:
        nivel = "sem_dados"
    elif percentual >= 90:
        nivel = "excelente"
    elif percentual >= 75:
        nivel = "bom"
    elif percentual >= 60:
        nivel = "regular"
    else:
        nivel = "critico"

    return {
        "total_itens_relevantes":  total,
        "total_nao_conformes":     nao_conformes,
        "total_parciais":          parciais,
        "total_conformes":         conformes,
        "total_nao_aplicaveis":    nao_aplicaveis,
        "percentual_conformidade": percentual,
        "nivel_conformidade":      nivel,
        "requer_rag":              nao_conformes > 0 or parciais > 0,
    }


def enrich_audits(audits: list[dict]) -> list[dict]:
    payloads = []
    for audit in audits:
        evaluation_id = audit.get("evaluationId") or audit.get("id")
        if not evaluation_id:
            continue
        print(f"[EnrichmentService] Enriquecendo avaliação id={evaluation_id}...")
        raw = get_audit_detail(evaluation_id)
        if raw:
            payloads.append(extract_audit_payload(raw))
    print(f"[EnrichmentService] {len(payloads)} payload(s) estruturado(s).")
    return payloads