import { supabase } from "@/integrations/supabase/client";

/**
 * MFA TOTP dos acessos externos, no navegador (supabase.auth.mfa). Fica em
 * arquivo próprio, separado do auth-client.ts, que o Lovable regenera.
 *
 * O Supabase não oferece códigos de recuperação: quem perde o celular pede a
 * um analista para redefinir o MFA e cadastra o autenticador de novo.
 */

function traduzirErroMfa(mensagem: string, status: number | undefined): string {
  const m = mensagem.toLowerCase();
  if (status === 429 || m.includes("rate limit") || m.includes("too many")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }
  if (m.includes("invalid totp") || m.includes("invalid code") || m.includes("expired")) {
    return "Código inválido ou expirado. Confira o horário do celular e tente o código novo.";
  }
  if (m.includes("mfa") && (m.includes("disabled") || m.includes("not enabled"))) {
    return "O MFA não está ativado no sistema. Avise um analista.";
  }
  return mensagem;
}

/** Fator TOTP já confirmado, se houver (a lista `totp` só traz os verificados). */
export async function fatorTotpVerificado(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(traduzirErroMfa(error.message, error.status));
  return data.totp[0]?.id ?? null;
}

/**
 * Começa o cadastro: gera o segredo e o QR code. Cadastros largados no meio
 * (nunca confirmados) são descartados antes, senão atrapalham o novo.
 */
export async function iniciarCadastroTotp(): Promise<{ factorId: string; qrCode: string; segredo: string }> {
  const lista = await supabase.auth.mfa.listFactors();
  if (lista.error) throw new Error(traduzirErroMfa(lista.error.message, lista.error.status));
  for (const fator of lista.data.all) {
    if (fator.factor_type === "totp" && fator.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: fator.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Autenticador" });
  if (error) throw new Error(traduzirErroMfa(error.message, error.status));
  return { factorId: data.id, qrCode: data.totp.qr_code, segredo: data.totp.secret };
}

/** Confirma o código (cadastro novo ou login). Sucesso eleva a sessão para aal2. */
export async function confirmarCodigoTotp(factorId: string, codigo: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo.replace(/\s/g, "") });
  if (error) throw new Error(traduzirErroMfa(error.message, error.status));
}
