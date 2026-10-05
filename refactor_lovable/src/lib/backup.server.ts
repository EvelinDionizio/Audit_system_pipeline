import type { Json } from "@/integrations/supabase/types";
import { criarClienteAdmin } from "@/lib/supabase-admin.server";

/**
 * Backup e restauração do banco (ver migration …130000_backup_restauracao.sql).
 *
 * O backup é o JSON de `backup_exportar()`, compactado com gzip e guardado no
 * bucket privado `backups`. A restauração lê um desses arquivos (deste projeto
 * ou de uma URL, ex.: link assinado do projeto antigo) e chama
 * `backup_restaurar()`, que substitui todos os dados numa única transação.
 */

const BUCKET = "backups";
const PREFIXO_AUTOMATICO = "backup-";
const PREFIXO_PRE_RESTAURACAO = "pre-restauracao-";
const NOME_VALIDO = /^[\w.-]+\.json(\.gz)?$/;

export type ArquivoBackup = { nome: string; bytes: number | null; criado_em: string | null };

function carimbo(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function gzip(texto: string): Promise<Uint8Array> {
  const fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

async function lerTexto(bytes: Uint8Array): Promise<string> {
  // Arquivo .gz começa com 1f 8b; JSON puro também é aceito.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const fluxo = new Blob([bytes.slice().buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(fluxo).text();
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Compara o `Authorization: Bearer <token>` com o secret informado, em tempo
 * constante. Sem o secret configurado (ou curto demais) a rota fica fechada.
 */
export function tokenValido(request: Request, nomeSecret: "CRON_SECRET" | "RESTORE_TOKEN"): boolean {
  const esperado = process.env[nomeSecret];
  if (!esperado || esperado.length < 16) return false;
  const recebido = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++) {
    diferenca |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  }
  return diferenca === 0;
}

function retencao(): number {
  const valor = Number.parseInt(process.env["BACKUP_RETENCAO"] ?? "", 10);
  return Number.isFinite(valor) && valor > 0 ? valor : 30;
}

async function salvar(prefixo: string) {
  const admin = criarClienteAdmin();
  const { data, error } = await admin.rpc("backup_exportar");
  if (error) throw new Error(`Falha ao exportar o banco: ${error.message}`);

  const nome = `${prefixo}${carimbo()}.json.gz`;
  const conteudo = await gzip(JSON.stringify(data));
  const envio = await admin.storage
    .from(BUCKET)
    .upload(nome, conteudo, { contentType: "application/gzip", upsert: false });
  if (envio.error) throw new Error(`Falha ao gravar o backup: ${envio.error.message}`);

  const tabelas = (data as { tabelas?: Record<string, unknown[]> } | null)?.tabelas ?? {};
  const linhas = Object.fromEntries(Object.entries(tabelas).map(([t, l]) => [t, l.length]));
  return { arquivo: nome, bytes: conteudo.byteLength, linhas };
}

/** Gera um backup e apaga os automáticos além da retenção (BACKUP_RETENCAO, padrão 30). */
export async function criarBackup() {
  const resultado = await salvar(PREFIXO_AUTOMATICO);

  const automaticos = (await listarBackups()).filter((b) => b.nome.startsWith(PREFIXO_AUTOMATICO));
  const excedentes = automaticos.slice(retencao()).map((b) => b.nome);
  if (excedentes.length > 0) {
    await criarClienteAdmin().storage.from(BUCKET).remove(excedentes);
  }
  return { ...resultado, removidos: excedentes };
}

/** Backups do bucket, mais recentes primeiro. */
export async function listarBackups(): Promise<ArquivoBackup[]> {
  const { data, error } = await criarClienteAdmin()
    .storage.from(BUCKET)
    .list("", { limit: 1000, sortBy: { column: "name", order: "desc" } });
  if (error) throw new Error(`Falha ao listar os backups: ${error.message}`);
  return data
    .filter((o) => NOME_VALIDO.test(o.name))
    .map((o) => ({
      nome: o.name,
      bytes: typeof o.metadata?.["size"] === "number" ? o.metadata["size"] : null,
      criado_em: o.created_at ?? null,
    }));
}

/** Link temporário (10 min) para baixar um backup. */
export async function linkDownload(nome: string): Promise<string> {
  if (!NOME_VALIDO.test(nome)) throw new Error("Nome de arquivo inválido.");
  const { data, error } = await criarClienteAdmin().storage.from(BUCKET).createSignedUrl(nome, 600);
  if (error) throw new Error(`Falha ao gerar o link: ${error.message}`);
  return data.signedUrl;
}

export type OrigemRestauracao = { arquivo: string } | { url: string };

async function baixar(origem: OrigemRestauracao): Promise<Uint8Array> {
  if ("arquivo" in origem) {
    if (!NOME_VALIDO.test(origem.arquivo)) throw new Error("Nome de arquivo inválido.");
    const { data, error } = await criarClienteAdmin().storage.from(BUCKET).download(origem.arquivo);
    if (error) throw new Error(`Backup "${origem.arquivo}" não encontrado: ${error.message}`);
    return new Uint8Array(await data.arrayBuffer());
  }
  const resposta = await fetch(origem.url);
  if (!resposta.ok) throw new Error(`Falha ao baixar o backup da URL (HTTP ${resposta.status}).`);
  return new Uint8Array(await resposta.arrayBuffer());
}

/**
 * Restaura um backup. Antes, salva o estado atual como `pre-restauracao-*`
 * (não entra na retenção), para desfazer se for preciso.
 */
export async function restaurarBackup(origem: OrigemRestauracao) {
  let dados: Json;
  try {
    dados = JSON.parse(await lerTexto(await baixar(origem))) as Json;
  } catch (e) {
    throw new Error(`Arquivo de backup ilegível: ${(e as Error).message}`);
  }

  const seguranca = await salvar(PREFIXO_PRE_RESTAURACAO);

  const { data, error } = await criarClienteAdmin().rpc("backup_restaurar", { dados });
  if (error) {
    throw new Error(`Restauração cancelada, nada foi alterado: ${error.message}`);
  }
  return { ...(data as Record<string, unknown>), backup_de_seguranca: seguranca.arquivo };
}
