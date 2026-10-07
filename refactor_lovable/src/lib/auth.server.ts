import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { diasParaSenhaVencer, senhaVencida } from "@/lib/senha";

export type Papel = Database["public"]["Enums"]["app_role"];

export type UsuarioAtual = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  /** sso = entra pela Microsoft; senha = externo (e-mail e senha). */
  tipo_acesso: "sso" | "senha";
  /** Senha provisória ou vencida: precisa ser trocada antes de usar o sistema. */
  deve_trocar_senha: boolean;
  /** Senha própria com mais de 90 dias (só externos); explica o motivo da troca. */
  senha_vencida: boolean;
  /** Dias até a senha vencer; null para quem entra pela Microsoft. */
  dias_para_senha_vencer: number | null;
  /** null = ainda não autorizado por um analista. */
  papel: Papel | null;
};

/**
 * Perfil + papel do usuário logado (substitui GET /api/me).
 * Recebe um client que age como o usuário: o RLS só devolve o próprio perfil.
 */
export async function getUsuarioAtual(
  db: SupabaseClient<Database>,
  userId: string,
): Promise<UsuarioAtual> {
  const [perfil, papeis] = await Promise.all([
    db
      .from("profiles")
      .select("id, nome, email, ativo, tipo_acesso, deve_trocar_senha, senha_alterada_em")
      .eq("id", userId)
      .single(),
    db.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (perfil.error) {
    throw new Error(`Perfil não encontrado: ${perfil.error.message}`);
  }
  if (papeis.error) {
    throw new Error(`Erro ao carregar o papel do usuário: ${papeis.error.message}`);
  }

  const roles = papeis.data.map((r) => r.role);
  const papel: Papel | null = roles.includes("analista")
    ? "analista"
    : roles.includes("auditor")
      ? "auditor"
      : null;

  const { senha_alterada_em, ...dados } = perfil.data;
  const vencida = senhaVencida(perfil.data);

  return {
    ...dados,
    deve_trocar_senha: dados.deve_trocar_senha || vencida,
    senha_vencida: vencida,
    dias_para_senha_vencer: dados.tipo_acesso === "senha" ? diasParaSenhaVencer(senha_alterada_em) : null,
    papel,
  };
}

/** Barra quem não é analista ativo (substitui require_analista nas server functions). */
export async function exigirAnalista(
  db: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data, error } = await db.rpc("is_analista", { _user_id: userId });
  if (error) {
    throw new Error(`Erro ao verificar permissão: ${error.message}`);
  }
  if (!data) {
    throw new Error("Acesso restrito a analistas.");
  }
}
