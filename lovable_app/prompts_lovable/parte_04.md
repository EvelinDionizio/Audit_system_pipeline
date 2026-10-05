Parte 4 de 11 — backend (edge functions). Crie os 2 arquivos abaixo com exatamente este conteúdo. Não corrija erros de build ainda; responda apenas "Parte 4 recebida" com a lista de arquivos.

### `supabase/functions/admin-usuarios/index.ts`

````ts
// POST /admin-usuarios — gestão de usuários pelo analista.
// Porta de POST/PATCH/DELETE /api/usuarios* (review_api.py).
//
// Corpo: { "acao": "criar" | "atualizar" | "perfil" | "excluir", ... }
//   criar:     { nome, email, senha, perfil }
//   atualizar: { uid, ativo?, nome?, email? }
//   perfil:    { uid, perfil }
//   excluir:   { uid }
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, type Perfil, requireUser } from "../_shared/auth.ts";
import { HttpError, json, lerCorpo, serve } from "../_shared/http.ts";
import { validarForcaSenha } from "../_shared/senha.ts";

// Desativação = perfil inativo + usuário banido no Auth (bloqueia login e refresh de sessão).
const BAN_INDEFINIDO = "876000h";

interface Corpo {
  acao: "criar" | "atualizar" | "perfil" | "excluir";
  uid?: string;
  nome?: string;
  email?: string;
  senha?: string;
  perfil?: Perfil;
  ativo?: boolean;
}

async function perfilDe(admin: SupabaseClient, uid: string): Promise<Perfil | null> {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", uid).maybeSingle();
  return (data?.role as Perfil) ?? null;
}

async function totalAnalistasAtivos(admin: SupabaseClient): Promise<number> {
  const { count } = await admin
    .from("user_roles")
    .select("user_id, profiles!inner(ativo)", { count: "exact", head: true })
    .eq("role", "analista")
    .eq("profiles.ativo", true);
  return count ?? 0;
}

async function garantirNaoEhUltimoAnalista(admin: SupabaseClient, uid: string, mensagem: string) {
  if ((await perfilDe(admin, uid)) === "analista" && (await totalAnalistasAtivos(admin)) <= 1) {
    throw new HttpError(400, mensagem);
  }
}

