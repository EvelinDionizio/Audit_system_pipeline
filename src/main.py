import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from services.audit_service import get_audits
from services.filter_service import filter_recent_audits
from services.enrichment_service import enrich_audits
from utils.payload_writer import save_payloads


def main():
    print("=" * 55)
    print("  SISTEMA DE AUDITORIA — COLETA E ENRIQUECIMENTO")
    print("=" * 55)

    # --- CAMADA 1: Coleta e filtragem ---
    print("\n[Camada 1] Buscando auditorias pendentes...")
    audits = get_audits(limit=100)
    recent_audits = filter_recent_audits(audits, days=90)

    print(f"\n  Total recebido da API : {len(audits)}")
    print(f"  Total após filtro     : {len(recent_audits)}")

    if not recent_audits:
        print("\n  Nenhuma auditoria encontrada. Encerrando.")
        print("=" * 55)
        return

    # --- CAMADA 2: Enriquecimento e estruturação ---
    print("\n[Camada 2] Enriquecendo auditorias com detalhes...")
    payloads = enrich_audits(recent_audits)

    paths = save_payloads(payloads)

    print("\n" + "=" * 55)
    print("  RESUMO FINAL")
    print("=" * 55)
    print(f"  Auditorias processadas : {len(payloads)}")

    for payload in payloads:
        cab = payload.get("cabecalho", {})
        resumo = payload.get("resumo", {})
        print(f"\n  ID {cab.get('id')} — {cab.get('checklist_nome', 'N/A')}")
        print(f"    Unidade        : {cab.get('unidade_nome', 'N/A')}")
        print(f"    Auditor        : {cab.get('auditor_nome', 'N/A')}")
        print(f"    Itens c/ coment: {resumo.get('total_itens_com_comentario', 0)}")
        print(f"    Nao conformes  : {resumo.get('total_nao_conformes', 0)}")
        print(f"    Parciais       : {resumo.get('total_parciais', 0)}")
        print(f"    Requer RAG     : {'SIM' if resumo.get('requer_rag') else 'NAO'}")

    print(f"\n  Arquivos JSON salvos em: output/")
    print("=" * 55)
    return payloads


if __name__ == "__main__":
    main()