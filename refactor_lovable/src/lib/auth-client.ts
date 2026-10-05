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

export async function sair(): Promise<void> {
  await supabase.auth.signOut();
}
