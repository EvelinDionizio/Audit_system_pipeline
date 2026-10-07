import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { type BancoSqlite, type Linha, PASTA_STORAGE, abrirBancoDemo } from "./sqlite.server";

/**
 * Imita, sobre o SQLite, o pedaço do client do Supabase que o app usa
 * (from/select/eq/is/in/order/limit/single/insert/upsert/update/delete,
 * rpc e storage). Assim telas e server functions não mudam no modo demo.
 *
 * Sem RLS: é um banco local de demonstração. O acesso de analista continua
 * barrado pelo analistaMiddleware.
 */

type Resultado = { data: unknown; error: { message: string } | null; count?: number | null };

const TABELAS = new Set([
  "profiles", "user_roles", "usuarios_autorizados", "auditorias", "reprocessamentos",
  "sugestoes", "config_itens", "uso_tokens", "normas_chunks",
]);
const BOOLEANAS: Record<string, string[]> = {
  profiles: ["ativo", "deve_trocar_senha"],
  sugestoes: ["aceita"],
  config_itens: ["habilitado", "exige_imagem"],
};
const JSONS: Record<string, string[]> = { auditorias: ["payload"] };

const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/;

function ident(nome: string): string {
  if (!IDENTIFICADOR.test(nome)) throw new Error(`Identificador inválido: ${nome}`);
  return nome;
}

function paraBanco(valor: unknown): unknown {
  if (valor === undefined) return null;
  if (typeof valor === "boolean") return valor ? 1 : 0;
  if (valor !== null && typeof valor === "object") return JSON.stringify(valor);
  return valor;
}

function daLinha(tabela: string, linha: Linha): Linha {
  const saida: Linha = { ...linha };
  for (const c of BOOLEANAS[tabela] ?? []) {
    if (c in saida && saida[c] !== null) saida[c] = saida[c] === 1;
  }
  for (const c of JSONS[tabela] ?? []) {
    if (typeof saida[c] === "string") saida[c] = JSON.parse(saida[c] as string);
  }
  return saida;
}

function erro(e: unknown): Resultado {
  return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
}


// ── Query builder ────────────────────────────────────────────────────────────

class Consulta implements PromiseLike<Resultado> {
  private operacao: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private colunas = "*";
  private retornar = false;
  private filtros: { sql: string; params: unknown[] }[] = [];
  private ordens: string[] = [];
  private limite: number | null = null;
  private unico = false;
  private contar = false;
  private valores: Linha[] = [];
  private conflito: string[] = [];

  constructor(
    private readonly db: BancoSqlite,
    private readonly tabela: string,
  ) {
    if (!TABELAS.has(tabela)) throw new Error(`Tabela desconhecida no modo demo: ${tabela}`);
  }

  select(colunas = "*") {
    const lista = colunas.split(",").map((c) => c.trim()).filter(Boolean);
    this.colunas = lista.length === 1 && lista[0] === "*" ? "*" : lista.map(ident).join(", ");
    if (this.operacao === "select") return this;
    this.retornar = true;
    return this;
  }
  insert(valores: Linha | Linha[]) {
    this.operacao = "insert";
    this.valores = Array.isArray(valores) ? valores : [valores];
    return this;
  }
  upsert(valores: Linha | Linha[], opcoes?: { onConflict?: string }) {
    this.operacao = "upsert";
    this.valores = Array.isArray(valores) ? valores : [valores];
    this.conflito = (opcoes?.onConflict ?? "id").split(",").map((c) => ident(c.trim()));
    return this;
  }
  update(valores: Linha) {
    this.operacao = "update";
    this.valores = [valores];
    return this;
  }
  delete(opcoes?: { count?: "exact" }) {
    this.operacao = "delete";
    this.contar = opcoes?.count === "exact";
    return this;
  }
  eq(coluna: string, valor: unknown) {
    this.filtros.push({ sql: `${ident(coluna)} = ?`, params: [paraBanco(valor)] });
    return this;
  }
  is(coluna: string, valor: null) {
    if (valor !== null) throw new Error("is() só aceita null no modo demo.");
    this.filtros.push({ sql: `${ident(coluna)} is null`, params: [] });
    return this;
  }
  in(coluna: string, valores: unknown[]) {
    if (valores.length === 0) {
      this.filtros.push({ sql: "1 = 0", params: [] });
    } else {
      this.filtros.push({ sql: `${ident(coluna)} in (${valores.map(() => "?").join(", ")})`, params: valores.map(paraBanco) });
    }
    return this;
  }
  gte(coluna: string, valor: unknown) {
    this.filtros.push({ sql: `${ident(coluna)} >= ?`, params: [paraBanco(valor)] });
    return this;
  }
  lte(coluna: string, valor: unknown) {
    this.filtros.push({ sql: `${ident(coluna)} <= ?`, params: [paraBanco(valor)] });
    return this;
  }
  order(coluna: string, opcoes?: { ascending?: boolean; nullsFirst?: boolean }) {
    const asc = opcoes?.ascending ?? true;
    // Mesmo padrão do Postgres: nulls por último no asc, primeiro no desc.
    const nullsFirst = opcoes?.nullsFirst ?? !asc;
    this.ordens.push(`${ident(coluna)} ${asc ? "asc" : "desc"} nulls ${nullsFirst ? "first" : "last"}`);
    return this;
  }
  limit(n: number) {
    this.limite = n;
    return this;
  }
  single() {
    this.unico = true;
    return this;
  }

