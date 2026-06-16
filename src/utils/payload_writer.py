import json
import os
from datetime import datetime, timezone


OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", ".." "output")


def save_payloads(payloads: list[dict]) -> list[str]:
    """ Persiste cada payload estruturado em um arquivo json individual.
    útil para inspecionar manualmente e depurar antes de acionar o LLM.

    Args:
        Lista de caminhos dos arquivos gerados.

    Returns:
        Lista de caminhos dos arquivos gerados.
    """

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    paths = []

    for payload in payloads:
        audit_id = payload.get("cabecalho, {}").get("id", "unknown")
        timestamp = datetime.now(tz=timezone.utc).strftime("%d/%m/%Y %H:%M:%S")
        filename = f"audit_{audit_id}_{timestamp}.json"
        filepath = os.path.join(OUTPUT_DIR, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(payloads, f, ensure_ascii=False, indent=2)

        print(f"[PayloadWriter] salvo: {filepath}")
        paths.append(filepath)

    return paths

