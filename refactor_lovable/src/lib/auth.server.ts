import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Papel = Database["public"]["Enums"]["app_role"];

export type UsuarioAtual = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
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
    db.from("profiles").select("id, nome, email, ativo").eq("id", userId).single(),
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

  return { ...perfil.data, papel };
}
