"""
index_norms.py — Script de indexação de PDFs normativos no ChromaDB.

Uso:
    # Indexar um PDF específico
    python src/index_norms.py data/norms/NR-01.pdf

    # Indexar todos os PDFs de um diretório
    python src/index_norms.py data/norms/

    # Ver estatísticas do banco vetorial
    python src/index_norms.py --stats

    # Remover e re-indexar uma fonte
    python src/index_norms.py --delete NR-01.pdf data/norms/NR-01.pdf
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from pathlib import Path
from utils.pdf_extractor import extract_chunks_from_pdf, extract_chunks_from_directory
from services.rag_service import index_documents, get_collection_stats, delete_source


def print_stats():
    stats = get_collection_stats()
    print("\n" + "=" * 55)
    print("  ESTATÍSTICAS DO BANCO VETORIAL")
    print("=" * 55)
    print(f"  Collection     : {stats['collection']}")
    print(f"  Diretório      : {stats['persist_dir']}")
    print(f"  Total de chunks: {stats['total_chunks']}")
    print(f"  Fontes indexadas ({len(stats['fontes_indexadas'])}):")
    for fonte in stats["fontes_indexadas"]:
        print(f"    • {fonte}")
    print("=" * 55)


def main():
    args = sys.argv[1:]

    if not args or args[0] == "--stats":
        print_stats()
        return

    # --delete <source_name> <pdf_path>
    if args[0] == "--delete" and len(args) >= 2:
        source_name = args[1]
        deleted = delete_source(source_name)
        print(f"  {deleted} chunk(s) removidos para '{source_name}'.")
        if len(args) >= 3:
            args = args[2:]  # continua para indexar
        else:
            return

    target = Path(args[0])

    print("=" * 55)
    print("  INDEXAÇÃO DE NORMAS REGULAMENTADORAS")
    print("=" * 55)

    if target.is_dir():
        print(f"\n  Diretório: {target.resolve()}")
        chunks = extract_chunks_from_directory(target)
    elif target.is_file() and target.suffix.lower() == ".pdf":
        print(f"\n  Arquivo: {target.resolve()}")
        chunks = extract_chunks_from_pdf(target)
    else:
        print(f"  ERRO: '{target}' não é um PDF nem diretório válido.")
        sys.exit(1)

    if not chunks:
        print("  Nenhum chunk extraído. Verifique o PDF.")
        sys.exit(1)

    print(f"\n  Chunks extraídos: {len(chunks)}")
    print("  Iniciando indexação no ChromaDB...\n")

    inserted = index_documents(chunks)

    print("\n" + "=" * 55)
    print("  RESULTADO")
    print("=" * 55)
    print(f"  Chunks novos inseridos: {inserted}")
    print_stats()


if __name__ == "__main__":
    main()