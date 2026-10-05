-- ════════════════════════════════════════════════════════════════════════════
-- Parte 1.5 — Sugestões versionadas por reprocessamento
--
-- Antes: reprocessar uma auditoria acrescentava um novo lote de sugestões sem
-- tirar o anterior, inflando o score. Agora o lote novo substitui o anterior,
-- que continua no banco como histórico:
--   - vigente   → substituida_em is null
--   - histórico → substituida_em preenchida (com o feedback que recebeu)
-- Cada lote fica ligado ao snapshot de reprocessamentos que o gerou.
-- ════════════════════════════════════════════════════════════════════════════


-- ── Colunas novas ────────────────────────────────────────────────────────────

alter table public.sugestoes
  add column reprocessamento_id bigint references public.reprocessamentos(id) on delete cascade,
  add column substituida_em     timestamptz;

create index sugestoes_vigentes_idx
  on public.sugestoes (auditoria_id)
  where substituida_em is null;

create index sugestoes_reprocessamento_idx
  on public.sugestoes (reprocessamento_id);


-- ── Feedback só nas sugestões vigentes ───────────────────────────────────────
-- O histórico fica congelado com o feedback que tinha quando foi substituído.

drop policy "sugestoes: feedback do analista ou de quem processou" on public.sugestoes;

create policy "sugestoes: feedback do analista ou de quem processou"
  on public.sugestoes for update to authenticated
  using (
    substituida_em is null
    and (
      public.is_analista(auth.uid())
      or exists (
        select 1 from public.auditorias a
        where a.id = auditoria_id
          and a.user_id = auth.uid()
          and public.is_active_user(auth.uid())
      )
    )
  )
  with check (true);


-- ── registrar_auditoria: substitui o lote vigente em vez de acumular ─────────

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
  _auditoria_id       bigint;
  _reprocessamento_id bigint;
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
  where id = _auditoria_id
  returning id into _reprocessamento_id;

  -- Lote anterior vira histórico.
  update public.sugestoes
  set substituida_em = now()
  where auditoria_id = _auditoria_id
    and substituida_em is null;

  insert into public.sugestoes (
    auditoria_id, reprocessamento_id, item_id, categoria, pergunta,
    criticidade, resposta_original, sugestao_ia, tipo
  )
  select
    _auditoria_id,
    _reprocessamento_id,
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


-- ── score_auditores: conta só as sugestões vigentes ──────────────────────────

create or replace function public.score_auditores()
returns table (
  auditor             text,
  total_auditorias    bigint,
  media_score         numeric,
  total_nc            bigint,
  total_sugestoes     bigint,
  sugestoes_aceitas   bigint,
  sugestoes_ignoradas bigint,
  taxa_aceitacao      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with sug as (
    select
      auditoria_id,
      count(*)                               as total,
      count(*) filter (where aceita)         as aceitas,
      count(*) filter (where aceita = false) as ignoradas
    from public.sugestoes
    where substituida_em is null
    group by auditoria_id
  )
  select
    a.auditor_cf,
    count(*),
    round(avg(a.percentual_conformidade), 1),
    sum(a.total_nc),
    coalesce(sum(s.total), 0),
    coalesce(sum(s.aceitas), 0),
    coalesce(sum(s.ignoradas), 0),
    case
      when coalesce(sum(s.total), 0) > 0
        then round(sum(s.aceitas)::numeric / sum(s.total) * 100, 1)
    end
  from public.auditorias a
  left join sug s on s.auditoria_id = a.id
  where a.auditor_cf is not null
  group by a.auditor_cf
  order by 3 desc nulls last
$$;
