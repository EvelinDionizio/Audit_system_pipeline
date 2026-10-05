"""
indexar_normas.py — Indexa PDFs normativos na tabela public.normas_chunks (Supabase).

Substitui src/index_norms.py + ChromaDB. A extração e o chunking são os mesmos de
src/utils/pdf_extractor.py (pdfplumber com fallback pypdf, ~500 tokens, overlap ~50).
Não há embeddings: o Postgres gera o tsvector em português automaticamente.

Roda LOCALMENTE (fora do Lovable), uma vez ou sempre que as normas mudarem.

Variáveis de ambiente (arquivo .env local, NUNCA commitado):
    SUPABASE_URL=https://<projeto>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=<service role key>

Uso:
    python scripts/indexar_normas.py ../norms/               # indexa um diretório
    python scripts/indexar_normas.py ../norms/nr-06.pdf      # indexa um PDF
    python scripts/indexar_normas.py --stats                 # estatísticas
    python scripts/indexar_normas.py --delete nr-06.pdf [caminho.pdf]   # remove (e reindexa)
"""
import hashlib
import os
import re
import sys
from pathlib import Path

import pdfplumber
import requests
from dotenv import load_dotenv
from pypdf import PdfReader

load_dotenv()

CHUNK_SIZE_CHARS = 500 * 4
OVERLAP_CHARS = 50 * 4
LOTE = 200


# ── Extração (idêntica a src/utils/pdf_extractor.py) ─────────────────────────

def _clean_text(text: str) -> str:
    text = re.sub(r"-\n(\w)", r"\1", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


def _paginas(pdf_path: Path) -> list[tuple[int, str]]:
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            pages = [(i, _clean_text(p.extract_text() or "")) for i, p in enumerate(pdf.pages, start=1)]
        pages = [(i, t) for i, t in pages if t.strip()]
        if not pages:
            raise ValueError("pdfplumber retornou vazio")
        return pages
    except Exception as e:
        print(f"  pdfplumber falhou ({e}), usando pypdf.")
        reader = PdfReader(str(pdf_path))
        pages = [(i, _clean_text(p.extract_text() or "")) for i, p in enumerate(reader.pages, start=1)]
        return [(i, t) for i, t in pages if t.strip()]


def _split_long_paragraph(text: str) -> list[str]:
    parts, current = [], ""
    for sent in re.split(r"(?<=[.;:])\s+", text):
        if len(current) + len(sent) > CHUNK_SIZE_CHARS and current:
            parts.append(current.strip())
            current = sent
        else:
            current = (current + " " + sent).strip() if current else sent
    if current:
        parts.append(current.strip())
    return parts


def _chunks_da_pagina(text: str, fonte: str, pagina: int):
    buffer, idx = "", 0
    for para in [p.strip() for p in text.split("\n\n") if p.strip()]:
        for part in (_split_long_paragraph(para) if len(para) > CHUNK_SIZE_CHARS else [para]):
            if len(buffer) + len(part) + 2 > CHUNK_SIZE_CHARS and buffer:
                yield _chunk(buffer.strip(), fonte, pagina, idx)
                idx += 1
                buffer = buffer[-OVERLAP_CHARS:] + "\n\n" + part
            else:
                buffer = (buffer + "\n\n" + part).strip() if buffer else part
    if buffer.strip():
        yield _chunk(buffer.strip(), fonte, pagina, idx)


def _chunk(texto: str, fonte: str, pagina: int, idx: int) -> dict:
    # Mesmo ID do rag_service._make_chunk_id() — permite deduplicação
    chunk_id = hashlib.md5(f"{fonte}::{pagina}::{idx}".encode()).hexdigest()
    # Postgres não aceita \x00 em text
    return {"id": chunk_id, "fonte": fonte, "pagina": pagina, "chunk_index": idx, "texto": texto.replace("\x00", "")}


def extrair(pdf_path: Path) -> list[dict]:
    chunks = []
    for pagina, texto in _paginas(pdf_path):
        chunks.extend(_chunks_da_pagina(texto, pdf_path.name, pagina))
    print(f"  {pdf_path.name}: {len(chunks)} chunk(s)")
    return chunks


# ── Supabase REST ────────────────────────────────────────────────────────────

def _rest() -> tuple[str, dict]:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env local.")
    return f"{url.rstrip('/')}/rest/v1/normas_chunks", {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def enviar(chunks: list[dict]) -> None:
    endpoint, headers = _rest()
    headers = {**headers, "Prefer": "resolution=ignore-duplicates,return=minimal"}
    for i in range(0, len(chunks), LOTE):
        lote = chunks[i:i + LOTE]
        r = requests.post(f"{endpoint}?on_conflict=id", json=lote, headers=headers, timeout=120)
        r.raise_for_status()
        print(f"  +{len(lote)} enviados ({i + len(lote)}/{len(chunks)})")


def estatisticas() -> None:
    endpoint, headers = _rest()
    fontes, offset = {}, 0
    while True:
        r = requests.get(endpoint, params={"select": "fonte", "offset": offset, "limit": 1000}, headers=headers, timeout=60)
        r.raise_for_status()
        linhas = r.json()
        for l in linhas:
            fontes[l["fonte"]] = fontes.get(l["fonte"], 0) + 1
        if len(linhas) < 1000:
            break
        offset += 1000
    print("=" * 55)
    print(f"  Total de chunks: {sum(fontes.values())}")
    print(f"  Fontes indexadas ({len(fontes)}):")
    for f in sorted(fontes):
        print(f"    • {f} ({fontes[f]})")
    print("=" * 55)


def remover(fonte: str) -> None:
    endpoint, headers = _rest()
    r = requests.delete(endpoint, params={"fonte": f"eq.{fonte}"}, headers={**headers, "Prefer": "return=representation"}, timeout=60)
    r.raise_for_status()
    print(f"  {len(r.json())} chunk(s) removidos de '{fonte}'.")


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] == "--stats":
        estatisticas()
        return
    if args[0] == "--delete" and len(args) >= 2:
        remover(args[1])
        args = args[2:]
        if not args:
            return

    alvo = Path(args[0])
    if alvo.is_dir():
        pdfs = sorted(alvo.glob("*.pdf"))
    elif alvo.is_file() and alvo.suffix.lower() == ".pdf":
        pdfs = [alvo]
    else:
        sys.exit(f"ERRO: '{alvo}' não é um PDF nem diretório válido.")

    chunks = []
    for pdf in pdfs:
        try:
            chunks.extend(extrair(pdf))
        except Exception as e:
            print(f"  ERRO em {pdf.name}: {e}")
    if not chunks:
        sys.exit("Nenhum chunk extraído.")
    print(f"\n  Enviando {len(chunks)} chunk(s) (duplicados são ignorados)...")
    enviar(chunks)
    estatisticas()


if __name__ == "__main__":
    main()