  private onde(): { sql: string; params: unknown[] } {
    if (this.filtros.length === 0) return { sql: "", params: [] };
    return {
      sql: ` where ${this.filtros.map((f) => f.sql).join(" and ")}`,
      params: this.filtros.flatMap((f) => f.params),
    };
  }

  private executar(): Resultado {
    const onde = this.onde();
    const retorno = this.retornar ? ` returning ${this.colunas}` : "";
    let linhas: Linha[] = [];
    let count: number | null = null;

    if (this.operacao === "select") {
      const ordem = this.ordens.length ? ` order by ${this.ordens.join(", ")}` : "";
      const limite = this.limite !== null ? ` limit ${Math.trunc(this.limite)}` : "";
      linhas = this.db.query(`select ${this.colunas} from ${this.tabela}${onde.sql}${ordem}${limite}`).all(...onde.params);
    } else if (this.operacao === "insert" || this.operacao === "upsert") {
      for (const valor of this.valores) {
        const cols = Object.keys(valor).map(ident);
        const params = cols.map((c) => paraBanco(valor[c]));
        let sql = `insert into ${this.tabela} (${cols.join(", ")}) values (${cols.map(() => "?").join(", ")})`;
        if (this.operacao === "upsert") {
          const atualizar = cols.filter((c) => !this.conflito.includes(c));
          sql += ` on conflict (${this.conflito.join(", ")}) do ${
            atualizar.length ? `update set ${atualizar.map((c) => `${c} = excluded.${c}`).join(", ")}` : "nothing"
          }`;
        }
        linhas.push(...this.db.query(sql + retorno).all(...params));
      }
    } else if (this.operacao === "update") {
      const valor = this.valores[0] ?? {};
      const cols = Object.keys(valor).map(ident);
      const sql = `update ${this.tabela} set ${cols.map((c) => `${c} = ?`).join(", ")}${onde.sql}`;
      linhas = this.db.query(sql + retorno).all(...cols.map((c) => paraBanco(valor[c])), ...onde.params);
    } else {
      const sql = `delete from ${this.tabela}${onde.sql}`;
      if (this.retornar) {
        linhas = this.db.query(sql + retorno).all(...onde.params);
      } else {
        count = this.db.query(sql).run(...onde.params).changes;
      }
    }

    const dados = linhas.map((l) => daLinha(this.tabela, l));
    if (this.unico) {
      if (dados.length !== 1) return { data: null, error: { message: `Esperada 1 linha, encontradas ${dados.length}.` } };
      return { data: dados[0], error: null };
    }
    const semRetorno = this.operacao !== "select" && !this.retornar;
    return { data: semRetorno ? null : dados, error: null, count: this.contar ? count : null };
  }

