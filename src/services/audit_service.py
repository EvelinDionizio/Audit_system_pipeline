from api.client import get


# Endpoint de avaliações — conforme documentação oficial Checklist Fácil
EVALUATIONS_ENDPOINT = "v1/evaluations"

# Status numéricos conforme documentação:
# 1=Não Iniciado | 2=Em Andamento | 3=Em Análise | 4=Reprovado | 5=Reaberto | 6=Concluído
STATUS_EM_ANALISE = 3


def get_audits(status: int = STATUS_EM_ANALISE, limit: int = 100, page: int = 1) -> list[dict]:
    """
        Busca auditorias na API do Checklist Fácil.

        Args:
            status: Status numérico da avaliação (3 = Em Análise).
            limit:  Número máximo de registros por página (máx. 100).
            page:   Página a ser consultada.

        Returns:
            Lista de dicionários representando cada auditoria.
        """
    params = {
        "status": status,
        "limit": limit,
        "page": page,
    }

    data = get(EVALUATIONS_ENDPOINT, params=params)

    # A API retorna envelope { "data": [...] }
    if isinstance(data, dict):
        audits = data.get("data") or data.get("evaluations") or data.get("items") or []
    elif isinstance(data, list):
        audits = data
    else:
        audits = []

    print(f"[AuditService] {len(audits)} auditoria(s) recebida(s) da API.")
    return audits