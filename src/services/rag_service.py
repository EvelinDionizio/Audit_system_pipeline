"""
rag_service.py — Indexação e consulta RAG para auditoria normativa.

Embeddings:
  - PRODUÇÃO (servidor com internet): Sentence Transformers
    → definir EMBEDDING_BACKEND=sentence_transformers no .env
  - DESENVOLVIMENTO / offline: TF-IDF + SVD (padrão, sem download)
    → definir EMBEDDING_BACKEND=tfidf (ou não definir)

Fluxo:
  1. index_documents()  → chunks → embedding → ChromaDB
  2. query_item()       → embedding do item → busca top-K → chunks relevantes

Configuração (.env):
  CHROMA_PERSIST_DIR   — diretório de persistência (default: data/chroma)
  CHROMA_COLLECTION    — nome da collection (default: normas_regulamentadoras)
  RAG_TOP_K            — chunks retornados por consulta (default: 3)
  EMBEDDING_BACKEND    — 'tfidf' | 'sentence_transformers' (default: tfidf)
  EMBEDDING_MODEL      — modelo ST (default: paraphrase-multilingual-mpnet-base-v2)
  TFIDF_DIMS           — dimensões SVD para TF-IDF (default: 256)
"""

import os
import hashlib
import pickle
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.config import Settings
import numpy as np
from dotenv import load_dotenv

load_dotenv()

# ── Configurações ──────────────────────────────────────────────────────────────

CHROMA_PERSIST_DIR  = os.getenv("CHROMA_PERSIST_DIR", "data/chroma")
CHROMA_COLLECTION   = os.getenv("CHROMA_COLLECTION",  "normas_regulamentadoras")
RAG_TOP_K           = int(os.getenv("RAG_TOP_K", "3"))
EMBEDDING_BACKEND   = os.getenv("EMBEDDING_BACKEND", "tfidf")   # tfidf | sentence_transformers
EMBEDDING_MODEL     = os.getenv("EMBEDDING_MODEL",   "paraphrase-multilingual-mpnet-base-v2")
TFIDF_DIMS          = int(os.getenv("TFIDF_DIMS", "256"))
TFIDF_STATE_FILE    = os.path.join(CHROMA_PERSIST_DIR, "tfidf_model.pkl")


# ── Backend TF-IDF + SVD ───────────────────────────────────────────────────────

_tfidf_vectorizer = None
_tfidf_svd        = None
_tfidf_fitted     = False


def _load_tfidf_state():
    global _tfidf_vectorizer, _tfidf_svd, _tfidf_fitted
    state_path = Path(TFIDF_STATE_FILE)
    if state_path.exists():
        with open(state_path, "rb") as f:
            state = pickle.load(f)
        _tfidf_vectorizer = state["vectorizer"]
        _tfidf_svd        = state["svd"]
        _tfidf_fitted     = True
        print(f"[RAGService] TF-IDF carregado do estado salvo ({_tfidf_dims()} dims).")
        return True
    return False


def _tfidf_dims():
    return _tfidf_svd.n_components if _tfidf_svd else TFIDF_DIMS


def _fit_tfidf(corpus: list[str]):
    global _tfidf_vectorizer, _tfidf_svd, _tfidf_fitted
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.decomposition import TruncatedSVD

    print(f"[RAGService] Treinando TF-IDF + SVD({TFIDF_DIMS} dims) com {len(corpus)} documentos...")
    _tfidf_vectorizer = TfidfVectorizer(
        max_features=20_000,
        ngram_range=(1, 2),
        sublinear_tf=True,
        min_df=1,
    )
    tfidf_matrix = _tfidf_vectorizer.fit_transform(corpus)

    n_components = min(TFIDF_DIMS, tfidf_matrix.shape[1] - 1, tfidf_matrix.shape[0] - 1)
    _tfidf_svd = TruncatedSVD(n_components=n_components, random_state=42)
    _tfidf_svd.fit(tfidf_matrix)
    _tfidf_fitted = True

    Path(TFIDF_STATE_FILE).parent.mkdir(parents=True, exist_ok=True)
    with open(TFIDF_STATE_FILE, "wb") as f:
        pickle.dump({"vectorizer": _tfidf_vectorizer, "svd": _tfidf_svd}, f)
    print(f"[RAGService] TF-IDF treinado e salvo ({n_components} dims efetivos).")


