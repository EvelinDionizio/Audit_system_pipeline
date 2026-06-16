from api.client import get

EVALUATION_DETAIL_ENDPOINT = "v2/evaluations/{evaluation_id}"

# Códigos de resposta conforme documentação Checklist Fácil
SCORES_NAO_CONFORME = {1, 4}   # Não atingiu (escala 2 e 4 carinhas)
SCORES_PARCIAL = {2}            # Atingiu parcialmente
SCORES_NAO_APLICAVEL = {6}      # Não se aplica


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
    itens = _extract_all_items(raw)

    return {
        "cabecalho": cabecalho,
        "itens": itens,
        "resumo": _build_summary(itens),
    }


def _extract_header(raw: dict) -> dict:
    """
    A API de Integração v2 retorna checklist, unit e user como objetos
    com id e name diretamente — não é necessário buscar por ID separado.
    """
    return {
        "id": raw.get("id"),
        "checklist_nome": (raw.get("checklist") or {}).get("name"),
        "unidade_nome": (raw.get("unit") or {}).get("name"),
        "auditor_nome": (raw.get("user") or {}).get("name"),
        "departamento": [(d.get("name")) for d in raw.get("departments", [])],
        "status": raw.get("status"),
        "pontuacao_total": raw.get("score"),
        "plataforma": raw.get("platform"),
        "data_inicio": raw.get("startedAt"),
        "data_conclusao": raw.get("concludedAt"),
        "comentario_final": raw.get("finalComment") or "",
    }


def _extract_all_items(raw: dict) -> list[dict]:
    """
    Os itens estão agrupados em categories[].items.
    Itera todas as categorias e preserva o nome da categoria como contexto.
    Mantém itens com comment (avaliativo) OU answer.text (campo de texto livre).
    """
    itens_estruturados = []

    for category in raw.get("categories", []):
        categoria_nome = category.get("name", "")

        for item in category.get("items", []):
            answer = item.get("answer") or {}
            comentario = (item.get("comment") or "").strip()
            resposta_texto = (answer.get("text") or "").strip()

            # Manter apenas itens com algum conteúdo relevante
            if not comentario and not resposta_texto:
                continue

            score = answer.get("evaluative")
            nao_aplicavel = score in SCORES_NAO_APLICAVEL

            itens_estruturados.append({
                "id": item.get("id"),
                "categoria": categoria_nome,
                "pergunta": item.get("name"),
                "tipo_resposta": "texto" if score is None else "avaliativo",
                "resposta_codigo": score,
                "resposta_texto": resposta_texto or None,
                "comentario": comentario or None,
                "nao_conforme": score in SCORES_NAO_CONFORME,
                "parcial": score in SCORES_PARCIAL,
                "nao_aplicavel": nao_aplicavel,
                "total_anexos": len(item.get("attachments", [])),
            })

    return itens_estruturados


def _get_score(item: dict) -> int | None:
    answer = item.get("answer")
    if isinstance(answer, dict):
        return answer.get("evaluative")
    return None


def _build_summary(itens: list[dict]) -> dict:
    total = len(itens)
    nao_conformes = sum(1 for i in itens if i["nao_conforme"])
    parciais = sum(1 for i in itens if i["parcial"])
    nao_aplicaveis = sum(1 for i in itens if i["nao_aplicavel"])
    texto_livre = sum(1 for i in itens if i["tipo_resposta"] == "texto")

    return {
        "total_itens_relevantes": total,
        "total_nao_conformes": nao_conformes,
        "total_parciais": parciais,
        "total_nao_aplicaveis": nao_aplicaveis,
        "total_texto_livre": texto_livre,
        "requer_rag": nao_conformes > 0 or parciais > 0,
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
            payload = extract_audit_payload(raw)
            payloads.append(payload)

    print(f"[EnrichmentService] {len(payloads)} payload(s) estruturado(s).")
    return payloads