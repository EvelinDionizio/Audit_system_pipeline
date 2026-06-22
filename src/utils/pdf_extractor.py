"""
pdf_extractor.py — Extração e chunking de PDFs normativos para RAG.

Estratégia:
- Extração via pdfplumber (melhor para PDFs de texto denso)
- Chunking por tokens (~500) com overlap (~50) preservando contexto
- Fallback para pypdf se pdfplumber falhar
- Metadados de origem em cada chunk (arquivo, página, posição)
"""

import re
from pathlib import Path
from typing import Generator

import pdfplumber
from pypdf import PdfReader


# ── Configurações de chunking ──────────────────────────────────────────────────

CHUNK_SIZE_TOKENS = 500   # tamanho alvo em tokens (aprox. 4 chars/token)
CHUNK_OVERLAP_TOKENS = 50  # overlap entre chunks consecutivos
CHARS_PER_TOKEN = 4        # estimativa para português técnico


def _tokens_to_chars(tokens: int) -> int:
    return tokens * CHARS_PER_TOKEN


CHUNK_SIZE_CHARS = _tokens_to_chars(CHUNK_SIZE_TOKENS)
OVERLAP_CHARS = _tokens_to_chars(CHUNK_OVERLAP_TOKENS)


# ── Extração de texto ──────────────────────────────────────────────────────────

def _extract_pages_pdfplumber(pdf_path: Path) -> list[tuple[int, str]]:
    """Retorna lista de (numero_pagina, texto) usando pdfplumber."""
    pages = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            text = _clean_text(text)
            if text.strip():
                pages.append((i, text))
    return pages


def _extract_pages_pypdf(pdf_path: Path) -> list[tuple[int, str]]:
    """Fallback: extração via pypdf."""
    pages = []
    reader = PdfReader(str(pdf_path))
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        text = _clean_text(text)
        if text.strip():
            pages.append((i, text))
    return pages


def _clean_text(text: str) -> str:
    """Remove artefatos comuns de PDFs normativos (cabeçalhos repetidos, hifenizações)."""
    # junta palavras hifenizadas ao final de linha
    text = re.sub(r"-\n(\w)", r"\1", text)
    # colapsa múltiplas quebras de linha
    text = re.sub(r"\n{3,}", "\n\n", text)
    # remove espaços excessivos
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


def extract_text_by_page(pdf_path: Path) -> list[tuple[int, str]]:
    """
    Extrai texto página a página.
    Retorna [(num_pagina, texto), ...].
    """
    try:
        pages = _extract_pages_pdfplumber(pdf_path)
        if not pages:
            raise ValueError("pdfplumber retornou vazio — tentando pypdf")
        print(f"[PDFExtractor] {pdf_path.name}: {len(pages)} página(s) extraída(s) via pdfplumber.")
        return pages
    except Exception as e:
        print(f"[PDFExtractor] pdfplumber falhou ({e}), usando pypdf como fallback.")
        pages = _extract_pages_pypdf(pdf_path)
        print(f"[PDFExtractor] {pdf_path.name}: {len(pages)} página(s) via pypdf.")
        return pages


# ── Chunking ───────────────────────────────────────────────────────────────────

def _split_into_chunks(text: str, source_name: str, start_page: int) -> Generator[dict, None, None]:
    """
    Divide texto em chunks de ~500 tokens com overlap de ~50 tokens.
    Tenta respeitar parágrafos (quebra em '\n\n') antes de cortar no tamanho fixo.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    buffer = ""
    chunk_index = 0

    for para in paragraphs:
        # Se o parágrafo sozinho excede o limite, quebra por frases
        if len(para) > CHUNK_SIZE_CHARS:
            sub_parts = _split_long_paragraph(para)
        else:
            sub_parts = [para]

        for part in sub_parts:
            if len(buffer) + len(part) + 2 > CHUNK_SIZE_CHARS and buffer:
                yield _make_chunk(buffer.strip(), source_name, start_page, chunk_index)
                chunk_index += 1
                # overlap: mantém os últimos OVERLAP_CHARS do buffer
                buffer = buffer[-OVERLAP_CHARS:] + "\n\n" + part
            else:
                buffer = (buffer + "\n\n" + part).strip() if buffer else part

    if buffer.strip():
        yield _make_chunk(buffer.strip(), source_name, start_page, chunk_index)


def _split_long_paragraph(text: str) -> list[str]:
    """Divide parágrafo longo em frases respeitando pontuação."""
    sentences = re.split(r'(?<=[.;:])\s+', text)
    parts = []
    current = ""
    for sent in sentences:
        if len(current) + len(sent) > CHUNK_SIZE_CHARS and current:
            parts.append(current.strip())
            current = sent
        else:
            current = (current + " " + sent).strip() if current else sent
    if current:
        parts.append(current.strip())
    return parts


def _make_chunk(text: str, source: str, page: int, index: int) -> dict:
    return {
        "text": text,
        "metadata": {
            "source": source,
            "page": page,
            "chunk_index": index,
        },
    }


# ── Interface principal ────────────────────────────────────────────────────────

def extract_chunks_from_pdf(pdf_path: str | Path) -> list[dict]:
    """
    Pipeline completo: PDF → extração → chunks.

    Retorna lista de dicts:
        {
            "text": "...",
            "metadata": {"source": "NR-01.pdf", "page": 3, "chunk_index": 2}
        }
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF não encontrado: {pdf_path}")

    source_name = pdf_path.name
    pages = extract_text_by_page(pdf_path)

    all_chunks = []
    for page_num, page_text in pages:
        chunks = list(_split_into_chunks(page_text, source_name, page_num))
        all_chunks.extend(chunks)

    print(f"[PDFExtractor] {source_name}: {len(all_chunks)} chunk(s) gerado(s).")
    return all_chunks


def extract_chunks_from_directory(directory: str | Path, glob: str = "*.pdf") -> list[dict]:
    """
    Processa todos os PDFs de um diretório.
    Útil para indexação em batch de múltiplas NRs.
    """
    directory = Path(directory)
    pdf_files = sorted(directory.glob(glob))
    if not pdf_files:
        print(f"[PDFExtractor] Nenhum PDF encontrado em {directory}.")
        return []

    all_chunks = []
    for pdf_file in pdf_files:
        print(f"\n[PDFExtractor] Processando: {pdf_file.name}")
        try:
            chunks = extract_chunks_from_pdf(pdf_file)
            all_chunks.extend(chunks)
        except Exception as e:
            print(f"[PDFExtractor] ERRO em {pdf_file.name}: {e}")

    print(f"\n[PDFExtractor] Total geral: {len(all_chunks)} chunk(s) de {len(pdf_files)} PDF(s).")
    return all_chunks
