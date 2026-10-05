import type { Database } from "@/integrations/supabase/types";
import { criarClienteAdmin } from "@/lib/supabase-admin.server";

type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Pré-cadastra (ou promove) um usuário em `usuarios_autorizados`.
 *
 * Não cria conta nem senha: o login é só com a Microsoft. O trigger
 * `aplicar_autorizacao` ativa o perfil e aplica o papel no primeiro login, ou
 * na hora, se a pessoa já tiver entrado alguma vez.
 */
export async function autorizarUsuarioInicial(dados: { email: string; nome: string; perfil: AppRole }) {
  const admin = criarClienteAdmin();
  const email = dados.email.trim().toLowerCase();

  const { error } = await admin
    .from("usuarios_autorizados")
    .upsert({ email, nome: dados.nome, perfil: dados.perfil }, { onConflict: "email" });
  if (error) throw new Error(`Falha ao autorizar ${email}: ${error.message}`);

  const { data: perfil, error: erroPerfil } = await admin
    .from("profiles")
    .select("id, ativo")
    .eq("email", email)
    .maybeSingle();
  if (erroPerfil) throw new Error(`Falha ao ler o perfil de ${email}: ${erroPerfil.message}`);

  return {
    email,
    nome: dados.nome,
    perfil: dados.perfil,
    situacao: perfil
      ? perfil.ativo
        ? "ativo: já pode usar o sistema com este papel"
        : "perfil existe mas está inativo"
      : "aguardando o 1º login com a conta Microsoft",
  };
}
