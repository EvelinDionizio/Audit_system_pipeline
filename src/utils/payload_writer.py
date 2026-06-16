import json
import os
from datetime import datetime, timezone

# Caminho correto: raiz do projeto / output
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "output")


def save_payloads(payloads: list[dict]) -> list[str]:
    """
    Persiste cada payload estruturado em um arquivo JSON individual.
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    paths = []

    for payload in payloads:
        audit_id = payload.get("cabecalho", {}).get("id", "unknown")
        # Formato seguro para nome de arquivo no Windows (sem / : espaços)
        timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%S")
        filename = f"audit_{audit_id}_{timestamp}.json"
        filepath = os.path.normpath(os.path.join(OUTPUT_DIR, filename))

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        print(f"[PayloadWriter] Salvo: {filepath}")
        paths.append(filepath)

    return paths