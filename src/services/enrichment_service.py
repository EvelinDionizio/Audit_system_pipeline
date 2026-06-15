from api.client import get

EVALUATION_DETAIL_ENDPOINT = "v2/evaluations/{evaluation_id}"

# Codigos de resposta de item conforme documentação Checklist Fácil
SCORES_NAO_CONFORME = {4}  #NÃO ATINGIU
SCORES_PARCIAL = {2}       #ATINGIU PARCIALMENTE
SCORES_CONFORME = {1, 3}   #NÃO ATINGIU (ESCCALA 2)/ ATINGIU
SCORES_NAO_APLICAVEL = {6} #NÃO SE APLICA

def get_audit_detail(evaluation_id: int) -> dict | None:
    """
    Busca o detalhe completo de uma avaliação pelo ID.

    Args:
        evaluation_id: ID numérico da avaliação.

    Returns:
        Dicionário com dados completos da avaliação, ou None se não encontrado.
        """
    endpoint = EVALUATION_DETAIL_ENDPOINT.format(evaluation_id=evaluation_id)
    data = get(endpoint)

    if not data or data == {"data": []}:
        print(f"[EnrichmentService] Avaliação {evaluation_id} não encontrado")
        return None

    # a API pode retornar {"data": {...}} ou o objeto diretamente
    return data.get("data") if isinstance(data.get("data"), dict) else data

def extract_audit_playload(raw:dict) -> dict:
    """
    Transforma o retorno bruto da API em um JSON estruturado limpo, pronto para se consumido pelo pipeline de IA.

    mantém apenas os campos relevantes para a revisão, remove campos de controle interno, timestamps e metadados de UI.

    Args:
        raw: Dicionário bruto retornado por get_audit_detail().

    Returns:
        JSON estruturado
    """

    if not raw:
        return {}

    cabecalho = _extract_header(raw)
    itens = _extract_items(raw)

    payload = {
        "cabecalho": cabecalho,
        "itens": itens,
        "resumo": _build_summary(itens)
    }

    return payload

def _extract_header(raw:dict) -> dict:
    """extrai os campos de cabeçalho relevantes da auditoria"""
    return {
        "id": raw.get("id"),
        "checklist_none": raw.get("checklist", {}).get("name") or   raw.get("checklistName"),
        "unidade_nome": raw.get("unit", {}).get("name") or raw.get("unitName"),
        "auditor_nome": raw.get("user", {}).get("name") or raw.get("userName"),
        "status": raw.get("status"),
        "pontuacao_total": raw.get("score") or raw.get("totalScore"),
        "pontuacao_maxima": raw.get("maxScore") or raw.get("totalMaxScore"),
        "data_conclusao": raw.get("finishedAt") or raw.get("updatedAt"),
        "data_criacao": raw.get("createdAt"),
        }

def _extract_items(raw:dict) -> list[dict]:
    """
    Extrai e estrutura os itens da auditoria.
    mantém apenas campos relevantes para a análise técnica.
    ignora itens sem comentários (não aplicáveis ao escopo),  -> posível adesão futura
    """
    # a API pode retornar os itens em campos diferentes dependendo da versão
    raw_items = (
        raw.get("items")
        or raw.get("categories", [{}])[0].get("items", [])
        or []
    )

    itens_estruturados = []

    for item in raw_items:
        comentario = (
            item.get("comment")
            or item.get("observation")
            or item.get("comments")
            or ""
        ).strip()

        if not comentario:
            continue

        itens_estruturados.append({
            "id": item.get("id"),
            "pergunta": item.get("name") or item.get("label") or item.get("question"),
            "resposta_codigo": item.get("answer") or item.get("score") or item.get("answerCode"),
            "comentario": comentario,
            "nao_conforme": _is_nao_conforme(item),
            "parcial": _is_parcial(item),
        })

    return itens_estruturados


def _is_nao_conforme(item:dict) -> bool:
    """verifica se o item está marcado como não conforme."""
    score = item.get("answer") or item.get("score") or item.get("answerCode")
    return score in SCORES_NAO_CONFORME

def _is_parcial(item:dict) -> bool:
    """Verifica se o item está marcado como parcialmente conforme."""
    score = item.get("answer") or item.get("score") or item.get("answerCode")
    return score in SCORES_PARCIAL


def _build_summary(itens: list[dict]) -> dict:
    """Gera um resumo quantitativodos itens para apoio à triagem RAG"""
    total = len(itens)
    nao_conformes = sum(1 for i in itens if i["nao_conforme"])
    parciais = sum(1 for i in itens if i["parcial"])

    return {
        "total_itens_com_comentario": total,
        "total_nao_conformes": nao_conformes,
        "total_parciais": parciais,
        "requer_rag": nao_conformes > 0 or parciais > 0,
    }

def enrich_audits(audits:list[dict]) -> dict:
    """itera sobre a lista de auditorias filtradas, busca o detalhe de cada uma e retorna a lista
    de payloads estruturados prontos para o pipeline de IA.

    Args:
        audits: Lista de auditorias da camada 1 (get_aaudits + filter)

    Returns:
        lista de payloads estruturados. auditorias sem detalhe são ignoradas.
    """

    payloads = []

    for audit in audits:
        evaluation_id = audit.get("id")
        if not evaluation_id:
            continue

        print(f"[EnrichmentService] Enriquecendo avaliação id={evaluation_id}...")
        raw = get_audit_detail(evaluation_id)

        if raw:
            payload = extract_audit_playload(raw)
            payloads.append(payload)
    print(f"[enrichmentService] {len(payloads)} payload(s) estruturado(s).")
    return payloads



