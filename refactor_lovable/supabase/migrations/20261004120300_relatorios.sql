-- ════════════════════════════════════════════════════════════════════════════
-- Parte 1.4 — Relatórios do painel do analista
--
-- Substituem score_auditores, resumo_uso_tokens, uso_tokens_por_dia e
-- listar_inativos do database.py. São SECURITY INVOKER: rodam com as
-- permissões de quem chama, então as policies de RLS continuam valendo
-- (só o analista enxerga os dados). Chamar no app com supabase.rpc(...).
-- ════════════════════════════════════════════════════════════════════════════


-- Score por auditor do Checklist Fácil.
-- Correção em relação ao Python: lá o JOIN com sugestoes multiplicava total_nc
-- e distorcia a média pelo número de sugestões de cada auditoria. Aqui as
-- sugestões são agregadas por auditoria antes do GROUP BY.
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
      count(*)                              as total,
      count(*) filter (where aceita)        as aceitas,
      count(*) filter (where aceita = false) as ignoradas
    from public.sugestoes
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


-- Resumo de consumo de tokens dos últimos N dias.
create or replace function public.resumo_uso_tokens(dias integer default 30)
returns table (
  total_chamadas         bigint,
  total_input            bigint,
  total_output           bigint,
  total_tokens           bigint,
  custo_total_usd        numeric,
  auditorias_processadas bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*),
    coalesce(sum(tokens_input), 0),
    coalesce(sum(tokens_output), 0),
    coalesce(sum(tokens_total), 0),
    round(coalesce(sum(custo_usd), 0), 4),
    count(distinct evaluation_id)
  from public.uso_tokens
  where criado_em >= now() - make_interval(days => dias)
$$;


-- Consumo por dia (dia no fuso de Brasília; o SQLite agrupava em UTC).
create or replace function public.uso_tokens_por_dia(dias integer default 30)
returns table (
  dia       date,
  tokens    bigint,
  custo_usd numeric,
  chamadas  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (criado_em at time zone 'America/Sao_Paulo')::date as dia,
    sum(tokens_total),
    round(sum(custo_usd), 4),
    count(*)
  from public.uso_tokens
  where criado_em >= now() - make_interval(days => dias)
  group by 1
  order by 1 desc
$$;


-- Usuários sem acesso há N dias ou mais (quem nunca logou conta desde o cadastro).
create or replace function public.listar_inativos(dias integer default 90)
returns table (
  id            uuid,
  nome          text,
  email         text,
  perfil        public.app_role,
  ativo         boolean,
  ultimo_acesso timestamptz,
  dias_inativo  integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select *
  from (
    select
      p.id,
      p.nome,
      p.email,
      (select r.role from public.user_roles r
        where r.user_id = p.id
        order by r.role   -- 'analista' vem antes de 'auditor' no enum
        limit 1) as perfil,
      p.ativo,
      p.ultimo_acesso,
      floor(extract(epoch from now() - coalesce(p.ultimo_acesso, p.criado_em)) / 86400)::integer as dias_inativo
    from public.profiles p
  ) t
  where t.dias_inativo >= dias
  order by t.dias_inativo desc
$$;


revoke execute on function public.score_auditores()            from public, anon;
revoke execute on function public.resumo_uso_tokens(integer)   from public, anon;
revoke execute on function public.uso_tokens_por_dia(integer)  from public, anon;
revoke execute on function public.listar_inativos(integer)     from public, anon;
grant  execute on function public.score_auditores()            to authenticated;
grant  execute on function public.resumo_uso_tokens(integer)   to authenticated;
grant  execute on function public.uso_tokens_por_dia(integer)  to authenticated;
grant  execute on function public.listar_inativos(integer)     to authenticated;