  then<A = Resultado, B = never>(
    ok?: ((valor: Resultado) => A | PromiseLike<A>) | null,
    falha?: ((motivo: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    let resultado: Resultado;
    try {
      resultado = this.executar();
    } catch (e) {
      resultado = erro(e);
    }
    return Promise.resolve(resultado).then(ok, falha);
  }
}


// ── Funções do banco (rpc) ───────────────────────────────────────────────────

type Args = Record<string, unknown>;

const num = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? v : padrao);
const desde = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

function dataValida(texto: unknown): string | null {
  if (typeof texto !== "string" || !texto) return null;
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function registrarAuditoria(db: BancoSqlite, a: Args): number {
  const cab = (a["p_cabecalho"] ?? {}) as Linha;
  const res = (a["p_resumo"] ?? {}) as Linha;
  const itens = (a["p_itens"] ?? []) as Linha[];
  const payload = a["p_payload"] ?? null;
  const evaluationId = a["p_evaluation_id"];
  const userId = a["p_user_id"];

  return db.transaction(() => {
    const campos = [
      userId, cab["checklist_nome"] ?? null, cab["unidade_nome"] ?? null, cab["auditor_nome"] ?? null,
      dataValida(cab["data_inicio"]), cab["status"] ?? null, res["percentual_conformidade"] ?? null,
      res["nivel_conformidade"] ?? "sem_dados", res["total_itens_relevantes"] ?? 0, res["total_nao_conformes"] ?? 0,
      res["total_parciais"] ?? 0, res["total_conformes"] ?? 0,
    ].map(paraBanco);

    const existente = db.query("select id from auditorias where evaluation_id = ?").get(evaluationId);
    let auditoriaId: number;
    if (existente) {
      auditoriaId = existente["id"] as number;
      db.query(
        `update auditorias set user_id = ?, checklist = ?, unidade = ?, auditor_cf = ?, data_inicio = ?, status_cf = ?,
           percentual_conformidade = ?, nivel_conformidade = ?, total_itens = ?, total_nc = ?, total_parciais = ?,
           total_conformes = ?, payload = coalesce(?, payload), total_reprocessamentos = total_reprocessamentos + 1,
           atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         where id = ?`,
      ).run(...campos, paraBanco(payload), auditoriaId);
    } else {
      const linha = db.query(
        `insert into auditorias (user_id, checklist, unidade, auditor_cf, data_inicio, status_cf, percentual_conformidade,
           nivel_conformidade, total_itens, total_nc, total_parciais, total_conformes, payload, evaluation_id)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id`,
      ).get(...campos, paraBanco(payload), evaluationId);
      auditoriaId = linha?.["id"] as number;
    }

    const repro = db.query(
      `insert into reprocessamentos (evaluation_id, user_id, percentual_conformidade, nivel_conformidade, total_itens, total_nc)
       select evaluation_id, user_id, percentual_conformidade, nivel_conformidade, total_itens, total_nc
       from auditorias where id = ? returning id`,
    ).get(auditoriaId);

    // Lote anterior vira histórico.
    db.query(
      "update sugestoes set substituida_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') where auditoria_id = ? and substituida_em is null",
    ).run(auditoriaId);

    const inserir = db.query(
      `insert into sugestoes (auditoria_id, reprocessamento_id, item_id, categoria, pergunta, criticidade,
         resposta_original, sugestao_ia, tipo) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const item of itens) {
      const obrigatorio =
        typeof item["obrigatorio"] === "boolean"
          ? item["obrigatorio"]
          : item["criticidade"] === "Mandatório" && Boolean(item["sugestao"]);
      inserir.run(
        auditoriaId, repro?.["id"] ?? null, item["item_id"] ?? null, item["categoria"] ?? null, item["pergunta"] ?? null,
        item["criticidade"] ?? null, item["resposta_original"] ?? null, item["sugestao"] ?? null,
        obrigatorio ? "obrigatorio" : "sugestao",
      );
    }
    return auditoriaId;
  })();
}

function buscarNormas(db: BancoSqlite, consulta: string, topK: number): Linha[] {
  const termos = [...new Set(consulta.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3))];
  if (termos.length === 0) return [];
  // Termos com OU, como no Postgres; o bm25 do FTS5 ordena a relevância.
  const busca = termos.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
  return db
    .query(
      `select n.texto, n.fonte, n.pagina, bm25(normas_fts) as r
       from normas_fts join normas_chunks n on n.id = normas_fts.rowid
       where normas_fts match ? order by r limit ?`,
    )
    .all(busca, Math.max(topK, 1))
    .map(({ r, ...linha }) => {
      const relevancia = -(r as number);
      return { ...linha, score: relevancia / (1 + relevancia) };
    });
}

function chamarRpc(db: BancoSqlite, nome: string, a: Args): unknown {
  const papel = (uid: unknown, role: string) =>
    Boolean(db.query("select 1 from user_roles where user_id = ? and role = ?").get(uid, role));
  const ativo = (uid: unknown) => Boolean(db.query("select 1 from profiles where id = ? and ativo = 1").get(uid));

  switch (nome) {
    case "has_role":
      return papel(a["_user_id"], String(a["_role"]));
    case "is_active_user":
      return ativo(a["_user_id"]);
    case "is_analista":
      return papel(a["_user_id"], "analista") && ativo(a["_user_id"]);
    case "registrar_auditoria":
      return registrarAuditoria(db, a);
    case "buscar_normas":
      return buscarNormas(db, String(a["consulta"] ?? ""), num(a["top_k"], 3));
    case "score_auditores":
      return db.query(
        `with sug as (
           select auditoria_id, count(*) as total,
             sum(case when aceita = 1 then 1 else 0 end) as aceitas,
             sum(case when aceita = 0 then 1 else 0 end) as ignoradas
           from sugestoes where substituida_em is null group by auditoria_id)
         select a.auditor_cf as auditor, count(*) as total_auditorias,
           round(avg(a.percentual_conformidade), 1) as media_score, sum(a.total_nc) as total_nc,
           coalesce(sum(s.total), 0) as total_sugestoes, coalesce(sum(s.aceitas), 0) as sugestoes_aceitas,
           coalesce(sum(s.ignoradas), 0) as sugestoes_ignoradas,
           case when coalesce(sum(s.total), 0) > 0 then round(sum(s.aceitas) * 100.0 / sum(s.total), 1) end as taxa_aceitacao
         from auditorias a left join sug s on s.auditoria_id = a.id
         where a.auditor_cf is not null group by a.auditor_cf order by media_score desc nulls last`,
      ).all();
    case "resumo_uso_tokens":
      return db.query(
        `select count(*) as total_chamadas, coalesce(sum(tokens_input), 0) as total_input,
           coalesce(sum(tokens_output), 0) as total_output, coalesce(sum(tokens_total), 0) as total_tokens,
           round(coalesce(sum(custo_usd), 0), 4) as custo_total_usd, count(distinct evaluation_id) as auditorias_processadas
         from uso_tokens where criado_em >= ?`,
      ).all(desde(num(a["dias"], 30)));
    case "uso_tokens_por_dia": {
      // Dia no fuso de Brasília, como na função do Postgres.
      const porDia = new Map<string, { dia: string; tokens: number; custo_usd: number; chamadas: number }>();
      for (const l of db.query("select tokens_total, custo_usd, criado_em from uso_tokens where criado_em >= ?").all(desde(num(a["dias"], 30)))) {
        const dia = new Date(l["criado_em"] as string).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
        const atual = porDia.get(dia) ?? { dia, tokens: 0, custo_usd: 0, chamadas: 0 };
        atual.tokens += Number(l["tokens_total"] ?? 0);
        atual.custo_usd = Math.round((atual.custo_usd + Number(l["custo_usd"] ?? 0)) * 10_000) / 10_000;
        atual.chamadas += 1;
        porDia.set(dia, atual);
      }
      return [...porDia.values()].sort((x, y) => y.dia.localeCompare(x.dia));
    }
    case "listar_inativos": {
      const dias = num(a["dias"], 90);
      return db
        .query(
          `select p.id, p.nome, p.email, p.ativo, p.ultimo_acesso, coalesce(p.ultimo_acesso, p.criado_em) as referencia,
             (select role from user_roles r where r.user_id = p.id order by role limit 1) as perfil
           from profiles p`,
        )
        .all()
        .map(({ referencia, ...p }) => ({
          ...p,
          ativo: p["ativo"] === 1,
          dias_inativo: Math.floor((Date.now() - new Date(referencia as string).getTime()) / 86_400_000),
        }))
        .filter((p) => p.dias_inativo >= dias)
        .sort((x, y) => y.dias_inativo - x.dias_inativo);
    }
    case "listar_normas":
      return db.query(
        `select fonte, count(*) as total_chunks, count(distinct pagina) as paginas, max(criado_em) as indexado_em
         from normas_chunks group by fonte order by fonte`,
      ).all();
    default:
      throw new Error(`Função ${nome} não está disponível no modo demonstração.`);
  }
}


// ── Storage (pasta .demo/storage) ────────────────────────────────────────────

function caminhoSeguro(bucket: string, arquivo: string): string {
  const base = path.join(PASTA_STORAGE, ident(bucket));
  const destino = path.resolve(base, arquivo);
  if (!destino.startsWith(base + path.sep)) throw new Error("Caminho inválido.");
  return destino;
}

function storage(bucket: string) {
  return {
    async upload(arquivo: string, corpo: Blob | ArrayBuffer | Uint8Array) {
      try {
        const destino = caminhoSeguro(bucket, arquivo);
        mkdirSync(path.dirname(destino), { recursive: true });
        const bytes = corpo instanceof Blob ? new Uint8Array(await corpo.arrayBuffer()) : new Uint8Array(corpo);
        writeFileSync(destino, bytes);
        return { data: { path: arquivo }, error: null };
      } catch (e) {
        return erro(e);
      }
    },
    async download(arquivo: string) {
      try {
        return { data: new Blob([readFileSync(caminhoSeguro(bucket, arquivo))]), error: null };
      } catch (e) {
        return erro(e);
      }
    },
    async remove(arquivos: string[]) {
      try {
        for (const a of arquivos) rmSync(caminhoSeguro(bucket, a), { force: true });
        return { data: arquivos.map((name) => ({ name })), error: null };
      } catch (e) {
        return erro(e);
      }
    },
  };
}


// ── Client ───────────────────────────────────────────────────────────────────

export function criarClienteDemo(): SupabaseClient<Database> {
  const db = abrirBancoDemo();
  const cliente = {
    from: (tabela: string) => new Consulta(db, tabela),
    rpc: async (nome: string, args: Args = {}) => {
      try {
        return { data: chamarRpc(db, nome, args), error: null };
      } catch (e) {
        return erro(e);
      }
    },
    storage: { from: storage },
  };
  return cliente as unknown as SupabaseClient<Database>;
}

/** Login fictício: cria o perfil no primeiro acesso (como handle_new_user). */
export function entrarComoDemo(email: string): string {
  const db = abrirBancoDemo();
  const existente = db.query("select id from profiles where email = ?").get(email);
  if (existente) {
    db.query("update profiles set ultimo_acesso = ? where id = ?").run(new Date().toISOString(), existente["id"]);
    return existente["id"] as string;
  }

  const autorizado = db.query("select nome, perfil from usuarios_autorizados where email = ?").get(email);
  if (!autorizado) throw new Error("Usuário de demonstração não encontrado.");
  const id = randomUUID();
  db.transaction(() => {
    db.query("insert into profiles (id, nome, email, ativo, ultimo_acesso) values (?, ?, ?, 1, ?)").run(
      id, autorizado["nome"], email, new Date().toISOString(),
    );
    db.query("insert into user_roles (user_id, role) values (?, ?)").run(id, autorizado["perfil"]);
  })();
  return id;
}

/** Usuários que aparecem na tela de login da demonstração. */
export function usuariosParaLoginDemo() {
  const db = abrirBancoDemo();
  return db
    .query(
      `select a.email, a.nome, a.perfil, p.ativo
       from usuarios_autorizados a left join profiles p on p.email = a.email
       order by a.perfil, a.nome`,
    )
    .all()
    .map((u) => ({
      email: u["email"] as string,
      nome: u["nome"] as string,
      perfil: u["perfil"] as "analista" | "auditor",
      // null = ainda não fez o primeiro acesso
      ativo: u["ativo"] === null ? null : u["ativo"] === 1,
    }));
}
