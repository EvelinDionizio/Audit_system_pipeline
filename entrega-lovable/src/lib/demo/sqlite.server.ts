import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Banco SQLite do modo demonstração (bun:sqlite). Mesmo schema das
 * migrations do Postgres, adaptado: uuid/timestamptz viram TEXT, boolean
 * vira INTEGER 0/1, jsonb vira TEXT com JSON e a busca de normas usa FTS5.
 * Os triggers de pré-cadastro e a trava do último analista foram portados.
 */

export type Linha = Record<string, unknown>;

type Instrucao = {
  all(...params: unknown[]): Linha[];
  get(...params: unknown[]): Linha | null;
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
};

export type BancoSqlite = {
  query(sql: string): Instrucao;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
};

export const ARQUIVO_BANCO = path.join(process.cwd(), ".demo", "auditoria.sqlite");
export const PASTA_STORAGE = path.join(process.cwd(), ".demo", "storage");

const AGORA = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

const SCHEMA = `
create table if not exists profiles (
  id            text primary key,
  nome          text not null,
  email         text not null unique,
  ativo         integer not null default 0,
  criado_em     text not null default ${AGORA},
  ultimo_acesso text,
  tipo_acesso       text not null default 'sso' check (tipo_acesso in ('sso', 'senha')),
  senha_alterada_em text,
  deve_trocar_senha integer not null default 0
);

create table if not exists user_roles (
  id      integer primary key autoincrement,
  user_id text not null references profiles(id) on delete cascade,
  role    text not null check (role in ('analista', 'auditor')),
  unique (user_id, role)
);

create table if not exists usuarios_autorizados (
  email      text primary key,
  nome       text not null,
  perfil     text not null default 'auditor' check (perfil in ('analista', 'auditor')),
  criado_por text,
  criado_em  text not null default ${AGORA},
  tipo_acesso text not null default 'sso' check (tipo_acesso in ('sso', 'senha'))
);

create table if not exists auditorias (
  id                      integer primary key autoincrement,
  evaluation_id           integer not null unique,
  user_id                 text,
  checklist               text,
  unidade                 text,
  auditor_cf              text,
  data_inicio             text,
  status_cf               integer,
  percentual_conformidade real,
  nivel_conformidade      text,
  total_itens             integer not null default 0,
  total_nc                integer not null default 0,
  total_parciais          integer not null default 0,
  total_conformes         integer not null default 0,
  total_reprocessamentos  integer not null default 0,
  processado_em           text not null default ${AGORA},
  atualizado_em           text not null default ${AGORA},
  payload                 text
);

create table if not exists reprocessamentos (
  id                      integer primary key autoincrement,
  evaluation_id           integer not null references auditorias(evaluation_id) on delete cascade,
  user_id                 text,
  percentual_conformidade real,
  nivel_conformidade      text,
  total_itens             integer not null default 0,
  total_nc                integer not null default 0,
  processado_em           text not null default ${AGORA}
);

create table if not exists sugestoes (
  id                 integer primary key autoincrement,
  auditoria_id       integer not null references auditorias(id) on delete cascade,
  reprocessamento_id integer references reprocessamentos(id) on delete cascade,
  item_id            integer,
  categoria          text,
  pergunta           text,
  criticidade        text,
  resposta_original  text,
  sugestao_ia        text,
  tipo               text not null default 'sugestao',
  aceita             integer,
  aceita_em          text,
  aceita_por         text,
  substituida_em     text
);

create table if not exists config_itens (
  id             integer primary key autoincrement,
  checklist_id   text not null default '',
  item_nome      text not null,
  habilitado     integer not null default 1,
  validacao_tipo text not null default 'sugestao',
  exige_imagem   integer not null default 0,
  criado_por     text,
  atualizado_em  text not null default ${AGORA},
  unique (checklist_id, item_nome)
);

create table if not exists uso_tokens (
  id            integer primary key autoincrement,
  evaluation_id integer,
  user_id       text,
  modelo        text,
  tipo_chamada  text,
  tokens_input  integer not null default 0,
  tokens_output integer not null default 0,
  tokens_total  integer generated always as (tokens_input + tokens_output) stored,
  custo_usd     real,
  criado_em     text not null default ${AGORA}
);

create table if not exists normas_chunks (
  id          integer primary key autoincrement,
  fonte       text not null,
  pagina      integer not null,
  chunk_index integer not null,
  texto       text not null,
  criado_em   text not null default ${AGORA},
  unique (fonte, pagina, chunk_index)
);

create virtual table if not exists normas_fts using fts5(
  texto, content = 'normas_chunks', content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

create trigger if not exists normas_fts_ai after insert on normas_chunks begin
  insert into normas_fts (rowid, texto) values (new.id, new.texto);
end;
create trigger if not exists normas_fts_ad after delete on normas_chunks begin
  insert into normas_fts (normas_fts, rowid, texto) values ('delete', old.id, old.texto);
end;

-- Pré-cadastro: ativa o perfil e sincroniza o papel (aplicar_autorizacao).
create trigger if not exists autorizacao_ai after insert on usuarios_autorizados begin
  update profiles set nome = new.nome, ativo = 1 where email = new.email;
  insert or ignore into user_roles (user_id, role) select id, new.perfil from profiles where email = new.email;
  delete from user_roles where role <> new.perfil and user_id in (select id from profiles where email = new.email);
end;
create trigger if not exists autorizacao_au after update of perfil, nome on usuarios_autorizados begin
  update profiles set nome = new.nome, ativo = 1 where email = new.email;
  insert or ignore into user_roles (user_id, role) select id, new.perfil from profiles where email = new.email;
  delete from user_roles where role <> new.perfil and user_id in (select id from profiles where email = new.email);
end;
-- Remover o pré-cadastro desativa o perfil (revogar_autorizacao).
create trigger if not exists autorizacao_ad after delete on usuarios_autorizados begin
  update profiles set ativo = 0 where email = old.email;
end;

-- Trava: o sistema nunca fica sem analista ativo.
create trigger if not exists trava_analista_papel after delete on user_roles
when old.role = 'analista' and not exists (
  select 1 from user_roles r join profiles p on p.id = r.user_id where r.role = 'analista' and p.ativo = 1
) begin
  select raise(abort, 'Não é possível remover ou desativar o único analista ativo do sistema.');
end;
create trigger if not exists trava_analista_ativo after update of ativo on profiles
when old.ativo = 1 and new.ativo = 0
  and exists (select 1 from user_roles where user_id = old.id and role = 'analista')
  and not exists (
    select 1 from user_roles r join profiles p on p.id = r.user_id where r.role = 'analista' and p.ativo = 1
  ) begin
  select raise(abort, 'Não é possível remover ou desativar o único analista ativo do sistema.');
end;

create trigger if not exists config_itens_atualizado_em after update on config_itens
when new.atualizado_em = old.atualizado_em begin
  update config_itens set atualizado_em = ${AGORA} where id = new.id;
end;
`;

