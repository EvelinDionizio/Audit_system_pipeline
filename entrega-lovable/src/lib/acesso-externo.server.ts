import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { gerarSenhaTemporaria, validarSenha } from "@/lib/senha";

/**
 * Acesso de auditores externos (e-mail pessoal + senha, sem SSO).
 *
 * Tudo aqui roda no servidor, com o client admin (service_role): o analista
 * cria e redefine contas; o externo troca a própria senha depois de provar que
 * conhece a atual. A política de senha é aplicada aqui, e não só na tela, para
 * não depender de configuração do painel do Supabase.
 */

type Db = SupabaseClient<Database>;

const normalizarEmail = (email: string) => email.trim().toLowerCase();

/** Client anônimo descartável, só para conferir a senha atual (nunca guarda sessão). */
function criarClienteAnonimo(): Db {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const chave = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !chave) {
    throw new Error("SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY não estão configurados.");
  }
  // As chaves novas do Supabase (sb_publishable_…) não são JWT e não podem ir em Authorization.
  const chaveOpaca = chave.startsWith("sb_publishable_");

  return createClient<Database>(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (chaveOpaca && headers.get("Authorization") === `Bearer ${chave}`) headers.delete("Authorization");
        headers.set("apikey", chave);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function traduzirErroDeConta(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("already been registered") || m.includes("already registered") || m.includes("email_exists")) {
    return "Já existe um usuário com este e-mail.";
  }
  if (m.includes("different from the old password") || m.includes("same_password")) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
    return "O provedor de e-mail e senha está desligado no Supabase. Ative o login por e-mail (sem cadastro público).";
  }
  return mensagem;
}


// ── Analista: criar e redefinir ──────────────────────────────────────────────

/**
 * Cria o acesso nominal de um externo. Devolve a senha temporária, que só
 * existe nesta resposta: o analista a repassa ao externo por fora do sistema.
 */
export async function criarAcessoExterno(
  admin: Db,
  analistaId: string,
  dados: { nome: string; email: string },
): Promise<{ senhaTemporaria: string }> {
  const email = normalizarEmail(dados.email);
  const nome = dados.nome.trim();

  const existente = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existente.error) throw new Error(`Erro ao verificar o e-mail: ${existente.error.message}`);
  if (existente.data) throw new Error("Já existe um usuário com este e-mail.");

  // O pré-cadastro vem primeiro: é ele que faz o trigger ativar o perfil e aplicar o papel.
  const cadastro = await admin
    .from("usuarios_autorizados")
    .insert({ email, nome, perfil: "auditor", tipo_acesso: "senha", criado_por: analistaId });
  if (cadastro.error) {
    throw new Error(
      cadastro.error.code === "23505"
        ? "Este e-mail já está pré-cadastrado."
        : `Erro ao cadastrar o acesso: ${cadastro.error.message}`,
    );
  }

  const senhaTemporaria = gerarSenhaTemporaria();
  const conta = await admin.auth.admin.createUser({
    email,
    password: senhaTemporaria,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });
  if (conta.error) {
    // Desfaz o pré-cadastro para não deixar um acesso "fantasma".
    await admin.from("usuarios_autorizados").delete().eq("email", email);
    throw new Error(traduzirErroDeConta(conta.error.message));
  }

  return { senhaTemporaria };
}

/** Gera nova senha temporária para um externo (esqueceu a senha). */
export async function redefinirSenhaExterno(admin: Db, email: string): Promise<{ senhaTemporaria: string }> {
  const perfil = await admin
    .from("profiles")
    .select("id, tipo_acesso")
    .eq("email", normalizarEmail(email))
    .maybeSingle();
  if (perfil.error) throw new Error(`Erro ao buscar o usuário: ${perfil.error.message}`);
  if (!perfil.data) throw new Error("Usuário não encontrado.");
  if (perfil.data.tipo_acesso !== "senha") {
    throw new Error("Só contas de acesso externo têm senha própria; este usuário entra pela Microsoft.");
  }

  const senhaTemporaria = gerarSenhaTemporaria();
  const troca = await admin.auth.admin.updateUserById(perfil.data.id, { password: senhaTemporaria });
  if (troca.error) throw new Error(traduzirErroDeConta(troca.error.message));

  // O trigger de troca de senha zera a flag; como esta senha é temporária, marca de novo.
  const marca = await admin.from("profiles").update({ deve_trocar_senha: true }).eq("id", perfil.data.id);
  if (marca.error) throw new Error(`Senha redefinida, mas não foi possível exigir a troca: ${marca.error.message}`);

  return { senhaTemporaria };
}


/**
 * Remove os autenticadores de um externo (perdeu o celular). No próximo login ele
 * cadastra um novo; até lá, o banco e o servidor seguem exigindo o MFA.
 */
export async function redefinirMfaExterno(admin: Db, email: string): Promise<{ removidos: number }> {
  const perfil = await admin
    .from("profiles")
    .select("id, tipo_acesso")
    .eq("email", normalizarEmail(email))
    .maybeSingle();
  if (perfil.error) throw new Error(`Erro ao buscar o usuário: ${perfil.error.message}`);
  if (!perfil.data) throw new Error("Usuário não encontrado.");
  if (perfil.data.tipo_acesso !== "senha") {
    throw new Error("Só contas de acesso externo têm MFA próprio; este usuário entra pela Microsoft.");
  }

  const userId = perfil.data.id;
  const lista = await admin.auth.admin.mfa.listFactors({ userId });
  if (lista.error) throw new Error(`Erro ao listar os autenticadores: ${lista.error.message}`);

  for (const fator of lista.data.factors) {
    const remocao = await admin.auth.admin.mfa.deleteFactor({ id: fator.id, userId });
    if (remocao.error) throw new Error(`Erro ao remover o autenticador: ${remocao.error.message}`);
  }
  return { removidos: lista.data.factors.length };
}


// ── Externo: trocar a própria senha ──────────────────────────────────────────

export async function alterarSenhaPropria(
  admin: Db,
  dados: { userId: string; atual: string; nova: string },
): Promise<{ ok: true }> {
  const erroPolitica = validarSenha(dados.nova);
  if (erroPolitica) throw new Error(erroPolitica);
  if (dados.nova === dados.atual) throw new Error("A nova senha precisa ser diferente da atual.");

  const perfil = await admin.from("profiles").select("email, tipo_acesso").eq("id", dados.userId).maybeSingle();
  if (perfil.error) throw new Error(`Erro ao buscar o usuário: ${perfil.error.message}`);
  if (!perfil.data) throw new Error("Usuário não encontrado.");
  if (perfil.data.tipo_acesso !== "senha") {
    throw new Error("Sua conta entra pela Microsoft; a senha é gerenciada por ela.");
  }

  // Prova que quem está trocando conhece a senha atual (sessão roubada não basta).
  const conferencia = await criarClienteAnonimo().auth.signInWithPassword({
    email: perfil.data.email,
    password: dados.atual,
  });
  if (conferencia.error) throw new Error("Senha atual incorreta.");

  const troca = await admin.auth.admin.updateUserById(dados.userId, { password: dados.nova });
  if (troca.error) throw new Error(traduzirErroDeConta(troca.error.message));

  return { ok: true };
}
