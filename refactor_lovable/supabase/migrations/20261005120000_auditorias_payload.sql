-- ════════════════════════════════════════════════════════════════════════════
-- Parte 6.1 — Payload completo da revisão (para a exportação Excel)
--
-- O export_excel.py lia os JSONs completos de output/ (cabeçalho, todos os
-- itens com resposta, comentário e parecer). Esses dados não cabem nas
-- colunas resumidas de auditorias/sugestoes, então a última revisão de cada
-- auditoria passa a ser guardada inteira em auditorias.payload.
--
-- Também alinha sugestoes.tipo com o campo `obrigatorio` calculado no
-- parecer (que considera erro de digitação); antes o banco recalculava só
-- pela criticidade.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.auditorias add column payload jsonb;

-- Assinatura muda (novo parâmetro): remover a antiga evita duas versões.
drop function public.registrar_auditoria(bigint, uuid, jsonb, jsonb, jsonb);

create function public.registrar_auditoria(
  p_evaluation_id bigint,
  p_user_id       uuid,
  p_cabecalho     jsonb,
  p_resumo        jsonb,
  p_itens         jsonb default '[]'::jsonb,
  p_payload       jsonb default null
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
    total_itens, total_nc, total_parciais, total_conformes, payload
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
    coalesce((p_resumo ->> 'total_conformes')::integer, 0),
    p_payload
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
    payload                 = coalesce(excluded.payload, a.payload),
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
      -- Valor calculado no parecer (inclui erro de digitação).
      when jsonb_typeof(item -> 'obrigatorio') = 'boolean' then
        case when (item ->> 'obrigatorio')::boolean then 'obrigatorio' else 'sugestao' end
      when item ->> 'criticidade' = 'Mandatório' and coalesce(item ->> 'sugestao', '') <> ''
        then 'obrigatorio'
      else 'sugestao'
    end
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) as item;

  return _auditoria_id;
end;
$$;

revoke execute on function public.registrar_auditoria(bigint, uuid, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.registrar_auditoria(bigint, uuid, jsonb, jsonb, jsonb, jsonb)
  to service_role;
