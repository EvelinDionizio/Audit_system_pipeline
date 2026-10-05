-- ════════════════════════════════════════════════════════════════════════════
-- Parte 3.1 — Normas para o RAG (busca de trechos normativos)
--
-- Substitui ChromaDB + TF-IDF/SVD (rag_service.py). A busca passa a ser
-- full-text search do Postgres em português: mesmo princípio lexical do
-- backend TF-IDF que o Python usava por padrão, sem embeddings, sem libs
-- nativas e sem serviço externo.
--
-- Os PDFs ficam no bucket privado "normas" do Storage; a server function
-- indexarNorma extrai o texto, divide em trechos e grava aqui.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Tabela ────────────────────────────────────────────────────────────────

create table public.normas_chunks (
  id          bigint      generated always as identity primary key,
  fonte       text        not null,  -- nome do arquivo, ex.: "nr-06.pdf"
  pagina      integer     not null,
  chunk_index integer     not null,
  texto       text        not null,
  tsv         tsvector    generated always as (to_tsvector('portuguese', texto)) stored,
  criado_em   timestamptz not null default now(),
  unique (fonte, pagina, chunk_index)
);

create index normas_chunks_tsv_idx   on public.normas_chunks using gin (tsv);
create index normas_chunks_fonte_idx on public.normas_chunks (fonte);


-- ── 2. Grants ────────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.normas_chunks to authenticated;
grant all on public.normas_chunks to service_role;


-- ── 3. RLS ───────────────────────────────────────────────────────────────────

alter table public.normas_chunks enable row level security;


-- ── 4. Policies ──────────────────────────────────────────────────────────────

-- Leitura para qualquer usuário ativo (a revisão roda como o auditor).
-- Escrita só pelo servidor (service_role), após checar que é analista.
create policy "normas_chunks: usuários ativos leem"
  on public.normas_chunks for select to authenticated
  using (public.is_active_user(auth.uid()));


-- ── Busca (substitui query_item) ─────────────────────────────────────────────
-- O texto do item (categoria | pergunta | comentário) é longo; exigir todos os
-- termos (plainto_tsquery) quase nunca acharia nada. Por isso os termos são
-- combinados com OU e o ranking (ts_rank_cd) decide a relevância, como fazia
-- a similaridade do TF-IDF. Score normalizado em 0..1.

create or replace function public.buscar_normas(consulta text, top_k integer default 3)
returns table (
  texto  text,
  fonte  text,
  pagina integer,
  score  real
)
language sql
stable
security invoker
set search_path = public
as $$
  with termos as (
    select distinct lexema
    from unnest(tsvector_to_array(to_tsvector('portuguese', coalesce(consulta, '')))) as lexema
    where lexema !~ '\\'
  ),
  q as (
    -- Cada termo vai entre aspas para não ser interpretado como operador.
    select to_tsquery(
      'simple',
      string_agg('''' || replace(lexema, '''', '''''') || '''', ' | ')
    ) as query
    from termos
    having count(*) > 0
  )
  select n.texto, n.fonte, n.pagina, ts_rank_cd(n.tsv, q.query, 32) as score
  from public.normas_chunks n, q
  where n.tsv @@ q.query
  order by score desc
  limit greatest(top_k, 1)
$$;


-- Normas indexadas (substitui get_collection_stats).
create or replace function public.listar_normas()
returns table (
  fonte        text,
  total_chunks bigint,
  paginas      bigint,
  indexado_em  timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select fonte, count(*), count(distinct pagina), max(criado_em)
  from public.normas_chunks
  group by fonte
  order by fonte
$$;

revoke execute on function public.buscar_normas(text, integer) from public, anon;
revoke execute on function public.listar_normas()              from public, anon;
grant  execute on function public.buscar_normas(text, integer) to authenticated;
grant  execute on function public.listar_normas()              to authenticated;


-- ── Storage: bucket privado dos PDFs ─────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('normas', 'normas', false)
on conflict (id) do nothing;

create policy "normas (storage): analista lê"
  on storage.objects for select to authenticated
  using (bucket_id = 'normas' and public.is_analista(auth.uid()));

create policy "normas (storage): analista envia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'normas' and public.is_analista(auth.uid()));

create policy "normas (storage): analista remove"
  on storage.objects for delete to authenticated
  using (bucket_id = 'normas' and public.is_analista(auth.uid()));
