Parte 1 de 11 — banco de dados.

Execute o SQL abaixo como uma migração do Lovable Cloud, EXATAMENTE como está (vou aprovar). Não crie tabelas, colunas ou políticas adicionais. Ele cria o enum `app_perfil`, as tabelas `profiles`, `user_roles`, `auditorias`, `reprocessamentos`, `sugestoes`, `config_itens`, `uso_tokens`, `normas_chunks`, as funções, a view `v_score_auditores`, os triggers em `auth.users` e as políticas RLS.

### `supabase/migrations/20260930120000_schema_bernhoeft.sql`

````sql
-- ════════════════════════════════════════════════════════════════════════════
-- Bernhoeft — Sistema de Revisão de Auditoria
-- Migração do SQLite (src/database.py) para Postgres/Supabase.
--
-- Mapeamento:
--   usuarios          → auth.users (Supabase Auth) + public.profiles + public.user_roles
--   sessoes           → removida (sessões gerenciadas pelo Supabase Auth)
--   recuperacao_senha → removida (nunca foi usada no código original)
--   auditorias        → public.auditorias (+ coluna payload: substitui output/audit_*.json)
--   reprocessamentos  → public.reprocessamentos
--   sugestoes         → public.sugestoes
--   config_itens      → public.config_itens
--   uso_tokens        → public.uso_tokens
--   ChromaDB          → public.normas_chunks (busca full-text em português)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Perfis de acesso ────────────────────────────────────────────────────────
create type public.app_perfil as enum ('auditor', 'analista');

create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  nome              text        not null,
  email             text        not null unique,
  ativo             boolean     not null default true,
  criado_em         timestamptz not null default now(),
  ultimo_acesso     timestamptz,
  senha_alterada_em timestamptz not null default now()
);

-- Papéis ficam em tabela separada (evita escalonamento de privilégio via UPDATE no perfil).
-- unique(user_id): como no original, cada usuário tem exatamente um perfil.
create table public.user_roles (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  role    public.app_perfil not null default 'auditor'
);

-- Verifica papel sem recursão de RLS. Usuário inativo não tem papel nenhum.
create or replace function public.has_role(_user_id uuid, _role public.app_perfil)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = _user_id and r.role = _role and p.ativo
  );
$$;

-- Cria perfil + papel 'auditor' para todo usuário novo do Auth.
-- O papel NUNCA é lido do metadata (o cliente controla o metadata); a promoção
-- para analista é feita pela edge function admin-usuarios.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email, senha_alterada_em)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(new.email, '@', 1)),
    lower(new.email),
    now()
  );
  insert into public.user_roles (user_id, role) values (new.id, 'auditor');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Equivalente ao "UPDATE usuarios SET ultimo_acesso" feito em criar_sessao().
create or replace function public.sync_ultimo_acesso()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.profiles set ultimo_acesso = new.last_sign_in_at where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_signin
  after update of last_sign_in_at on auth.users
  for each row execute function public.sync_ultimo_acesso();

