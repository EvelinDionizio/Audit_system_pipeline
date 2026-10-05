-- ════════════════════════════════════════════════════════════════════════════
-- Parte 1.2 — Auditorias, reprocessamentos e sugestões da IA
--
-- Mesmas tabelas do SQLite, com usuario_id INTEGER → user_id uuid.
--
-- Escrita: auditorias e reprocessamentos são gerados pelo sistema (resultado
-- da revisão por IA), então NÃO há policy de INSERT/UPDATE para o app. Quem
-- grava é a server function de revisão, com service_role, chamando
-- public.registrar_auditoria() — upsert + snapshot + sugestões numa transação.
-- O único dado que o usuário edita direto é o feedback da sugestão (aceita).
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Tabelas ───────────────────────────────────────────────────────────────

create table public.auditorias (
  id                      bigint       generated always as identity primary key,
  evaluation_id           bigint       not null unique,
  user_id                 uuid         references auth.users(id) on delete set null,
  checklist               text,
  unidade                 text,
  auditor_cf              text,
  data_inicio             timestamptz,
  status_cf               integer,
  percentual_conformidade numeric(5,2),
  nivel_conformidade      text         check (nivel_conformidade in ('excelente', 'bom', 'regular', 'critico', 'sem_dados')),
  total_itens             integer      not null default 0,
  total_nc                integer      not null default 0,
  total_parciais          integer      not null default 0,
  total_conformes         integer      not null default 0,
  total_reprocessamentos  integer      not null default 0,
  processado_em           timestamptz  not null default now(),
  atualizado_em           timestamptz  not null default now()
);

create index auditorias_data_inicio_idx on public.auditorias (data_inicio desc);
create index auditorias_auditor_cf_idx  on public.auditorias (auditor_cf);
create index auditorias_user_id_idx     on public.auditorias (user_id);

create table public.reprocessamentos (
  id                      bigint       generated always as identity primary key,
  evaluation_id           bigint       not null references public.auditorias(evaluation_id) on delete cascade,
  user_id                 uuid         references auth.users(id) on delete set null,
  percentual_conformidade numeric(5,2),
  nivel_conformidade      text,
  total_itens             integer      not null default 0,
  total_nc                integer      not null default 0,
  processado_em           timestamptz  not null default now()
);

create index reprocessamentos_evaluation_idx on public.reprocessamentos (evaluation_id, processado_em desc);

create table public.sugestoes (
  id                bigint       generated always as identity primary key,
  auditoria_id      bigint       not null references public.auditorias(id) on delete cascade,
  item_id           bigint,
  categoria         text,
  pergunta          text,
  criticidade       text,
  resposta_original text,
  sugestao_ia       text,
  tipo              text         not null default 'sugestao' check (tipo in ('obrigatorio', 'sugestao')),
  aceita            boolean,     -- null = pendente
  aceita_em         timestamptz,
  aceita_por        uuid         references auth.users(id) on delete set null
);

create index sugestoes_auditoria_idx on public.sugestoes (auditoria_id);


-- ── 2. Grants ────────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.auditorias       to authenticated;
grant select, insert, update, delete on public.reprocessamentos to authenticated;
grant select, insert, update, delete on public.sugestoes        to authenticated;
grant all on public.auditorias       to service_role;
grant all on public.reprocessamentos to service_role;
grant all on public.sugestoes        to service_role;

-- Sugestões: o usuário só pode alterar o feedback, nunca o texto da IA.
revoke update on public.sugestoes from authenticated;
grant update (aceita) on public.sugestoes to authenticated;


-- ── 3. RLS ───────────────────────────────────────────────────────────────────

alter table public.auditorias       enable row level security;
alter table public.reprocessamentos enable row level security;
alter table public.sugestoes        enable row level security;


-- ── 4. Policies ──────────────────────────────────────────────────────────────

-- Painel completo é do analista; o auditor vê as revisões que ele processou.
create policy "auditorias: analista ou quem processou"
  on public.auditorias for select to authenticated
  using (
    public.is_analista(auth.uid())
    or (user_id = auth.uid() and public.is_active_user(auth.uid()))
  );

create policy "reprocessamentos: analista"
  on public.reprocessamentos for select to authenticated
  using (public.is_analista(auth.uid()));

create policy "sugestoes: analista ou quem processou"
  on public.sugestoes for select to authenticated
  using (
    public.is_analista(auth.uid())
    or exists (
      select 1 from public.auditorias a
      where a.id = auditoria_id
        and a.user_id = auth.uid()
        and public.is_active_user(auth.uid())
    )
  );

