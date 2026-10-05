-- ════════════════════════════════════════════════════════════════════════════
-- Parte 1.3 — Configuração de itens e uso de tokens da IA
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Tabelas ───────────────────────────────────────────────────────────────

-- Habilitar/desabilitar itens por checklist (aba Configurações do analista).
-- A unique substitui o "SELECT + UPDATE ou INSERT" de upsert_config_item:
-- no app, usar upsert com onConflict: 'checklist_id,item_nome'.
create table public.config_itens (
  id             bigint      generated always as identity primary key,
  checklist_id   text        not null default '',
  item_nome      text        not null,
  habilitado     boolean     not null default true,
  validacao_tipo text        not null default 'sugestao' check (validacao_tipo in ('obrigatorio', 'sugestao')),
  exige_imagem   boolean     not null default false,
  criado_por     uuid        references auth.users(id) on delete set null default auth.uid(),
  atualizado_em  timestamptz not null default now(),
  unique (checklist_id, item_nome)
);

-- Consumo por chamada à API do Claude. Gravado pela server function do parecer
-- (service_role); o custo é calculado lá, pois depende do modelo usado.
create table public.uso_tokens (
  id            bigint        generated always as identity primary key,
  evaluation_id bigint,
  user_id       uuid          references auth.users(id) on delete set null,
  modelo        text,
  tipo_chamada  text,
  tokens_input  integer       not null default 0,
  tokens_output integer       not null default 0,
  tokens_total  integer       generated always as (tokens_input + tokens_output) stored,
  custo_usd     numeric(12,6),
  criado_em     timestamptz   not null default now()
);

create index uso_tokens_criado_em_idx on public.uso_tokens (criado_em desc);


-- ── 2. Grants ────────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.config_itens to authenticated;
grant select, insert, update, delete on public.uso_tokens   to authenticated;
grant all on public.config_itens to service_role;
grant all on public.uso_tokens   to service_role;


-- ── 3. RLS ───────────────────────────────────────────────────────────────────

alter table public.config_itens enable row level security;
alter table public.uso_tokens   enable row level security;


-- ── 4. Policies ──────────────────────────────────────────────────────────────

create policy "config_itens: analista gerencia"
  on public.config_itens for all to authenticated
  using (public.is_analista(auth.uid()))
  with check (public.is_analista(auth.uid()));

-- Sem policy de escrita: só service_role grava uso_tokens.
create policy "uso_tokens: analista lê"
  on public.uso_tokens for select to authenticated
  using (public.is_analista(auth.uid()));


-- ── Triggers ─────────────────────────────────────────────────────────────────

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger config_itens_atualizado_em
  before update on public.config_itens
  for each row execute function public.tocar_atualizado_em();
