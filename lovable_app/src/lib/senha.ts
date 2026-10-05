// Política de senha corporativa. Mantenha em sincronia com supabase/functions/_shared/senha.ts.

export const VALIDADE_SENHA_DIAS = 90;

export const REQUISITOS_SENHA = [
  { id: "len", rotulo: "Mínimo 8 caracteres", ok: (s: string) => s.length >= 8 },
  { id: "mai", rotulo: "Pelo menos uma letra maiúscula", ok: (s: string) => /[A-Z]/.test(s) },
  { id: "min", rotulo: "Pelo menos uma letra minúscula", ok: (s: string) => /[a-z]/.test(s) },
  { id: "num", rotulo: "Pelo menos um número", ok: (s: string) => /[0-9]/.test(s) },
];

export function validarForcaSenha(senha: string): string | null {
  if (senha.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (!/[A-Z]/.test(senha)) return "A senha deve conter pelo menos uma letra maiúscula.";
  if (!/[a-z]/.test(senha)) return "A senha deve conter pelo menos uma letra minúscula.";
  if (!/[0-9]/.test(senha)) return "A senha deve conter pelo menos um número.";
  return null;
}

export function diasAteExpirarSenha(alteradaEm: string | null | undefined, validade = VALIDADE_SENHA_DIAS): number {
  if (!alteradaEm) return 0;
  const alterada = new Date(alteradaEm);
  if (Number.isNaN(alterada.getTime())) return validade;
  const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((dia(alterada) + validade * 86_400_000 - dia(new Date())) / 86_400_000);
}