/** Usuários e regras de exemplo. Rodado só quando o banco é criado. */
function semear(db: BancoSqlite) {
  const perfil = db.query("insert into profiles (id, nome, email, ativo, ultimo_acesso) values (?, ?, ?, ?, ?)");
  const autorizar = db.query("insert into usuarios_autorizados (email, nome, perfil) values (?, ?, ?)");
  const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

  // Já acessaram: o trigger de pré-cadastro ativa o perfil e aplica o papel.
  perfil.run("00000000-0000-4000-8000-000000000001", "Ana Analista", "ana.analista@demo.bernhoeft.com.br", 0, diasAtras(0));
  perfil.run("00000000-0000-4000-8000-000000000002", "Bruno Auditor", "bruno.auditor@demo.bernhoeft.com.br", 0, diasAtras(2));
  autorizar.run("ana.analista@demo.bernhoeft.com.br", "Ana Analista", "analista");
  autorizar.run("bruno.auditor@demo.bernhoeft.com.br", "Bruno Auditor", "auditor");
  // Autorizada, mas ainda não fez o primeiro acesso.
  autorizar.run("carla.souza@demo.bernhoeft.com.br", "Carla Souza", "auditor");
  // Logou sem pré-cadastro: aparece como "Não autorizado".
  perfil.run("00000000-0000-4000-8000-000000000004", "Diego Externo", "diego.externo@demo.bernhoeft.com.br", 0, diasAtras(120));

  const regra = db.query(
    "insert into config_itens (checklist_id, item_nome, habilitado, validacao_tipo, exige_imagem) values (?, ?, ?, ?, ?)",
  );
  regra.run("SEG-OBRAS", "Os trabalhadores utilizam cinto de segurança tipo paraquedista? (Mandatório)", 1, "obrigatorio", 1);
  regra.run("SEG-OBRAS", "O canteiro possui sinalização de segurança adequada? (Desejáveis)", 1, "sugestao", 0);
}

/** Bancos criados antes do acesso externo ganham as colunas novas sem precisar de demo:reset. */
function atualizarBancoExistente(db: BancoSqlite) {
  const colunas = (tabela: string) =>
    new Set(db.query(`pragma table_info(${tabela})`).all().map((c) => String(c["name"])));

  const perfis = colunas("profiles");
  if (!perfis.has("tipo_acesso")) {
    db.exec("alter table profiles add column tipo_acesso text not null default 'sso'");
  }
  if (!perfis.has("senha_alterada_em")) db.exec("alter table profiles add column senha_alterada_em text");
  if (!perfis.has("deve_trocar_senha")) {
    db.exec("alter table profiles add column deve_trocar_senha integer not null default 0");
  }
  if (!colunas("usuarios_autorizados").has("tipo_acesso")) {
    db.exec("alter table usuarios_autorizados add column tipo_acesso text not null default 'sso'");
  }
}

declare global {
  // Uma conexão por processo do servidor de desenvolvimento.
  var __bancoDemo: BancoSqlite | undefined;
}

export function abrirBancoDemo(): BancoSqlite {
  if (globalThis.__bancoDemo) return globalThis.__bancoDemo;

  // bun:sqlite só existe no runtime do bun e só é carregado no modo
  // demonstração; require em tempo de execução evita que o bundler tente
  // resolvê-lo no build de produção.
  const { Database } = createRequire(import.meta.url)("bun:sqlite") as {
    Database: new (arquivo: string, opcoes?: { create?: boolean }) => BancoSqlite;
  };

  mkdirSync(path.dirname(ARQUIVO_BANCO), { recursive: true });
  const db = new Database(ARQUIVO_BANCO, { create: true });
  db.exec("pragma journal_mode = wal; pragma foreign_keys = on;");

  const novo = !db.query("select 1 from sqlite_master where type = 'table' and name = 'profiles'").get();
  db.exec(SCHEMA);
  if (!novo) atualizarBancoExistente(db);
  if (novo) db.transaction(() => semear(db))();

  globalThis.__bancoDemo = db;
  return db;
}
