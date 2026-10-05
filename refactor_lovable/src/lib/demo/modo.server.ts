/**
 * Modo demonstração: banco SQLite local, login fictício e auditorias de
 * exemplo. Só para apresentar o sistema na máquina local.
 *
 * Liga com MODO_DEMO=true (ver .env.demo e `bun run demo`). Nunca liga em
 * hospedagem: na Vercel a variável é ignorada com erro.
 */
export function modoDemo(): boolean {
  if (process.env["MODO_DEMO"] !== "true") return false;
  if (process.env["VERCEL"]) {
    throw new Error("MODO_DEMO não pode ser usado em hospedagem (Vercel). Remova a variável.");
  }
  return true;
}

/** Prefixo do token de sessão fictícia: "demo:<id do perfil>". */
export const PREFIXO_TOKEN_DEMO = "demo:";
