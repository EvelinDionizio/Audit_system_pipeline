-- ════════════════════════════════════════════════════════════════════════════
-- Backup e restauração do banco pela aplicação
--
-- Permite levar os dados de um projeto Supabase para outro (ex.: Vercel +
-- Supabase → Lovable Cloud) sem pg_dump: o app exporta tudo para um JSON
-- (bucket privado `backups`) e outro projeto, com as mesmas migrations,
-- restaura a partir desse arquivo. Rotas: src/routes/api/public/backup*.ts.
--
-- O que entra no backup:
--   - todas as tabelas de public (colunas geradas ficam de fora: são
--     recalculadas ao restaurar);
--   - auth.users e auth.identities, para manter os ids dos usuários (as
--     auditorias apontam para eles) e o vínculo com a conta Microsoft.
-- Não entra: os arquivos do Storage (PDFs das normas). O texto indexado das
-- normas (normas_chunks) entra, então a busca funciona logo após restaurar.
--
-- Só o service_role executa estas funções (nenhuma policy, nenhum grant a
-- anon/authenticated).
-- ════════════════════════════════════════════════════════════════════════════


-- ── Bucket privado dos backups (sem policies: só service_role acessa) ──────────

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;


-- ── Exporta uma tabela como array JSON (sem colunas geradas) ───────────────────

create or replace function public.backup_exportar_tabela(_schema text, _tabela text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _colunas   text;
  _resultado jsonb;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into _colunas
    from pg_catalog.pg_attribute a
   where a.attrelid = format('%I.%I', _schema, _tabela)::regclass
     and a.attnum > 0
     and not a.attisdropped
     and a.attgenerated = '';

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select %s from %I.%I) t',
    _colunas, _schema, _tabela
  ) into _resultado;

  return _resultado;
end;
$$;


-- ── Insere um array JSON numa tabela, mantendo os ids originais ────────────────
-- Usa só as colunas presentes no backup E na tabela: colunas novas recebem o
-- default e colunas que deixaram de existir são ignoradas.

