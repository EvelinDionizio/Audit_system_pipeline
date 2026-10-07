import { supabase } from "@/integrations/supabase/client";

/** Modo demonstração (VITE_MODO_DEMO=true): login fictício e banco SQLite local. */
export const MODO_DEMO = import.meta.env["VITE_MODO_DEMO"] === "true";

const CHAVE_DEMO = "auditoria-demo-usuario";

/** Só aceita caminhos internos ("/x"), evitando redirecionamento para outro site. */
export function destinoSeguro(destino: string | undefined): string {
  return destino && destino.startsWith("/") && !destino.startsWith("//") ? destino : "/";
}

export async function obterSessao(): Promise<{ access_token: string } | null> {
  if (MODO_DEMO) {
    const id = typeof window === "undefined" ? null : window.localStorage.getItem(CHAVE_DEMO);
    return id ? { access_token: `demo:${id}` } : null;
  }
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

/** Modo demonstração: guarda o usuário fictício escolhido na tela de login. */
export function guardarSessaoDemo(profileId: string): void {
  window.localStorage.setItem(CHAVE_DEMO, profileId);
}

export async function sair(): Promise<void> {
  if (MODO_DEMO) {
    window.localStorage.removeItem(CHAVE_DEMO);
    return;
  }
  await supabase.auth.signOut();
}
