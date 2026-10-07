import { supabase } from "@/integrations/supabase/client";

/**
 * Login de externos com e-mail e senha. Fica em arquivo próprio, separado do
 * auth-client.ts, porque o Lovable mantém e regenera o login Microsoft ali.
 */

function traduzirErroDeLogin(mensagem: string, status: number | undefined): string {
  const m = mensagem.toLowerCase();
  if (status === 429 || m.includes("rate limit") || m.includes("too many")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }
  if (m.includes("email logins are disabled") || m.includes("provider is disabled")) {
    return "O login por e-mail e senha não está ativado no sistema. Avise um analista.";
  }
  // Mesma mensagem para e-mail inexistente e senha errada: não revela quais contas existem.
  return "E-mail ou senha incorretos.";
}

export async function entrarComSenha(email: string, senha: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: senha,
  });
  if (error) {
    throw new Error(traduzirErroDeLogin(error.message, error.status));
  }
}
