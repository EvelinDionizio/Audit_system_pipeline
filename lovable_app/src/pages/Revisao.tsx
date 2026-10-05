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
