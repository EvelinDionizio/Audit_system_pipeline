-- ════════════════════════════════════════════════════════════════════════════
-- Acesso de auditores externos (e-mail pessoal + senha, sem SSO)
--
-- Internos continuam entrando pela Microsoft (tipo_acesso = 'sso').
-- Externos entram com e-mail e senha criados pelo analista
-- (tipo_acesso = 'senha'): acesso nominal, sem cadastro público, sempre
-- com perfil de auditor.
--
-- A senha temporária é gerada pelo servidor e mostrada uma única vez ao
-- analista; a conta nasce com deve_trocar_senha = true e o externo é
-- obrigado a trocá-la no primeiro acesso.
--
-- Esta migration só prepara os dados. Expiração de 90 dias e MFA vêm em
-- migrations/passos seguintes (senha_alterada_em já é gravada aqui).
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Colunas ───────────────────────────────────────────────────────────────

alter table public.usuarios_autorizados
  add column tipo_acesso text not null default 'sso'
    check (tipo_acesso in ('sso', 'senha'));

-- Externo é sempre auditor: nunca ganha acesso ao painel nem à gestão de usuários.
alter table public.usuarios_autorizados
  add constraint externo_so_auditor check (tipo_acesso = 'sso' or perfil = 'auditor');

alter table public.profiles
  add column tipo_acesso text not null default 'sso'
    check (tipo_acesso in ('sso', 'senha')),
  add column senha_alterada_em timestamptz,
  add column deve_trocar_senha boolean not null default false;


-- ── 2. Cadastro: o perfil herda o tipo de acesso do pré-cadastro ─────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _email      text := lower(new.email);
  _autorizado public.usuarios_autorizados%rowtype;
  _com_senha  boolean;
begin
  select * into _autorizado from public.usuarios_autorizados where email = _email;
  _com_senha := coalesce(_autorizado.tipo_acesso, 'sso') = 'senha';

  insert into public.profiles (id, nome, email, ativo, tipo_acesso, senha_alterada_em, deve_trocar_senha)
  values (
    new.id,
    coalesce(_autorizado.nome, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', _email),
    _email,
    _autorizado.email is not null,
    case when _com_senha then 'senha' else 'sso' end,
    case when _com_senha then now() end,
    -- A senha do primeiro acesso é temporária (definida pelo analista).
    _com_senha
  );

  if _autorizado.email is not null then
    insert into public.user_roles (user_id, role) values (new.id, _autorizado.perfil);
  end if;

  return new;
end;
$$;


-- ── 3. Troca de senha: registra quando foi trocada ───────────────────────────
-- Dispara em qualquer mudança de senha em auth.users. Quando o próprio
-- usuário troca, deve_trocar_senha volta a false. Quando o analista redefine,
-- o servidor marca deve_trocar_senha = true logo depois.

create or replace function public.registrar_troca_de_senha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set senha_alterada_em = now(), deve_trocar_senha = false
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  for each row
  when (new.encrypted_password is distinct from old.encrypted_password)
  execute function public.registrar_troca_de_senha();
