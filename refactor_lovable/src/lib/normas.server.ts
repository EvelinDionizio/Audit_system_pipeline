import type { SupabaseClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import type { Database } from "@/integrations/supabase/types";

/**
 * RAG das normas (substitui rag_service.py, pdf_extractor.py e index_norms.py).
 *
 * Extração com unpdf (pdf.js em JS puro, roda no runtime edge) no lugar de
 * pdfplumber/pypdf. O chunking é o mesmo do Python: ~500 tokens com
 * sobreposição de ~50, respeitando parágrafos e depois frases.
 */

type Db = SupabaseClient<Database>;

export const BUCKET_NORMAS = "normas";

const CHARS_POR_TOKEN = 4;
const TAMANHO_CHUNK = 500 * CHARS_POR_TOKEN;
const SOBREPOSICAO = 50 * CHARS_POR_TOKEN;
const LOTE_INSERCAO = 500;

export type TrechoNorma = {
  texto: string;
  fonte: string;
  pagina: number;
  score: number;
};

type Chunk = {
  fonte: string;
  pagina: number;
  chunk_index: number;
  texto: string;
};


// ── Extração e chunking ──────────────────────────────────────────────────────

/** Remove artefatos comuns de PDFs normativos (hifenização, quebras e espaços extras). */
function limparTexto(texto: string): string {
  return texto
    .replace(/-\n(\p{L})/gu, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Divide um parágrafo maior que o chunk em frases, respeitando a pontuação. */
function dividirParagrafoLongo(texto: string): string[] {
  const partes: string[] = [];
  let atual = "";
  for (const frase of texto.split(/(?<=[.;:])\s+/)) {
    if (atual && atual.length + frase.length > TAMANHO_CHUNK) {
      partes.push(atual.trim());
      atual = frase;
    } else {
      atual = atual ? `${atual} ${frase}`.trim() : frase;
    }
  }
  if (atual) {
    partes.push(atual.trim());
  }
  return partes;
}

function dividirEmChunks(textoPagina: string, fonte: string, pagina: number): Chunk[] {
  const chunks: Chunk[] = [];
  const emitir = (texto: string) =>
    chunks.push({ fonte, pagina, chunk_index: chunks.length, texto });

  let buffer = "";
  const paragrafos = textoPagina.split("\n\n").map((p) => p.trim()).filter(Boolean);
  for (const paragrafo of paragrafos) {
    const partes =
      paragrafo.length > TAMANHO_CHUNK ? dividirParagrafoLongo(paragrafo) : [paragrafo];
    for (const parte of partes) {
      if (buffer && buffer.length + parte.length + 2 > TAMANHO_CHUNK) {
        emitir(buffer.trim());
        buffer = `${buffer.slice(-SOBREPOSICAO)}\n\n${parte}`;
      } else {
        buffer = buffer ? `${buffer}\n\n${parte}`.trim() : parte;
      }
    }
  }
  if (buffer.trim()) {
    emitir(buffer.trim());
  }
  return chunks;
}

export async function extrairChunksDoPdf(pdf: Uint8Array, fonte: string): Promise<Chunk[]> {
  const documento = await getDocumentProxy(pdf);
  const { text: paginas } = await extractText(documento, { mergePages: false });
  return paginas.flatMap((bruto, indice) => {
    const texto = limparTexto(bruto);
    return texto ? dividirEmChunks(texto, fonte, indice + 1) : [];
  });
}


// ── Indexação (service_role) ─────────────────────────────────────────────────

/**
 * Baixa o PDF do bucket, extrai, e substitui os trechos daquela fonte.
 * A fonte é o nome do arquivo (ex.: "nr-06.pdf"), como no ChromaDB.
 */
export async function indexarPdfDaNorma(
  admin: Db,
  caminho: string,
): Promise<{ fonte: string; chunks: number }> {
  const { data: arquivo, error } = await admin.storage.from(BUCKET_NORMAS).download(caminho);
  if (error) {
    throw new Error(`Não foi possível baixar ${caminho}: ${error.message}`);
  }

  const fonte = caminho.split("/").pop() ?? caminho;
  const chunks = await extrairChunksDoPdf(new Uint8Array(await arquivo.arrayBuffer()), fonte);
  if (chunks.length === 0) {
    throw new Error(`Nenhum texto extraído de ${fonte}. O PDF pode ser escaneado (imagem).`);
  }

  const remocao = await admin.from("normas_chunks").delete().eq("fonte", fonte);
  if (remocao.error) {
    throw new Error(`Erro ao limpar a indexação anterior de ${fonte}: ${remocao.error.message}`);
  }

  for (let i = 0; i < chunks.length; i += LOTE_INSERCAO) {
    const { error: erroLote } = await admin
      .from("normas_chunks")
      .insert(chunks.slice(i, i + LOTE_INSERCAO));
    if (erroLote) {
      throw new Error(`Erro ao gravar os trechos de ${fonte}: ${erroLote.message}`);
    }
  }

  return { fonte, chunks: chunks.length };
}

/** Remove os trechos e o PDF de uma norma (substitui delete_source). */
export async function removerNormaDoBanco(admin: Db, fonte: string): Promise<number> {
  const { error, count } = await admin
    .from("normas_chunks")
    .delete({ count: "exact" })
    .eq("fonte", fonte);
  if (error) {
    throw new Error(`Erro ao remover ${fonte}: ${error.message}`);
  }

  const { error: erroStorage } = await admin.storage.from(BUCKET_NORMAS).remove([fonte]);
  if (erroStorage) {
    throw new Error(`Trechos removidos, mas o PDF continua no Storage: ${erroStorage.message}`);
  }
  return count ?? 0;
}


// ── Consulta (substitui query_item) ──────────────────────────────────────────

export async function buscarNormas(db: Db, consulta: string, topK: number): Promise<TrechoNorma[]> {
  const { data, error } = await db.rpc("buscar_normas", { consulta, top_k: topK });
  if (error) {
    throw new Error(`Erro na busca de normas: ${error.message}`);
  }
  return data;
}
