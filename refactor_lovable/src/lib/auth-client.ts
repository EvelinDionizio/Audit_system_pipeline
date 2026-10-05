import { supabase } from "@/integrations/supabase/client";

/** Só aceita caminhos internos ("/x"), evitando redirecionamento para outro site. */
export function destinoSeguro(destino: string | undefined): string {
  return destino && destino.startsWith("/") && !destino.startsWith("//") ? destino : "/";
}

export async function obterSessao() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Inicia o login com a conta Microsoft (Entra ID). O navegador sai do app e
 * volta em /auth?redirect=<destino>, onde a sessão é detectada.
 */
export async function entrarComMicrosoft(destino: string): Promise<void> {
  const retorno = new URL("/auth", window.location.origin);
  retorno.searchParams.set("redirect", destinoSeguro(destino));

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: { scopes: "email", redirectTo: retorno.toString() },
  });
  if (error) {
    throw error;
  }
}

/**
 * Login por e-mail e senha: SÓ no ambiente local (VITE_LOGIN_TESTE=true, ver
 * scripts/local.sh), para os usuários de teste. Em produção o provedor de
 * e-mail fica desligado no Supabase e o formulário nem aparece.
 */
export const loginTesteHabilitado = import.meta.env["VITE_LOGIN_TESTE"] === "true";

export async function entrarComSenha(email: string, senha: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    throw error;
  }
}

/** Erro do authMiddleware (auth-middleware.ts) quando o servidor recusa a sessão. */
export function ehErroDeSessao(e: unknown): boolean {
  const mensagem = e instanceof Error ? e.message : "";
  return mensagem === "Não autenticado." || mensagem === "Sessão inválida ou expirada.";
}

export async function sair(): Promise<void> {
  await supabase.auth.signOut();
}
