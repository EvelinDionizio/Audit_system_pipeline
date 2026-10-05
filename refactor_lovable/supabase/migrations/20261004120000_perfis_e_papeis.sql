-- ════════════════════════════════════════════════════════════════════════════
-- Parte 1.1 — Perfis, papéis e pré-cadastro de usuários
--
-- Substitui as tabelas usuarios, sessoes e recuperacao_senha do SQLite.
-- Login, sessão e senha passam a ser do Auth do Lovable Cloud (Microsoft
-- Entra ID / SAML), então não existem mais senha_hash, sessões nem tokens
-- de recuperação no schema público.
--
-- Com SSO qualquer conta do tenant consegue autenticar. Para manter a regra
-- antiga ("só entra quem o analista cadastrou"), o analista pré-cadastra o
-- e-mail em usuarios_autorizados; no primeiro login o perfil é ativado e o
-- papel aplicado. Quem não está pré-cadastrado entra com perfil inativo e
-- sem papel (não vê nada até um analista autorizar).
-- ════════════════════════════════════════════════════════════════════════════

create type public.app_role as enum ('analista', 'auditor');


-- ── 1. Tabelas ───────────────────────────────────────────────────────────────

create table public.profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  nome          text        not null,
  email         text        not null unique check (email = lower(email)),
  ativo         boolean     not null default false,
  criado_em     timestamptz not null default now(),
  ultimo_acesso timestamptz
);

create table public.user_roles (
  id      bigint          generated always as identity primary key,
  user_id uuid            not null references auth.users(id) on delete cascade,
  role    public.app_role not null,
  unique (user_id, role)
);

create index user_roles_role_idx on public.user_roles (role);

create table public.usuarios_autorizados (
  email      text            primary key check (email = lower(email)),
  nome       text            not null,
  perfil     public.app_role not null default 'auditor',
  criado_por uuid            references auth.users(id) on delete set null,
  criado_em  timestamptz     not null default now()
);


-- ── 2. Grants ────────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.profiles             to authenticated;
grant select, insert, update, delete on public.user_roles           to authenticated;
grant select, insert, update, delete on public.usuarios_autorizados to authenticated;
grant all on public.profiles             to service_role;
grant all on public.user_roles           to service_role;
grant all on public.usuarios_autorizados to service_role;


-- ── 3. RLS ───────────────────────────────────────────────────────────────────

alter table public.profiles             enable row level security;
alter table public.user_roles           enable row level security;
alter table public.usuarios_autorizados enable row level security;


-- ── Funções auxiliares (usadas nas policies) ─────────────────────────────────
-- SECURITY DEFINER para não cair em recursão de RLS ao consultar user_roles.

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_active_user(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = _user_id and ativo
  )
$$;

-- Analista = papel analista + perfil ativo (substitui require_analista da API).
create or replace function public.is_analista(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'analista') and public.is_active_user(_user_id)
$$;


-- ── 4. Policies ──────────────────────────────────────────────────────────────

-- profiles: cada um vê o próprio; analista vê e edita todos (nome, ativo).
-- Inserção só pelo trigger de cadastro; exclusão só em cascata de auth.users.
create policy "profiles: ver o próprio ou analista"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_analista(auth.uid()));

create policy "profiles: analista edita"
  on public.profiles for update to authenticated
  using (public.is_analista(auth.uid()))
  with check (public.is_analista(auth.uid()));

-- user_roles: somente leitura para o app. Os papéis são sincronizados a partir
-- de usuarios_autorizados pelos triggers abaixo, para nunca divergirem.
create policy "user_roles: ver o próprio ou analista"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_analista(auth.uid()));

-- usuarios_autorizados: gestão de usuários é exclusiva do analista.
create policy "usuarios_autorizados: analista gerencia"
  on public.usuarios_autorizados for all to authenticated
  using (public.is_analista(auth.uid()))
  with check (public.is_analista(auth.uid()));


-- ── Triggers ─────────────────────────────────────────────────────────────────