-- ── Auditorias processadas ──────────────────────────────────────────────────
create table public.auditorias (
  id                      bigint generated always as identity primary key,
  evaluation_id           bigint      not null unique,
  usuario_id              uuid        references public.profiles(id) on delete set null,
  checklist               text,
  unidade                 text,
  auditor_cf              text,
  data_inicio             timestamptz,
  status_cf               integer,
  percentual_conformidade numeric(5,1),
  nivel_conformidade      text,
  total_itens             integer not null default 0,
  total_nc                integer not null default 0,
  total_parciais          integer not null default 0,
  total_conformes         integer not null default 0,
  total_reprocessamentos  integer not null default 0,
  payload                 jsonb,   -- payload completo (cabecalho/itens/resumo + pareceres); substitui output/*.json
  parecer_geral           text,
  processado_em           timestamptz not null default now(),
  atualizado_em           timestamptz not null default now()
);
create index auditorias_processado_em_idx on public.auditorias (processado_em desc);

create table public.reprocessamentos (
  id                      bigint generated always as identity primary key,
  evaluation_id           bigint not null,
  usuario_id              uuid references public.profiles(id) on delete set null,
  percentual_conformidade numeric(5,1),
  nivel_conformidade      text,
  total_itens             integer not null default 0,
  total_nc                integer not null default 0,
  processado_em           timestamptz not null default now()
);
create index reprocessamentos_eval_idx on public.reprocessamentos (evaluation_id, processado_em desc);

create table public.sugestoes (
  id                bigint generated always as identity primary key,
  auditoria_id      bigint not null references public.auditorias(id) on delete cascade,
  item_id           bigint,
  categoria         text,
  pergunta          text,
  criticidade       text,
  resposta_original text,
  sugestao_ia       text,
  tipo              text not null default 'sugestao' check (tipo in ('obrigatorio', 'sugestao')),
  aceita            boolean,          -- null = pendente
  aceita_em         timestamptz
);
create index sugestoes_auditoria_idx on public.sugestoes (auditoria_id);

create table public.config_itens (
  id             bigint generated always as identity primary key,
  checklist_id   text    not null,
  item_nome      text    not null,
  habilitado     boolean not null default true,
  validacao_tipo text    not null default 'sugestao' check (validacao_tipo in ('obrigatorio', 'sugestao')),
  exige_imagem   boolean not null default false,
  criado_por     uuid references public.profiles(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  unique (checklist_id, item_nome)
);

create table public.uso_tokens (
  id            bigint generated always as identity primary key,
  evaluation_id bigint,
  usuario_id    uuid references public.profiles(id) on delete set null,
  modelo        text,
  tipo_chamada  text,
  tokens_input  integer not null default 0,
  tokens_output integer not null default 0,
  tokens_total  integer not null default 0,
  custo_usd     numeric(12,6),
  criado_em     timestamptz not null default now()
);
create index uso_tokens_criado_em_idx on public.uso_tokens (criado_em desc);

-- ── Base normativa (RAG) ────────────────────────────────────────────────────
-- id = md5("<fonte>::<pagina>::<chunk_index>"), mesmo esquema de _make_chunk_id() do rag_service.py
create table public.normas_chunks (
  id          text primary key,
  fonte       text    not null,
  pagina      integer not null,
  chunk_index integer not null,
  texto       text    not null,
  tsv         tsvector generated always as (to_tsvector('portuguese', texto)) stored,
  criado_em   timestamptz not null default now()
);
create index normas_chunks_tsv_idx   on public.normas_chunks using gin (tsv);
create index normas_chunks_fonte_idx on public.normas_chunks (fonte);

-- Busca lexical com OR entre os termos da consulta (equivalente ao TF-IDF padrão do projeto).
-- score = ts_rank_cd normalizado em [0,1).
create or replace function public.buscar_normas(consulta text, top_k integer default 3)
returns table (texto text, fonte text, pagina integer, score real)
language plpgsql stable set search_path = public
as $$
declare
  termos text;
begin
  select string_agg(format('%L', lexema), ' | ')
    into termos
    from unnest(tsvector_to_array(to_tsvector('portuguese', coalesce(consulta, '')))) as lexema;

  if termos is null then
    return;
  end if;

  return query
    select c.texto, c.fonte, c.pagina,
           ts_rank_cd(c.tsv, to_tsquery('simple', termos), 32)::real as score
      from public.normas_chunks c
     where c.tsv @@ to_tsquery('simple', termos)
     order by score desc
     limit greatest(top_k, 1);
end;
$$;

-- ── Registro de auditoria (upsert + snapshot) — porta de registrar_auditoria_v2 ──
create or replace function public.registrar_auditoria(
  p_evaluation_id bigint,
  p_usuario_id    uuid,
  p_cabecalho     jsonb,
  p_resumo        jsonb,
  p_payload       jsonb,
  p_parecer_geral text
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.auditorias as a (
    evaluation_id, usuario_id, checklist, unidade, auditor_cf, data_inicio, status_cf,
    percentual_conformidade, nivel_conformidade, total_itens, total_nc, total_parciais,
    total_conformes, total_reprocessamentos, payload, parecer_geral
  ) values (
    p_evaluation_id, p_usuario_id,
    p_cabecalho->>'checklist_nome', p_cabecalho->>'unidade_nome', p_cabecalho->>'auditor_nome',
    nullif(p_cabecalho->>'data_inicio', '')::timestamptz, (p_cabecalho->>'status')::integer,
    (p_resumo->>'percentual_conformidade')::numeric, p_resumo->>'nivel_conformidade',
    coalesce((p_resumo->>'total_itens_relevantes')::integer, 0),
    coalesce((p_resumo->>'total_nao_conformes')::integer, 0),
    coalesce((p_resumo->>'total_parciais')::integer, 0),
    coalesce((p_resumo->>'total_conformes')::integer, 0),
    0, p_payload, p_parecer_geral
  )
  on conflict (evaluation_id) do update set
    usuario_id              = excluded.usuario_id,
    checklist               = excluded.checklist,
    unidade                 = excluded.unidade,
    auditor_cf              = excluded.auditor_cf,
    data_inicio             = excluded.data_inicio,
    status_cf               = excluded.status_cf,
    percentual_conformidade = excluded.percentual_conformidade,
    nivel_conformidade      = excluded.nivel_conformidade,
    total_itens             = excluded.total_itens,
    total_nc                = excluded.total_nc,
    total_parciais          = excluded.total_parciais,
    total_conformes         = excluded.total_conformes,
    total_reprocessamentos  = a.total_reprocessamentos + 1,
    payload                 = excluded.payload,
    parecer_geral           = excluded.parecer_geral,
    atualizado_em           = now()
  returning id into v_id;

  insert into public.reprocessamentos (
    evaluation_id, usuario_id, percentual_conformidade, nivel_conformidade, total_itens, total_nc
  ) values (
    p_evaluation_id, p_usuario_id,
    (p_resumo->>'percentual_conformidade')::numeric, p_resumo->>'nivel_conformidade',
    coalesce((p_resumo->>'total_itens_relevantes')::integer, 0),
    coalesce((p_resumo->>'total_nao_conformes')::integer, 0)
  );

  return v_id;
end;
$$;
revoke execute on function public.registrar_auditoria(bigint, uuid, jsonb, jsonb, jsonb, text) from public, anon, authenticated;

-- ── Feedback de sugestão — porta de POST /api/feedback ──────────────────────
create or replace function public.registrar_feedback_sugestao(p_sugestao_id bigint, p_aceita boolean)
returns void
language sql security definer set search_path = public
as $$
  update public.sugestoes
     set aceita = p_aceita, aceita_em = now()
   where id = p_sugestao_id
     and exists (select 1 from public.profiles where id = auth.uid() and ativo);
$$;
revoke execute on function public.registrar_feedback_sugestao(bigint, boolean) from public, anon;
grant execute on function public.registrar_feedback_sugestao(bigint, boolean) to authenticated;

-- ── Indicadores por auditor — porta de score_auditores() ────────────────────
-- Correção: o SQL original fazia LEFT JOIN direto com sugestoes, o que multiplicava
-- total_nc e distorcia a média pelo número de sugestões. Aqui as sugestões são
-- agregadas por auditoria antes do GROUP BY.
create or replace view public.v_score_auditores
with (security_invoker = on) as
select
  a.auditor_cf                                  as auditor,
  count(*)::integer                             as total_auditorias,
  round(avg(a.percentual_conformidade), 1)      as media_score,
  coalesce(sum(a.total_nc), 0)::integer         as total_nc,
  coalesce(sum(s.total), 0)::integer            as total_sugestoes,
  coalesce(sum(s.aceitas), 0)::integer          as sugestoes_aceitas,
  coalesce(sum(s.ignoradas), 0)::integer        as sugestoes_ignoradas,
  case when coalesce(sum(s.total), 0) > 0
       then round(sum(s.aceitas)::numeric / sum(s.total) * 100, 1)
  end                                           as taxa_aceitacao
from public.auditorias a
left join lateral (
  select count(*)                              as total,
         count(*) filter (where aceita)        as aceitas,
         count(*) filter (where aceita = false) as ignoradas
    from public.sugestoes
   where auditoria_id = a.id
) s on true
where a.auditor_cf is not null
group by a.auditor_cf
order by media_score desc nulls last;

-- ── Uso de tokens — porta de resumo_uso_tokens() / uso_tokens_por_dia() ─────
create or replace function public.resumo_uso_tokens(dias integer default 30)
returns table (
  total_chamadas bigint, total_input bigint, total_output bigint, total_tokens bigint,
  custo_total_usd numeric, auditorias_processadas bigint
)
language sql stable set search_path = public
as $$
  select count(*), sum(tokens_input), sum(tokens_output), sum(tokens_total),
         round(sum(custo_usd), 4), count(distinct evaluation_id)
    from public.uso_tokens
   where criado_em >= now() - make_interval(days => dias);
$$;

create or replace function public.uso_tokens_por_dia(dias integer default 30)
returns table (dia date, tokens bigint, custo_usd numeric, chamadas bigint)
language sql stable set search_path = public
as $$
  select (criado_em at time zone 'UTC')::date, sum(tokens_total), round(sum(custo_usd), 4), count(*)
    from public.uso_tokens
   where criado_em >= now() - make_interval(days => dias)
   group by 1
   order by 1 desc;
$$;

-- ── Usuários inativos — porta de listar_inativos() (rota que faltava na API original) ──
create or replace function public.listar_inativos(dias integer default 90)
returns table (
  id uuid, nome text, email text, perfil public.app_perfil, ativo boolean,
  ultimo_acesso timestamptz, dias_inativo integer
)
language sql stable set search_path = public
as $$
  select p.id, p.nome, p.email, r.role, p.ativo, p.ultimo_acesso,
         extract(day from now() - coalesce(p.ultimo_acesso, p.criado_em))::integer
    from public.profiles p
    left join public.user_roles r on r.user_id = p.id
   where now() - coalesce(p.ultimo_acesso, p.criado_em) >= make_interval(days => dias)
   order by 7 desc;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — escrita sensível só via edge functions (service role).
-- ════════════════════════════════════════════════════════════════════════════
alter table public.profiles         enable row level security;
alter table public.user_roles       enable row level security;
alter table public.auditorias       enable row level security;
alter table public.reprocessamentos enable row level security;
alter table public.sugestoes        enable row level security;
alter table public.config_itens     enable row level security;
alter table public.uso_tokens       enable row level security;
alter table public.normas_chunks    enable row level security;

create policy "perfil próprio ou analista" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'analista'));

create policy "papel próprio ou analista" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'analista'));

create policy "analista lê auditorias" on public.auditorias
  for select to authenticated using (public.has_role(auth.uid(), 'analista'));

create policy "analista lê reprocessamentos" on public.reprocessamentos
  for select to authenticated using (public.has_role(auth.uid(), 'analista'));

create policy "analista lê sugestões" on public.sugestoes
  for select to authenticated using (public.has_role(auth.uid(), 'analista'));

create policy "analista lê config" on public.config_itens
  for select to authenticated using (public.has_role(auth.uid(), 'analista'));
create policy "analista cria config" on public.config_itens
  for insert to authenticated with check (public.has_role(auth.uid(), 'analista'));
create policy "analista altera config" on public.config_itens
  for update to authenticated
  using (public.has_role(auth.uid(), 'analista'))
  with check (public.has_role(auth.uid(), 'analista'));

create policy "analista lê uso de tokens" on public.uso_tokens
  for select to authenticated using (public.has_role(auth.uid(), 'analista'));

create policy "autenticado lê normas" on public.normas_chunks
  for select to authenticated using (true);
````

Depois responda "Parte 1 recebida" e informe se a migração foi aplicada com sucesso.
