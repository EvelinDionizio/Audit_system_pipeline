import { z } from "zod";

/**
 * Política de senha dos acessos externos (usada no navegador e no servidor):
 *   - mínimo de 8 caracteres
 *   - pelo menos uma letra minúscula
 *   - pelo menos uma letra maiúscula
 *   - pelo menos um número
 * A troca a cada 90 dias entra no próximo passo.
 */

export const SENHA_TAMANHO_MINIMO = 8;

export type RegraSenha = { id: string; rotulo: string; ok: (senha: string) => boolean };

export const REGRAS_SENHA: RegraSenha[] = [
  { id: "tamanho", rotulo: `Pelo menos ${SENHA_TAMANHO_MINIMO} caracteres`, ok: (s) => s.length >= SENHA_TAMANHO_MINIMO },
  { id: "minuscula", rotulo: "Pelo menos uma letra minúscula", ok: (s) => /\p{Ll}/u.test(s) },
  { id: "maiuscula", rotulo: "Pelo menos uma letra maiúscula", ok: (s) => /\p{Lu}/u.test(s) },
  { id: "numero", rotulo: "Pelo menos um número", ok: (s) => /\d/.test(s) },
];

/** Primeira regra violada, em texto para o usuário; null se a senha é válida. */
export function validarSenha(senha: string): string | null {
  const violada = REGRAS_SENHA.find((r) => !r.ok(senha));
  return violada ? `A senha precisa ter: ${violada.rotulo.toLowerCase()}.` : null;
}

export const senhaSchema = z.string().superRefine((senha, ctx) => {
  const erro = validarSenha(senha);
  if (erro) ctx.addIssue({ code: "custom", message: erro });
});


// ── Senha temporária (só no servidor) ────────────────────────────────────────

// Sem caracteres ambíguos (I, l, O, 0, 1): a senha é passada ao externo por fora do sistema.
const MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz";
const NUMEROS = "23456789";
const TAMANHO_TEMPORARIA = 12;

/** Inteiro uniforme em [0, n) com crypto, sem viés de módulo. */
function sorteio(n: number): number {
  const limite = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while ((buf[0] as number) >= limite);
  return (buf[0] as number) % n;
}

const sortearDe = (alfabeto: string) => alfabeto.charAt(sorteio(alfabeto.length));

/** Senha temporária que já cumpre a política, com pelo menos um de cada tipo. */
export function gerarSenhaTemporaria(): string {
  const todos = MAIUSCULAS + MINUSCULAS + NUMEROS;
  const caracteres = [sortearDe(MAIUSCULAS), sortearDe(MINUSCULAS), sortearDe(NUMEROS)];
  while (caracteres.length < TAMANHO_TEMPORARIA) caracteres.push(sortearDe(todos));

  // Embaralha (Fisher-Yates) para a posição dos obrigatórios não ser previsível.
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = sorteio(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j] as string, caracteres[i] as string];
  }
  return caracteres.join("");
}
