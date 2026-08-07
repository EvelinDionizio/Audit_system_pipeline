"""
polling_service.py — Busca avaliação por ID e estrutura o payload.

Reutiliza enrichment_service.extract_audit_payload() já existente,
mantendo consistência com o pipeline do main.py.
"""
import sys
import os
from pathlib import Path

# Garante que src/ está no path independente de onde é chamado
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.client import get
from services.enrichment_service import extract_audit_payload


def fetch_and_structure(evaluation_id: int) -> dict:
    """
    Busca os detalhes de uma avaliação pelo ID e retorna o payload
    estruturado no mesmo formato usado pelo main.py.

    Funciona com status=2 (Em Andamento) e status=3 (Em Análise).
    Lança ValueError com mensagem amigável em caso de erro.
    """
    try:
        raw = get(
            f"v2/evaluations/{evaluation_id}",
            use_integration=True
        )
    except RuntimeError as e:
        msg = str(e)
        if "401" in msg:
            raise ValueError("Token inválido ou expirado. Verifique o .env.")
        if "403" in msg:
            raise ValueError("Sem permissão para acessar esta avaliação.")
        if "404" in msg or "data" in msg:
            raise ValueError(f"Avaliação #{evaluation_id} não encontrada.")
        raise ValueError(f"Erro ao buscar avaliação: {msg}")

    # raw pode vir como {"data": {...}} ou direto como {...}
    if isinstance(raw.get("data"), dict):
        raw = raw["data"]

    payload = extract_audit_payload(raw)

    if not payload:
        raise ValueError(f"Avaliação #{evaluation_id} retornou dados vazios.")

    itens = payload.get("itens", [])
    if not itens:
        raise ValueError(
            f"Avaliação #{evaluation_id} não possui itens respondidos ainda. "
            "Responda pelo menos um item no app antes de solicitar revisão."
        )

    return payload