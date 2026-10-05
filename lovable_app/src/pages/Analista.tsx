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