def _embed_tfidf(texts: list[str]) -> list[list[float]]:
    if not _tfidf_fitted:
        raise RuntimeError("TF-IDF não treinado. Execute index_documents() primeiro.")
    tfidf_matrix = _tfidf_vectorizer.transform(texts)
    dense = _tfidf_svd.transform(tfidf_matrix)
    # Normaliza L2 para similaridade coseno
    norms = np.linalg.norm(dense, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    normalized = dense / norms
    return normalized.tolist()


# ── Backend Sentence Transformers ──────────────────────────────────────────────

_st_model: Optional[object] = None


def _get_st_model():
    global _st_model
    if _st_model is None:
        from sentence_transformers import SentenceTransformer
        print(f"[RAGService] Carregando Sentence Transformer: {EMBEDDING_MODEL}...")
        _st_model = SentenceTransformer(EMBEDDING_MODEL)
        print("[RAGService] Modelo carregado.")
    return _st_model


def _embed_st(texts: list[str]) -> list[list[float]]:
    model = _get_st_model()
    embeddings = model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
    return embeddings.tolist()


# ── Interface unificada de embedding ──────────────────────────────────────────

def _embed(texts: list[str]) -> list[list[float]]:
    if EMBEDDING_BACKEND == "sentence_transformers":
        return _embed_st(texts)
    return _embed_tfidf(texts)


def _embedding_dim() -> int:
    if EMBEDDING_BACKEND == "sentence_transformers":
        return 768  # paraphrase-multilingual-mpnet-base-v2
    return TFIDF_DIMS


# ── Singleton ChromaDB ─────────────────────────────────────────────────────────

_chroma_client     = None
_chroma_collection = None


def _get_collection():
    global _chroma_client, _chroma_collection
    if _chroma_collection is None:
        persist_dir = Path(CHROMA_PERSIST_DIR)
        persist_dir.mkdir(parents=True, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(
            path=str(persist_dir),
            settings=Settings(anonymized_telemetry=False),
        )
        _chroma_collection = _chroma_client.get_or_create_collection(
            name=CHROMA_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
        count = _chroma_collection.count()
        print(f"[RAGService] Collection '{CHROMA_COLLECTION}' pronta. Chunks: {count}")
        # Tenta recarregar TF-IDF salvo
        if EMBEDDING_BACKEND == "tfidf" and count > 0:
            _load_tfidf_state()
    return _chroma_collection


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_chunk_id(chunk: dict) -> str:
    raw = f"{chunk['metadata']['source']}::{chunk['metadata']['page']}::{chunk['metadata']['chunk_index']}"
    return hashlib.md5(raw.encode()).hexdigest()


# ── Indexação ─────────────────────────────────────────────────────────────────

def index_documents(chunks: list[dict], batch_size: int = 128) -> int:
    """
    Indexa lista de chunks no ChromaDB.
    Para TF-IDF: treina o modelo no corpus completo antes de indexar.
    Retorna número de chunks inseridos.
    """
    if not chunks:
        print("[RAGService] Nenhum chunk para indexar.")
        return 0

    collection = _get_collection()

    # Deduplica
    ids_novos = [_make_chunk_id(c) for c in chunks]
    existing = set(collection.get(ids=ids_novos)["ids"])
    novos = [(c, id_) for c, id_ in zip(chunks, ids_novos) if id_ not in existing]

    if not novos:
        print("[RAGService] Todos os chunks já indexados.")
        return 0

    texts_novos = [c["text"] for c, _ in novos]

    # TF-IDF: treina no corpus completo (TODOS existentes + novos)
    if EMBEDDING_BACKEND == "tfidf":
        corpus_existente = []
        total_existente = collection.count()
        if total_existente > 0:
            res = collection.get(limit=total_existente, include=["documents"])
            corpus_existente = res["documents"]
        corpus_total = corpus_existente + texts_novos
        _fit_tfidf(corpus_total)

    print(f"[RAGService] Indexando {len(novos)} chunk(s) novos...")

    total = 0
    for i in range(0, len(novos), batch_size):
        lote = novos[i: i + batch_size]
        texts    = [c["text"]     for c, _ in lote]
        ids      = [id_           for _, id_ in lote]
        metas    = [c["metadata"] for c, _ in lote]
        embs     = _embed(texts)
        collection.add(ids=ids, embeddings=embs, documents=texts, metadatas=metas)
        total += len(lote)
        print(f"[RAGService]   +{len(lote)} (total indexado: {collection.count()})")

    print(f"[RAGService] Concluído. Total no banco: {collection.count()}")
    return total


# ── Consulta ──────────────────────────────────────────────────────────────────

def _build_query_text(item: dict) -> str:
    partes = []
    if item.get("categoria"):   partes.append(item["categoria"])
    if item.get("pergunta"):    partes.append(item["pergunta"])
    if item.get("comentario"):  partes.append(item["comentario"])
    if item.get("resposta_texto"): partes.append(item["resposta_texto"])
    return " | ".join(partes)


def query_item(item: dict, top_k: int = RAG_TOP_K) -> list[dict]:
    """
    Busca os chunks mais relevantes para um item de auditoria não conforme.
    Retorna lista de {'texto', 'fonte', 'pagina', 'score'}.
    """
    collection = _get_collection()
    if collection.count() == 0:
        print("[RAGService] Banco vazio. Execute index_documents() primeiro.")
        return []

    if EMBEDDING_BACKEND == "tfidf" and not _tfidf_fitted:
        _load_tfidf_state()

    query_text = _build_query_text(item)
    query_emb  = _embed([query_text])[0]

    results = collection.query(
        query_embeddings=[query_emb],
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    out = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        similarity = round(1 - (dist / 2), 4)
        out.append({
            "texto":  doc,
            "fonte":  meta.get("source", "desconhecido"),
            "pagina": meta.get("page", 0),
            "score":  similarity,
        })
    return out


def query_items_batch(itens: list[dict], top_k: int = RAG_TOP_K) -> list[dict]:
    """Enriquece lista de itens com contexto RAG (apenas não conformes e parciais)."""
    enriched = []
    for item in itens:
        if item.get("nao_conforme") or item.get("parcial"):
            item = {**item, "contexto_rag": query_item(item, top_k=top_k)}
        else:
            item = {**item, "contexto_rag": []}
        enriched.append(item)
    return enriched


# ── Utilitários ────────────────────────────────────────────────────────────────

def get_collection_stats() -> dict:
    collection = _get_collection()
    count = collection.count()
    sources: set[str] = set()
    if count > 0:
        sample = collection.get(limit=count, include=["metadatas"])
        sources = {m.get("source", "") for m in sample["metadatas"]}
    return {
        "total_chunks":      count,
        "collection":        CHROMA_COLLECTION,
        "persist_dir":       str(Path(CHROMA_PERSIST_DIR).resolve()),
        "embedding_backend": EMBEDDING_BACKEND,
        "fontes_indexadas":  sorted(sources),
    }


def delete_source(source_name: str) -> int:
    collection = _get_collection()
    result = collection.get(where={"source": source_name}, include=["metadatas"])
    ids = result["ids"]
    if ids:
        collection.delete(ids=ids)
        print(f"[RAGService] {len(ids)} chunks de '{source_name}' removidos.")
    return len(ids)


def reset_collection():
    global _chroma_collection, _tfidf_fitted, _tfidf_vectorizer, _tfidf_svd
    client = chromadb.PersistentClient(
        path=str(Path(CHROMA_PERSIST_DIR)),
        settings=Settings(anonymized_telemetry=False),
    )
    client.delete_collection(CHROMA_COLLECTION)
    _chroma_collection = None
    _tfidf_fitted = False
    _tfidf_vectorizer = None
    _tfidf_svd = None
    if Path(TFIDF_STATE_FILE).exists():
        Path(TFIDF_STATE_FILE).unlink()
    _get_collection()
    print(f"[RAGService] Collection '{CHROMA_COLLECTION}' resetada.")