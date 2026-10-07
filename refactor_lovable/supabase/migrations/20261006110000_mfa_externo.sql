-- ════════════════════════════════════════════════════════════════════════════
-- MFA obrigatório para acessos externos (TOTP nativo do Supabase Auth)
--
-- O servidor já barra o externo sem MFA (authMiddleware), mas o token de uma
-- sessão só com senha (aal1) também fala direto com a API do banco. Por isso o
-- banco passa a exigir aal2 das contas com senha própria, em policies
-- RESTRITIVAS: elas se somam às policies atuais (E lógico) e não as substituem.
--
-- Quem entra pela Microsoft (tipo_acesso = 'sso') não é afetado: o MFA dele é
-- o da própria Microsoft. O service_role ignora o RLS, então o servidor segue
-- funcionando como antes.
--
-- profiles e user_roles ficam de fora de propósito: a tela precisa ler o
-- próprio perfil para saber que falta o MFA e levar a pessoa a cadastrá-lo.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Função: a sessão atende à exigência de MFA? ───────────────────────────
-- true  = conta SSO, ou conta com senha cuja sessão já passou pelo MFA (aal2).
-- false = conta com senha e sessão só com senha (aal1).
-- security definer para ler profiles sem passar pelo RLS dela mesma.

create or replace function public.mfa_satisfeita()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from public.profiles
        where id = auth.uid() and tipo_acesso = 'senha'
      );
$$;

grant execute on function public.mfa_satisfeita() to authenticated;


-- ── 2. Policies restritivas nas tabelas de dados ─────────────────────────────

create policy "mfa: exigido de acessos externos"
  on public.auditorias as restrictive for all to authenticated
  using (public.mfa_satisfeita()) with check (public.mfa_satisfeita());

create policy "mfa: exigido de acessos externos"
  on public.reprocessamentos as restrictive for all to authenticated
  using (public.mfa_satisfeita()) with check (public.mfa_satisfeita());

create policy "mfa: exigido de acessos externos"
  on public.sugestoes as restrictive for all to authenticated
  using (public.mfa_satisfeita()) with check (public.mfa_satisfeita());

create policy "mfa: exigido de acessos externos"
  on public.config_itens as restrictive for all to authenticated
  using (public.mfa_satisfeita()) with check (public.mfa_satisfeita());

create policy "mfa: exigido de acessos externos"
  on public.uso_tokens as restrictive for all to authenticated
  using (public.mfa_satisfeita()) with check (public.mfa_satisfeita());

create policy "mfa: exigido de acessos externos"
  on public.normas_chunks as restrictive for all to authenticated
  using (public.mfa_satisfeita()) with check (public.mfa_satisfeita());
