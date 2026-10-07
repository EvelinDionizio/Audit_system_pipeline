/**
 * MFA (TOTP) dos acessos externos: parte compartilhada, sem dependência do
 * navegador nem do banco. O cadastro e a verificação do código ficam em
 * mfa-client.ts; a exigência vale no servidor (auth-middleware) e no banco
 * (policies restritivas da migration 20261006110000).
 */

export type NivelAal = "aal1" | "aal2";

/**
 * Nível de autenticação (claim `aal`) de um access token do Supabase.
 * aal1 = só a senha; aal2 = senha + código do autenticador.
 *
 * Só lê o payload: a assinatura já foi validada por auth.getUser(token) antes.
 * Qualquer token ilegível conta como aal1, ou seja, na dúvida o MFA é exigido.
 */
export function aalDoToken(token: string): NivelAal {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "aal1";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const claims = JSON.parse(json) as { aal?: unknown };
    return claims.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

/** Só contas com senha própria precisam de MFA; a Microsoft cuida do dos internos. */
export function mfaPendente(conta: { tipo_acesso: "sso" | "senha" }, aal: NivelAal): boolean {
  return conta.tipo_acesso === "senha" && aal !== "aal2";
}