create policy "sugestoes: feedback do analista ou de quem processou"
  on public.sugestoes for update to authenticated
  using (
    public.is_analista(auth.uid())
    or exists (
      select 1 from public.auditorias a
      where a.id = auditoria_id
        and a.user_id = auth.uid()
        and public.is_active_user(auth.uid())
    )
  )
  with check (true);


-- ── Triggers ─────────────────────────────────────────────────────────────────

-- Feedback: aceita_em/aceita_por são preenchidos pelo banco, não pelo cliente.
create or replace function public.carimbar_feedback_sugestao()
returns trigger
language plpgsql
as $$
begin
  if new.aceita is distinct from old.aceita then
    new.aceita_em  := case when new.aceita is null then null else now() end;
    new.aceita_por := case when new.aceita is null then null else auth.uid() end;
  end if;
  return new;
end;
$$;

create trigger carimbar_feedback_sugestao
  before update of aceita on public.sugestoes
  for each row execute function public.carimbar_feedback_sugestao();


-- ── Gravação da revisão (substitui registrar_auditoria_v2 + registrar_sugestoes) ──
--
-- Recebe os mesmos dicts do Python (cabecalho, resumo, itens do parecer) em
-- jsonb. Upsert por evaluation_id, snapshot em reprocessamentos e inserção
-- das sugestões, tudo na mesma transação. Retorna o id da auditoria.
--
-- Só service_role executa (a server function valida o usuário antes).

-- Datas do Checklist Fácil chegam como texto; valor inválido vira null em vez
-- de derrubar a gravação inteira.
create or replace function public.try_timestamptz(_valor text)
returns timestamptz
language plpgsql
stable  -- depende do timezone da sessão, então não pode ser immutable
as $$
begin
  return nullif(_valor, '')::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public.registrar_auditoria(
  p_evaluation_id bigint,
  p_user_id       uuid,
  p_cabecalho     jsonb,
  p_resumo        jsonb,
  p_itens         jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  _auditoria_id bigint;
begin
  insert into public.auditorias as a (
    evaluation_id, user_id, checklist, unidade, auditor_cf,
    data_inicio, status_cf, percentual_conformidade, nivel_conformidade,
    total_itens, total_nc, total_parciais, total_conformes
  )
  values (
    p_evaluation_id,
    p_user_id,
    p_cabecalho ->> 'checklist_nome',
    p_cabecalho ->> 'unidade_nome',
    p_cabecalho ->> 'auditor_nome',
    public.try_timestamptz(p_cabecalho ->> 'data_inicio'),
    (p_cabecalho ->> 'status')::integer,
    (p_resumo ->> 'percentual_conformidade')::numeric,
    coalesce(p_resumo ->> 'nivel_conformidade', 'sem_dados'),
    coalesce((p_resumo ->> 'total_itens_relevantes')::integer, 0),
    coalesce((p_resumo ->> 'total_nao_conformes')::integer, 0),
    coalesce((p_resumo ->> 'total_parciais')::integer, 0),
    coalesce((p_resumo ->> 'total_conformes')::integer, 0)
  )
  on conflict (evaluation_id) do update set
    user_id                 = excluded.user_id,
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
    atualizado_em           = now()
  returning id into _auditoria_id;

  insert into public.reprocessamentos (
    evaluation_id, user_id, percentual_conformidade,
    nivel_conformidade, total_itens, total_nc
  )
  select evaluation_id, user_id, percentual_conformidade,
         nivel_conformidade, total_itens, total_nc
  from public.auditorias
  where id = _auditoria_id;

  -- Mesmo comportamento do Python: cada revisão acrescenta as sugestões geradas.
  insert into public.sugestoes (
    auditoria_id, item_id, categoria, pergunta, criticidade,
    resposta_original, sugestao_ia, tipo
  )
  select
    _auditoria_id,
    (item ->> 'item_id')::bigint,
    item ->> 'categoria',
    item ->> 'pergunta',
    item ->> 'criticidade',
    item ->> 'resposta_original',
    item ->> 'sugestao',
    case
      when item ->> 'criticidade' = 'Mandatório' and coalesce(item ->> 'sugestao', '') <> ''
        then 'obrigatorio'
      else 'sugestao'
    end
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) as item;

  return _auditoria_id;
end;
$$;

revoke execute on function public.registrar_auditoria(bigint, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.registrar_auditoria(bigint, uuid, jsonb, jsonb, jsonb)
  to service_role;