create or replace function public.backup_inserir_tabela(
  _schema         text,
  _tabela         text,
  _linhas         jsonb,
  _ignorar_conflito boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _colunas text;
  _total   integer;
begin
  if _linhas is null or jsonb_typeof(_linhas) <> 'array' or jsonb_array_length(_linhas) = 0 then
    return 0;
  end if;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into _colunas
    from pg_catalog.pg_attribute a
   where a.attrelid = format('%I.%I', _schema, _tabela)::regclass
     and a.attnum > 0
     and not a.attisdropped
     and a.attgenerated = ''
     and (_linhas -> 0) ? a.attname;

  if _colunas is null then
    return 0;
  end if;

  execute format(
    'insert into %I.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::%I.%I, $1) %s',
    _schema, _tabela, _colunas, _colunas, _schema, _tabela,
    case when _ignorar_conflito then 'on conflict do nothing' else '' end
  ) using _linhas;

  get diagnostics _total = row_count;
  return _total;
end;
$$;


-- ── Exporta o banco inteiro ────────────────────────────────────────────────────

create or replace function public.backup_exportar()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _tabelas jsonb := '{}'::jsonb;
  _tabela  text;
begin
  for _tabela in
    select c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    _tabelas := _tabelas || jsonb_build_object(_tabela, public.backup_exportar_tabela('public', _tabela));
  end loop;

  return jsonb_build_object(
    'formato',   1,
    'criado_em', now(),
    'auth', jsonb_build_object(
      'users',      public.backup_exportar_tabela('auth', 'users'),
      'identities', public.backup_exportar_tabela('auth', 'identities')
    ),
    'tabelas', _tabelas
  );
end;
$$;


-- ── Restaura um backup (substitui TODOS os dados de public) ────────────────────
-- Tudo numa transação: se algo falhar, nada muda.
--
-- 1. Usuários (auth.users / auth.identities) são acrescentados, nunca
--    apagados. Se um e-mail do backup já existir com outro id, a restauração
--    para: os dados apontariam para o usuário errado.
-- 2. As tabelas de public são esvaziadas e preenchidas com o backup, com os
--    triggers desligados (senão o pré-cadastro recriaria papéis, o
--    atualizado_em seria sobrescrito etc.).
-- 3. As sequências das colunas identity continuam do maior id restaurado.

create or replace function public.backup_restaurar(dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Ordem de inserção respeitando as chaves estrangeiras. Tabelas que não
  -- estiverem aqui entram depois, em ordem alfabética.
  _ordem      text[] := array[
    'usuarios_autorizados', 'profiles', 'user_roles',
    'auditorias', 'reprocessamentos', 'sugestoes',
    'config_itens', 'uso_tokens', 'normas_chunks'
  ];
  _existentes text[];
  _tabelas    text[];
  _tabela     text;
  _conflitos  text;
  _contagem   jsonb := '{}'::jsonb;
  _seq        text;
  _coluna     text;
begin
  if dados is null or dados ->> 'formato' is distinct from '1' then
    raise exception 'Backup inválido ou de formato desconhecido (esperado formato 1).';
  end if;

  -- Usuário do backup com o mesmo e-mail de outro usuário já existente.
  select string_agg(distinct u.email, ', ')
    into _conflitos
    from jsonb_to_recordset(coalesce(dados -> 'auth' -> 'users', '[]'::jsonb)) as b(id uuid, email text)
    join auth.users u on lower(u.email) = lower(b.email) and u.id <> b.id;

  if _conflitos is not null then
    raise exception 'Estes e-mails já existem neste projeto com outro id: %. Remova-os em Authentication → Users e tente de novo.', _conflitos;
  end if;

  -- 1. Usuários
  _contagem := _contagem || jsonb_build_object(
    'auth.users',      public.backup_inserir_tabela('auth', 'users', dados -> 'auth' -> 'users', true),
    'auth.identities', public.backup_inserir_tabela('auth', 'identities', dados -> 'auth' -> 'identities', true)
  );

  -- 2. Tabelas de public: as da lista na ordem dela, depois as demais.
  select array_agg(c.relname::text)
    into _existentes
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r';

  select array_agg(t order by coalesce(array_position(_ordem, t), 1000), t)
    into _tabelas
    from unnest(_existentes) t;

  foreach _tabela in array _tabelas loop
    execute format('alter table public.%I disable trigger user', _tabela);
  end loop;

  execute 'truncate table '
    || (select string_agg(format('public.%I', t), ', ') from unnest(_tabelas) t)
    || ' restart identity';

  foreach _tabela in array _tabelas loop
    _contagem := _contagem || jsonb_build_object(
      _tabela,
      public.backup_inserir_tabela('public', _tabela, dados -> 'tabelas' -> _tabela)
    );
  end loop;

  -- 3. Sequências das colunas identity
  for _tabela, _coluna in
    select c.relname, a.attname
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and a.attidentity <> '' and not a.attisdropped
  loop
    _seq := pg_catalog.pg_get_serial_sequence(format('public.%I', _tabela), _coluna);
    execute format(
      'select pg_catalog.setval(%L, coalesce(max(%I), 0) + 1, false) from public.%I',
      _seq, _coluna, _tabela
    );
  end loop;

  foreach _tabela in array _tabelas loop
    execute format('alter table public.%I enable trigger user', _tabela);
  end loop;

  return jsonb_build_object('restaurado_em', now(), 'backup_de', dados -> 'criado_em', 'linhas', _contagem);
end;
$$;


-- ── Permissões: só o servidor (service_role) ───────────────────────────────────

revoke execute on function public.backup_exportar_tabela(text, text)                 from public, anon, authenticated;
revoke execute on function public.backup_inserir_tabela(text, text, jsonb, boolean)  from public, anon, authenticated;
revoke execute on function public.backup_exportar()                                  from public, anon, authenticated;
revoke execute on function public.backup_restaurar(jsonb)                            from public, anon, authenticated;
grant  execute on function public.backup_exportar()                                  to service_role;
grant  execute on function public.backup_restaurar(jsonb)                            to service_role;
