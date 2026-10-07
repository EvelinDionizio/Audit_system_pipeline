/**
 * Modo demonstração: indexa os PDFs normativos no banco SQLite local
 * (substitui o upload pelo Storage). Mesma extração e chunking do app.
 *
 *   bun run demo:normas              → indexa ../norms/*.pdf
 *   bun run demo:normas <pasta>      → indexa outra pasta
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { abrirBancoDemo } from "../src/lib/demo/sqlite.server";
import { extrairChunksDoPdf } from "../src/lib/normas.server";

const pasta = path.resolve(process.argv[2] ?? path.join(process.cwd(), "..", "norms"));
const pdfs = readdirSync(pasta).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
if (pdfs.length === 0) {
  console.error(`Nenhum PDF em ${pasta}`);
  process.exit(1);
}

const db = abrirBancoDemo();
const remover = db.query("delete from normas_chunks where fonte = ?");
const inserir = db.query("insert into normas_chunks (fonte, pagina, chunk_index, texto) values (?, ?, ?, ?)");

let total = 0;
const falhas: string[] = [];
for (const [i, arquivo] of pdfs.entries()) {
  const rotulo = `[${i + 1}/${pdfs.length}] ${arquivo}`;
  try {
    const chunks = await extrairChunksDoPdf(new Uint8Array(readFileSync(path.join(pasta, arquivo))), arquivo);
    if (chunks.length === 0) throw new Error("nenhum texto extraído (PDF escaneado?)");
    db.transaction(() => {
      remover.run(arquivo);
      for (const c of chunks) inserir.run(c.fonte, c.pagina, c.chunk_index, c.texto);
    })();
    total += chunks.length;
    console.log(`${rotulo}: ${chunks.length} trechos`);
  } catch (e) {
    falhas.push(arquivo);
    console.warn(`${rotulo}: ERRO — ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log(`\n${pdfs.length - falhas.length} norma(s) indexada(s), ${total} trechos.`);
if (falhas.length) console.log(`Com erro: ${falhas.join(", ")}`);
