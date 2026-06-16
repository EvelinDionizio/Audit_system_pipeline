from datetime import datetime, timezone, timedelta


def _parse_date(date_str: str) -> datetime | None:
    if not date_str:
        return None
    date_str = date_str.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(date_str)
    except ValueError:
        try:
            dt = datetime.strptime(date_str[:19], "%Y-%m-%dT%H:%M:%S")
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def filter_recent_audits(audits: list[dict], days: int = 7) -> list[dict]:
    """
    Filtra auditorias iniciadas dentro dos últimos N dias.
    A API Analytics usa o campo startedAt como data de referência.
    """
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    recent = []

    for audit in audits:
        # API Analytics retorna startedAt como campo principal de data
        date_str = (
            audit.get("startedAt")
            or audit.get("updatedAt")
            or audit.get("createdAt")
        )
        parsed_date = _parse_date(date_str)

        if parsed_date is None:
            print(f"[FilterService] Auditoria id={audit.get('evaluationId')} sem data válida — ignorada.")
            continue

        if parsed_date >= cutoff:
            recent.append(audit)

    print(f"[FilterService] {len(recent)} auditoria(s) nos últimos {days} dia(s).")
    return recent