-- Primeiro login: cria o perfil e aplica o pré-cadastro, se houver.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _email      text := lower(new.email);
  _autorizado public.usuarios_autorizados%rowtype;
begin
  select * into _autorizado from public.usuarios_autorizados where email = _email;

  insert into public.profiles (id, nome, email, ativo)
  values (
    new.id,
    coalesce(
      _autorizado.nome,
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      _email
    ),
    _email,
    _autorizado.email is not null
  );

  if _autorizado.email is not null then
    insert into public.user_roles (user_id, role) values (new.id, _autorizado.perfil);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Atualiza profiles.ultimo_acesso a cada login (usado em "usuários inativos").
create or replace function public.handle_user_sign_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set ultimo_acesso = new.last_sign_in_at where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_signed_in
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.handle_user_sign_in();


-- Pré-cadastro criado/alterado depois que a pessoa já logou: ativa o perfil e
-- sincroniza o papel. Também é assim que o analista troca o perfil de alguém.
create or replace function public.aplicar_autorizacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
begin
  select id into _uid from public.profiles where email = new.email;
  if _uid is null then
    return new;
  end if;

  update public.profiles set nome = new.nome, ativo = true where id = _uid;

  -- Insere o novo papel antes de remover o antigo, para a trava do último
  -- analista enxergar o estado final correto.
  insert into public.user_roles (user_id, role) values (_uid, new.perfil)
  on conflict (user_id, role) do nothing;
  delete from public.user_roles where user_id = _uid and role <> new.perfil;

  return new;
end;
$$;

create trigger on_usuario_autorizado_salvo
  after insert or update of perfil, nome on public.usuarios_autorizados
  for each row execute function public.aplicar_autorizacao();


-- Remover o pré-cadastro desativa o perfil (equivale ao antigo excluir_usuario;
-- a conta em auth.users só pode ser apagada pela API admin no servidor).
create or replace function public.revogar_autorizacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set ativo = false where email = old.email;
  return old;
end;
$$;

create trigger on_usuario_autorizado_removido
  after delete on public.usuarios_autorizados
  for each row execute function public.revogar_autorizacao();


-- Trava: o sistema nunca fica sem analista ativo
-- (substitui as checagens de excluir_usuario e alterar_perfil).
create or replace function public.exigir_analista_ativo()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.role = 'analista' and p.ativo
  ) then
    raise exception 'Não é possível remover ou desativar o único analista ativo do sistema.';
  end if;
end;
$$;

create or replace function public.garantir_analista_ao_mudar_papel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'analista' then
    perform public.exigir_analista_ativo();
  end if;
  return null;
end;
$$;

create or replace function public.garantir_analista_ao_desativar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.ativo and not new.ativo and public.has_role(old.id, 'analista') then
    perform public.exigir_analista_ativo();
  end if;
  return null;
end;
$$;

create trigger garantir_analista_ao_mudar_papel
  after update or delete on public.user_roles
  for each row execute function public.garantir_analista_ao_mudar_papel();

create trigger garantir_analista_ao_desativar
  after update of ativo on public.profiles
  for each row execute function public.garantir_analista_ao_desativar();

-- Funções internas de trigger não devem ser chamáveis via API (RPC).
revoke execute on function public.exigir_analista_ativo() from public, anon, authenticated;


-- ── Seeds ────────────────────────────────────────────────────────────────────
-- Analistas atuais (de atualizar_email.py e criar_usuarios_lote.py).
-- Entram no sistema no primeiro login com a conta Microsoft.

insert into public.usuarios_autorizados (email, nome, perfil) values
  ('evelin.silva@bernhoeft.com.br',  'Evelin Silva',  'analista'),
  ('jrferreira@bernhoeft.com.br',    'Jr Ferreira',   'analista'),
  ('maria.bezerra@bernhoeft.com.br', 'Maria Bezerra', 'analista'),
  ('mvbarbosa@bernhoeft.com.br',     'MV Barbosa',    'analista'),
  ('raiane.santos@bernhoeft.com.br', 'Raiane Santos', 'analista'),
  ('maccioly@bernhoeft.com.br',      'Maccioly',      'analista');
