import { describe, expect, test } from "bun:test";
import { aalDoToken, mfaPendente } from "../src/lib/mfa";
import { diasParaSenhaVencer, senhaVencida } from "../src/lib/senha";

const token = (claims: object) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(claims)}.assinatura`;
};

describe("MFA: nível do token", () => {
  test("aal2 só quando o claim diz aal2", () => {
    expect(aalDoToken(token({ aal: "aal2" }))).toBe("aal2");
    expect(aalDoToken(token({ aal: "aal1" }))).toBe("aal1");
  });

  test("sem claim, token quebrado ou vazio contam como aal1", () => {
    expect(aalDoToken(token({}))).toBe("aal1");
    expect(aalDoToken(token({ aal: "AAL2" }))).toBe("aal1");
    expect(aalDoToken("lixo")).toBe("aal1");
    expect(aalDoToken("a.%%%.c")).toBe("aal1");
    expect(aalDoToken("")).toBe("aal1");
  });

  test("externo sem aal2 está pendente; com aal2 não; SSO nunca", () => {
    expect(mfaPendente({ tipo_acesso: "senha" }, "aal1")).toBe(true);
    expect(mfaPendente({ tipo_acesso: "senha" }, "aal2")).toBe(false);
    expect(mfaPendente({ tipo_acesso: "sso" }, "aal1")).toBe(false);
  });
});

describe("Senha: validade de 90 dias", () => {
  const agora = new Date("2026-10-06T12:00:00Z");
  const haDias = (n: number) => new Date(agora.getTime() - n * 864e5).toISOString();

  test("vence depois de 90 dias, não antes", () => {
    expect(senhaVencida({ tipo_acesso: "senha", senha_alterada_em: haDias(89) }, agora)).toBe(false);
    expect(senhaVencida({ tipo_acesso: "senha", senha_alterada_em: haDias(91) }, agora)).toBe(true);
  });

  test("sem data de troca conta como vencida; SSO nunca vence", () => {
    expect(senhaVencida({ tipo_acesso: "senha", senha_alterada_em: null }, agora)).toBe(true);
    expect(senhaVencida({ tipo_acesso: "sso", senha_alterada_em: haDias(200) }, agora)).toBe(false);
  });

  test("dias restantes", () => {
    expect(diasParaSenhaVencer(haDias(80), agora)).toBe(10);
  });
});