serve(async (req) => {
  const user = await requireUser(req, { analista: true });
  const corpo = await lerCorpo<Corpo>(req);
  const admin = adminClient();

  switch (corpo.acao) {
    case "criar": {
      const nome = corpo.nome?.trim();
      const email = corpo.email?.trim().toLowerCase();
      const perfil: Perfil = corpo.perfil === "analista" ? "analista" : "auditor";
      if (!nome || !email || !corpo.senha) throw new HttpError(400, "Preencha todos os campos.");
      // O original não validava a política de senha na criação pelo painel.
      const erroSenha = validarForcaSenha(corpo.senha);
      if (erroSenha) throw new HttpError(400, erroSenha);

      const { data: existente } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
      if (existente) throw new HttpError(400, "E-mail já cadastrado.");

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: corpo.senha,
        email_confirm: true,
        user_metadata: { nome },
      });
      if (error || !data.user) throw new HttpError(400, error?.message ?? "Erro ao criar usuário.");

      // O trigger handle_new_user cria o perfil como 'auditor'
      if (perfil === "analista") {
        await admin.from("user_roles").update({ role: "analista" }).eq("user_id", data.user.id);
      }
      return json({ id: data.user.id, nome, email, perfil });
    }

    case "atualizar": {
      const uid = corpo.uid;
      if (!uid) throw new HttpError(400, "Campo 'uid' obrigatório.");
      const updates: Record<string, unknown> = {};
      if (corpo.nome !== undefined) updates.nome = corpo.nome.trim();
      if (corpo.email !== undefined) updates.email = corpo.email.trim().toLowerCase();

      if (corpo.ativo !== undefined) {
        if (!corpo.ativo) {
          // Proteções novas, análogas às da exclusão
          if (uid === user.id) throw new HttpError(400, "Você não pode desativar sua própria conta.");
          await garantirNaoEhUltimoAnalista(admin, uid, "Não é possível desativar o único analista ativo do sistema.");
        }
        updates.ativo = corpo.ativo;
        const { error } = await admin.auth.admin.updateUserById(uid, {
          ban_duration: corpo.ativo ? "none" : BAN_INDEFINIDO,
        });
        if (error) throw new HttpError(400, error.message);
      }
      if (updates.email) {
        const { error } = await admin.auth.admin.updateUserById(uid, {
          email: updates.email as string,
          email_confirm: true,
        });
        if (error) throw new HttpError(400, error.message);
      }
      if (Object.keys(updates).length) {
        const { error } = await admin.from("profiles").update(updates).eq("id", uid);
        if (error) throw new HttpError(400, error.message);
      }
      return json({ status: "ok" });
    }

    case "perfil": {
      const uid = corpo.uid;
      const novo = corpo.perfil;
      if (!uid) throw new HttpError(400, "Campo 'uid' obrigatório.");
      if (!novo) throw new HttpError(400, "Campo 'perfil' obrigatório.");
      if (novo !== "auditor" && novo !== "analista") throw new HttpError(400, "Perfil inválido.");
      if (uid === user.id && novo === "auditor") {
        throw new HttpError(400, "Você não pode rebaixar sua própria conta.");
      }
      if (novo === "auditor") {
        await garantirNaoEhUltimoAnalista(admin, uid, "Não é possível rebaixar o único analista ativo do sistema.");
      }
      const { error } = await admin.from("user_roles").update({ role: novo }).eq("user_id", uid);
      if (error) throw new HttpError(400, error.message);
      return json({ status: "ok" });
    }

    case "excluir": {
      const uid = corpo.uid;
      if (!uid) throw new HttpError(400, "Campo 'uid' obrigatório.");
      if (uid === user.id) throw new HttpError(400, "Você não pode excluir sua própria conta.");
      await garantirNaoEhUltimoAnalista(admin, uid, "Não é possível excluir o único analista ativo do sistema.");
      // profiles/user_roles caem em cascata; auditorias/tokens ficam com usuario_id = null
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) throw new HttpError(400, error.message);
      return json({ status: "ok" });
    }

    default:
      throw new HttpError(400, "Ação inválida.");
  }
});
````
### `supabase/functions/alterar-senha/index.ts`

````ts
// POST /alterar-senha — porta de POST /api/alterar-senha.
// Corpo: { "senha_atual": "...", "nova_senha": "..." }
// Funciona com a senha expirada (é exatamente quando ela é necessária).
import { adminClient, anonClient, requireUser } from "../_shared/auth.ts";
import { HttpError, json, lerCorpo, serve } from "../_shared/http.ts";
import { validarForcaSenha } from "../_shared/senha.ts";

serve(async (req) => {
  const user = await requireUser(req, { permitirSenhaExpirada: true });
  const { senha_atual, nova_senha } = await lerCorpo<{ senha_atual: string; nova_senha: string }>(req);

  const { error: erroLogin } = await anonClient().auth.signInWithPassword({
    email: user.email,
    password: senha_atual ?? "",
  });
  if (erroLogin) throw new HttpError(400, "Senha atual incorreta.");

  const erro = validarForcaSenha(nova_senha ?? "");
  if (erro) throw new HttpError(400, erro);
  if (nova_senha === senha_atual) throw new HttpError(400, "A nova senha não pode ser igual à senha atual.");

  const admin = adminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: nova_senha });
  if (error) throw new HttpError(400, error.message);

  await admin.from("profiles").update({ senha_alterada_em: new Date().toISOString() }).eq("id", user.id);
  return json({ status: "Senha alterada com sucesso." });
});
````
