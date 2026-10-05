Parte 10 de 11 — frontend. Crie os 5 arquivos abaixo com exatamente este conteúdo. Não corrija erros de build ainda; responda apenas "Parte 10 recebida" com a lista de arquivos.

### `src/pages/Login.tsx`

````tsx
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
````
### `src/pages/Revisao.tsx`

````tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList, Info } from "lucide-react";
import { AppHeader, HeaderLink, LogoRevisao } from "@/components/AppHeader";
import { ModalAlterarSenha } from "@/components/ModalAlterarSenha";
import { Spinner } from "@/components/Estado";
import { ResultadoRevisao } from "@/components/revisao/ResultadoRevisao";
import { useAuth } from "@/contexts/AuthContext";
import { invocar } from "@/lib/api";
import type { ResultadoRevisao as Resultado } from "@/lib/types";

export default function Revisao() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // O botão "Revisar →" do painel envia ?id= (no original o prefill era gravado mas nunca lido)
  const [idTexto, setIdTexto] = useState(params.get("id") ?? "");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [modalSenha, setModalSenha] = useState(false);
  // Nova chave a cada revisão: reinicia filtros/acordeões mesmo quando o ID é o mesmo
  const [versao, setVersao] = useState(0);
  const resultadoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (resultado) resultadoRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [resultado]);

  async function solicitar() {
    const raw = idTexto.trim();
    if (!raw) return setErro("Digite o número da aplicação.");
    const id = parseInt(raw.replace("#", ""), 10);
    if (Number.isNaN(id)) return setErro("Número inválido.");

    setErro(null);
    setResultado(null);
    setCarregando(true);
    try {
      setResultado(await invocar<Resultado>("revisar", { evaluation_id: id }));
      setVersao((v) => v + 1);
    } catch (e) {
      setErro((e as Error).message || "Erro na requisição.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-bh-texto">
      <AppHeader titulo="Revisão de Auditoria" icone={<LogoRevisao />}>
        {usuario?.perfil === "analista" && <HeaderLink onClick={() => navigate("/analista")}>Painel →</HeaderLink>}
        <HeaderLink onClick={() => setModalSenha(true)} className="text-xs text-white/55">🔑 Senha</HeaderLink>
      </AppHeader>

      <div className="mx-auto max-w-[680px] px-4 pb-16 pt-6">
        <div className="mb-4 rounded-[10px] border border-bh-borda bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-[15px] font-semibold text-bh-azul">Solicitar revisão</h2>
          <p className="mb-4 text-[13px] leading-normal text-bh-cinza">
            No app do Checklist Fácil, acesse <strong>Detalhes do checklist</strong> e copie o número da{" "}
            <strong>Aplicação atual</strong> (ex: #123456789).
          </p>
          <div className="flex gap-2.5 max-[480px]:flex-col">
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={idTexto}
              placeholder="123456789"
              onChange={(e) => setIdTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && solicitar()}
              className="flex-1 rounded-lg border-[1.5px] border-bh-borda px-3.5 py-[11px] text-xl font-semibold tracking-[2px] text-bh-azul outline-none transition focus:border-bh-azul-md"
            />
            <button
              type="button"
              onClick={solicitar}
              disabled={carregando}
              className="flex items-center justify-center gap-[7px] whitespace-nowrap rounded-lg bg-bh-azul px-5 py-[11px] text-sm font-semibold text-white transition hover:bg-bh-azul-md disabled:cursor-not-allowed disabled:bg-bh-borda disabled:text-bh-cinza"
            >
              <ClipboardList className="h-[15px] w-[15px]" strokeWidth={2.5} /> Revisar
            </button>
          </div>
          <div className="mt-2.5 flex items-center gap-[5px] text-xs text-bh-cinza">
            <Info className="h-3 w-3" /> Digite apenas os números, sem o # inicial
          </div>
        </div>

        {erro && (
          <div className="mb-3.5 rounded-[10px] border border-red-200 bg-bh-vermelho-lt px-4 py-3.5 text-[13px] leading-normal text-bh-vermelho">{erro}</div>
        )}

        {carregando && (
          <div className="px-5 py-10 text-center">
            <Spinner className="mb-3.5" />
            <p className="text-sm text-bh-cinza">Analisando com IA…</p>
          </div>
        )}

        <div ref={resultadoRef}>{resultado && <ResultadoRevisao key={versao} data={resultado} />}</div>
      </div>

      <ModalAlterarSenha aberto={modalSenha} onFechar={() => setModalSenha(false)} />
    </div>
  );
}
````
### `src/pages/Analista.tsx`

````tsx
import { useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, ClipboardList, Coins, Settings, Users } from "lucide-react";
import { AppHeader, HeaderLink, LogoAnalista } from "@/components/AppHeader";
import { AbaAuditorias } from "@/components/analista/AbaAuditorias";
import { AbaIndicadores } from "@/components/analista/AbaIndicadores";
import { AbaUsuarios } from "@/components/analista/AbaUsuarios";
import { AbaConfiguracoes } from "@/components/analista/AbaConfiguracoes";
import { AbaTokens } from "@/components/analista/AbaTokens";

type Aba = "auditorias" | "indicadores" | "usuarios" | "configuracoes" | "tokens";

export default function Analista() {
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>("auditorias");
  // Cada aba carrega na primeira visita e continua montada; "usuarios" carrega no início (badge), como no original.
  const [visitadas, setVisitadas] = useState<Set<Aba>>(new Set(["auditorias", "usuarios"]));
  const [totalUsuarios, setTotalUsuarios] = useState<number | null>(null);
  const onTotalUsuarios = useCallback((n: number) => setTotalUsuarios(n), []);

  function abrir(a: Aba) {
    setAba(a);
    setVisitadas((v) => new Set(v).add(a));
  }

  const tab = (id: Aba, icone: ReactNode, rotulo: string, extra?: ReactNode) => (
    <button
      type="button"
      onClick={() => abrir(id)}
      className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-[18px] py-3.5 text-[13px] transition ${
        aba === id ? "border-bh-azul font-semibold text-bh-azul" : "border-transparent font-medium text-bh-cinza hover:text-bh-azul-md"
      }`}
    >
      {icone} {rotulo} {extra}
    </button>
  );

  const pane = (id: Aba, conteudo: ReactNode) =>
    visitadas.has(id) && <div className={aba === id ? "block" : "hidden"}>{conteudo}</div>;

  const ic = "h-[13px] w-[13px]";

  return (
    <div className="min-h-screen bg-slate-100 text-bh-texto">
      <AppHeader titulo="Painel do Analista" icone={<LogoAnalista />}>
        <HeaderLink onClick={() => navigate("/")}>← Revisão</HeaderLink>
      </AppHeader>

      <div className="sticky top-14 z-[99] flex overflow-x-auto border-b border-bh-borda bg-white px-6 shadow-sm">
        {tab("auditorias", <ClipboardList className={ic} />, "Auditorias")}
        {tab("indicadores", <BarChart3 className={ic} />, "Indicadores")}
        {tab("usuarios", <Users className={ic} />, "Usuários",
          <span className="rounded-[10px] bg-bh-azul-lt px-1.5 py-px text-[10px] font-bold text-bh-azul-md">{totalUsuarios ?? "—"}</span>)}
        {tab("configuracoes", <Settings className={ic} />, "Configurações")}
        {tab("tokens", <Coins className={ic} />, "Tokens & Custo")}
      </div>

      <div className="mx-auto max-w-[1200px] px-5 pb-16 pt-6">
        {pane("auditorias", <AbaAuditorias />)}
        {pane("indicadores", <AbaIndicadores />)}
        {pane("usuarios", <AbaUsuarios onTotal={onTotalUsuarios} />)}
        {pane("configuracoes", <AbaConfiguracoes />)}
        {pane("tokens", <AbaTokens />)}
      </div>
    </div>
  );
}
````
### `src/pages/NotFound.tsx`

````tsx
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 text-bh-texto">
      <h1 className="text-2xl font-bold text-bh-azul">Página não encontrada</h1>
      <Link to="/" className="text-sm text-bh-azul-md underline">Voltar para a revisão</Link>
    </div>
  );
}
````
### `src/App.tsx`

````tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Revisao from "./pages/Revisao";
import Analista from "./pages/Analista";
import NotFound from "./pages/NotFound";

// Rotas equivalentes às da API FastAPI: /login, / (revisão) e /analista.
const App = () => (
  <AuthProvider>
    <Toaster richColors position="top-right" />
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Revisao /></ProtectedRoute>} />
        <Route path="/analista" element={<ProtectedRoute analista><Analista /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
````
