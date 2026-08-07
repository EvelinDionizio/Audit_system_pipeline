import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from services.audit_service import get_audits
from services.filter_service import filter_recent_audits
from services.enrichment_service import enrich_audits
from services.rag_service import query_items_batch, get_collection_stats
from services.parecer_service import gerar_pareceres_auditoria
from utils.payload_writer import save_payloads


def main():
    print("=" * 55)
    print("  SISTEMA DE AUDITORIA — PIPELINE COMPLETO")
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

    # --- CAMADA 3: RAG — contexto normativo ---
    stats = get_collection_stats()
    if stats["total_chunks"] == 0:
        print("\n[Camada 3] AVISO: banco vetorial vazio.")
        print("  Execute: python src/index_norms.py norms/")
    else:
        print(f"\n[Camada 3] Consultando banco vetorial ({stats['total_chunks']} chunks)...")
        for payload in payloads:
            itens_enriquecidos = query_items_batch(payload.get("itens", []))
            payload["itens"] = itens_enriquecidos
            total_com_rag = sum(1 for i in itens_enriquecidos if i.get("contexto_rag"))
            payload["resumo"]["total_com_contexto_rag"] = total_com_rag
        print(f"  RAG aplicado em {len(payloads)} auditoria(s).")

    # --- CAMADA 4: Geração de pareceres técnicos ---
    print("\n[Camada 4] Gerando pareceres técnicos...")
    for i, payload in enumerate(payloads):
        payloads[i] = gerar_pareceres_auditoria(payload)

    # --- Salva payloads completos ---
    paths = save_payloads(payloads)

    # --- Resumo final ---
    print("\n" + "=" * 55)
    print("  RESUMO FINAL")
    print("=" * 55)
    print(f"  Auditorias processadas : {len(payloads)}")

    for payload in payloads:
        cab    = payload.get("cabecalho", {})
        resumo = payload.get("resumo", {})
        print(f"\n  ID {cab.get('id')} — {cab.get('checklist_nome', 'N/A')}")
        print(f"    Unidade          : {cab.get('unidade_nome', 'N/A')}")
        print(f"    Auditor          : {cab.get('auditor_nome', 'N/A')}")
        print(f"    Itens relevantes : {resumo.get('total_itens_relevantes', 0)}")
        print(f"    Nao conformes    : {resumo.get('total_nao_conformes', 0)}")
        print(f"    Parciais         : {resumo.get('total_parciais', 0)}")
        print(f"    Com contexto RAG : {resumo.get('total_com_contexto_rag', 0)}")
        print(f"    Com parecer      : {resumo.get('total_com_parecer', 0)}")

    print(f"\n  Arquivos JSON salvos em: output/")
    print("=" * 55)
    return payloads


if __name__ == "__main__":
    main()