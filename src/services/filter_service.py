from datetime import datetime, timezone, timedelta


def _parse_date(date_str: str) -> datetime | None:
    """Tenta converter uma string ISO 8601 para datetime com timezone UTC."""
    if not date_str:
        return None

    # Remove sufixo 'Z' e garante timezone UTC
    date_str = date_str.replace("Z", "+00:00")

    try:
        return datetime.fromisoformat(date_str)
    except ValueError:
        # Fallback para formatos sem timezone
        try:
            dt = datetime.strptime(date_str[:19], "%Y-%m-%dT%H:%M:%S")
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def filter_recent_audits(audits: list[dict], days: int = 7) -> list[dict]:
    """
    Filtra auditorias criadas dentro dos últimos N dias.

    Args:
        audits: Lista de auditorias retornadas pela API.
        days:   Janela de tempo em dias (padrão: 7).

    Returns:
        Lista de auditorias dentro do período especificado.
    """
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    recent = []

    for audit in audits:
        created_at = audit.get("updatedAt") or audit.get("createdAt") or audit.get("created_at")
        parsed_date = _parse_date(created_at)

        if parsed_date is None:
            print(f"[FilterService] Auditoria id={audit.get('id')} sem data válida — ignorada.")
            continue

        if parsed_date >= cutoff:
            recent.append(audit)

    print(f"[FilterService] {len(recent)} auditoria(s) nos últimos {days} dia(s).")
    return recent
