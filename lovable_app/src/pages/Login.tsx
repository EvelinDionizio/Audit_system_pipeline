import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buscarUsuario, useAuth } from "@/contexts/AuthContext";
import { invocar } from "@/lib/api";
import { diasAteExpirarSenha, REQUISITOS_SENHA, validarForcaSenha } from "@/lib/senha";

type Painel = "login" | "p1" | "p2";
type TipoAlerta = "erro" | "aviso" | "ok";
interface Alerta { msg: string; tipo: TipoAlerta }

const ESTILO_ALERTA: Record<TipoAlerta, string> = {
  erro: "bg-bh-vermelho-lt border-red-200 text-bh-vermelho",
  aviso: "bg-amber-100 border-amber-300 text-amber-800",
  ok: "bg-bh-verde-lt border-green-200 text-bh-verde",
};

const inputCls =
  "w-full rounded-lg border-[1.5px] border-bh-borda px-3.5 py-[11px] text-sm text-bh-texto outline-none transition focus:border-bh-azul-md";
const btnPrimario =
  "mt-2 w-full rounded-lg bg-bh-azul py-[13px] text-[15px] font-semibold text-white transition hover:bg-bh-azul-md disabled:cursor-not-allowed disabled:bg-bh-borda disabled:text-bh-cinza";

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { sair } = useAuth();
  const [painel, setPainel] = useState<Painel>("login");
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const [entrando, setEntrando] = useState(false);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [rdEmail, setRdEmail] = useState("");
  const [rdAtual, setRdAtual] = useState("");
  const [rdNova, setRdNova] = useState("");
  const [rdConfirma, setRdConfirma] = useState("");
  const novaRef = useRef<HTMLInputElement>(null);

  // Redirecionado pelo ProtectedRoute com a senha expirada
  useEffect(() => {
    if (params.get("expirada") !== "1") return;
    supabase.auth.getSession().then(({ data }) => {
      setPainel("p1");
      setRdEmail(data.session?.user.email ?? "");
      setAlerta({ msg: "Sua senha expirou. Redefina-a agora para continuar.", tipo: "aviso" });
    });
  }, [params]);

  function mostrarPainel(p: Painel) {
    setPainel(p);
    setAlerta(null);
  }

  function voltarLogin() {
    mostrarPainel("login");
    setRdNova("");
    setRdConfirma("");
  }

  // ── LOGIN ────────────────────────────────────────────────────────────────
  async function entrar() {
    const e = email.trim();
    if (!e || !senha) return setAlerta({ msg: "Preencha e-mail e senha.", tipo: "erro" });
    setEntrando(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: e, password: senha });
      if (error || !data.user) {
        if (error?.message === "Failed to fetch") return setAlerta({ msg: "Não foi possível conectar ao servidor.", tipo: "erro" });
        return setAlerta({ msg: "E-mail ou senha incorretos.", tipo: "erro" });
      }
      const usuario = await buscarUsuario(data.user.id);
      if (!usuario || !usuario.ativo) {
        await sair();
        return setAlerta({ msg: "E-mail ou senha incorretos.", tipo: "erro" });
      }

      const destino = usuario.perfil === "analista" ? "/analista" : "/";
      const dias = diasAteExpirarSenha(usuario.senha_alterada_em);

      if (dias < 0) {
        setAlerta({ msg: "Sua senha expirou. Redefina-a agora para continuar.", tipo: "aviso" });
        setTimeout(() => {
          setPainel("p1");
          setRdEmail(e);
          setRdAtual(senha);
        }, 1800);
        return;
      }
      if (dias <= 10) {
        setAlerta({ msg: `Sua senha expira em ${dias} dia(s). Redefina-a em breve.`, tipo: "aviso" });
        setTimeout(() => navigate(destino, { replace: true }), 3000);
        return;
      }
      navigate(destino, { replace: true });
    } finally {
      setEntrando(false);
    }
  }

  // ── PASSO 1 — verificar identidade ───────────────────────────────────────
  async function verificarIdentidade() {
    setAlerta(null);
    const e = rdEmail.trim();
    if (!e || !rdAtual) return setAlerta({ msg: "Preencha e-mail e senha atual.", tipo: "erro" });
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: rdAtual });
    if (error) return setAlerta({ msg: "E-mail ou senha atual incorretos.", tipo: "erro" });
    mostrarPainel("p2");
    setTimeout(() => novaRef.current?.focus(), 0);
  }

  // ── PASSO 2 — nova senha ─────────────────────────────────────────────────
  async function salvarNovaSenha() {
    setAlerta(null);
    if (!rdNova || !rdConfirma) return setAlerta({ msg: "Preencha os dois campos.", tipo: "erro" });
    const erroPolitica = validarForcaSenha(rdNova);
    if (erroPolitica) return setAlerta({ msg: erroPolitica, tipo: "erro" });
    if (rdNova !== rdConfirma) return setAlerta({ msg: "As senhas não coincidem.", tipo: "erro" });
    if (rdNova === rdAtual) return setAlerta({ msg: "A nova senha não pode ser igual à senha atual.", tipo: "erro" });
    try {
      await invocar("alterar-senha", { senha_atual: rdAtual, nova_senha: rdNova });
      setAlerta({ msg: "✓ Senha alterada com sucesso! Redirecionando…", tipo: "ok" });
      setTimeout(async () => {
        await sair();
        setSenha("");
        setRdAtual("");
        voltarLogin();
      }, 2000);
    } catch (err) {
      setAlerta({ msg: (err as Error).message || "Erro ao alterar senha.", tipo: "erro" });
    }
  }

  function onEnter(ev: KeyboardEvent) {
    if (ev.key !== "Enter") return;
    if (painel === "login") entrar();
    else if (painel === "p1") verificarIdentidade();
    else salvarNovaSenha();
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-bh-azul to-bh-azul-md p-5"
      onKeyDown={onEnter}
    >
      <div className="w-full max-w-[400px] rounded-2xl bg-white px-9 py-10 shadow-[0_20px_60px_rgba(0,0,0,.25)]">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[10px] bg-bh-azul">
            <ClipboardList className="h-[22px] w-[22px] text-white" />
          </div>
          <div>
            <div className="text-lg font-bold text-bh-azul">Bernhoeft</div>
            <div className="mt-0.5 text-xs text-bh-cinza">Sistema de Auditoria</div>
          </div>
        </div>

        {painel !== "login" && (
          <button type="button" onClick={voltarLogin} className="mb-5 text-[13px] text-bh-cinza hover:text-bh-azul">
            ← Voltar ao login
          </button>
        )}
        {painel === "p1" && <StepLabel>Passo 1 de 2 — Verificar identidade</StepLabel>}
        {painel === "p2" && <StepLabel>Passo 2 de 2 — Nova senha</StepLabel>}

        <h1 className="mb-1.5 text-xl font-bold text-bh-azul">
          {painel === "login" ? "Entrar na plataforma" : painel === "p1" ? "Redefinir senha" : "Escolha sua nova senha"}
        </h1>
        <p className="mb-6 text-[13px] text-bh-cinza">
          {painel === "login" ? "Use suas credenciais para acessar." : painel === "p1" ? "Confirme seu e-mail e senha atual." : "Siga a política de senha corporativa."}
        </p>

        {alerta && (
          <div className={`mb-3.5 rounded-lg border px-3.5 py-[11px] text-[13px] leading-normal ${ESTILO_ALERTA[alerta.tipo]}`}>
            {alerta.msg}
          </div>
        )}

        {painel === "login" && (
          <>
            <Campo rotulo="E-mail"><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" /></Campo>
            <Campo rotulo="Senha"><input className={inputCls} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></Campo>
            <button type="button" className={btnPrimario} onClick={entrar} disabled={entrando}>{entrando ? "Entrando…" : "Entrar"}</button>
            <button type="button" onClick={() => mostrarPainel("p1")} className="mt-3.5 block w-full text-center text-[13px] text-bh-cinza hover:text-bh-azul-md">
              Esqueceu a senha?
            </button>
          </>
        )}

        {painel === "p1" && (
          <>
            <Campo rotulo="E-mail"><input className={inputCls} type="email" value={rdEmail} onChange={(e) => setRdEmail(e.target.value)} placeholder="seu@email.com" /></Campo>
            <Campo rotulo="Senha atual"><input className={inputCls} type="password" value={rdAtual} onChange={(e) => setRdAtual(e.target.value)} placeholder="••••••••" /></Campo>
            <button type="button" className={btnPrimario} onClick={verificarIdentidade}>Continuar →</button>
          </>
        )}

        {painel === "p2" && (
          <>
            <div className="mb-3.5 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-3 text-xs leading-[1.7] text-sky-700">
              <strong>Política de senha corporativa:</strong><br />
              A nova senha deve seguir todos os critérios abaixo:<br />
              • Mínimo de 8 caracteres<br />
              • Pelo menos uma letra maiúscula (A–Z)<br />
              • Pelo menos uma letra minúscula (a–z)<br />
              • Pelo menos um número (0–9)<br />
              • Não pode ser igual à senha anterior<br />
              • Deve ser redefinida a cada 90 dias
            </div>
            <Campo rotulo="Nova senha">
              <input ref={novaRef} className={inputCls} type="password" value={rdNova} onChange={(e) => setRdNova(e.target.value)} placeholder="Mínimo 8 caracteres" />
              <div className="mt-1.5 rounded-md bg-gray-50 px-2.5 py-2 text-[11px] leading-relaxed text-bh-cinza">
                {REQUISITOS_SENHA.map((r) => (
                  <div key={r.id} className={r.ok(rdNova) ? "text-bh-verde" : ""}>{r.ok(rdNova) ? "✓" : "○"} {r.rotulo}</div>
                ))}
              </div>
            </Campo>
            <Campo rotulo="Confirmar nova senha"><input className={inputCls} type="password" value={rdConfirma} onChange={(e) => setRdConfirma(e.target.value)} placeholder="Repita a nova senha" /></Campo>
            <button type="button" className={btnPrimario} onClick={salvarNovaSenha}>Salvar nova senha</button>
          </>
        )}
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-[5px] block text-xs font-semibold text-bh-texto">{rotulo}</span>
      {children}
    </label>
  );
}

function StepLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-bh-cinza">{children}</div>;
}
