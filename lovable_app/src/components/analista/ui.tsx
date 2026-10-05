// Peças visuais compartilhadas pelas abas do Painel do Analista.
import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { NIVEL_CLASSES, nivelDoScore } from "@/lib/format";
import type { Nivel } from "@/lib/types";

export const selectCls =
  "cursor-pointer rounded-[7px] border border-bh-borda bg-white px-[11px] py-[7px] text-[13px] text-bh-texto outline-none";

export function Filtros({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-center gap-2">{children}</div>;
}

export function BotaoAcao({
  onClick, children, cor = "azul", disabled, title,
}: { onClick: () => void; children: ReactNode; cor?: "azul" | "verde" | "amarelo"; disabled?: boolean; title?: string }) {
  const cores = {
    azul: "bg-bh-azul hover:bg-bh-azul-md",
    verde: "bg-bh-verde hover:bg-emerald-700",
    amarelo: "bg-bh-amarelo hover:bg-amber-700",
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-[7px] px-3.5 py-[7px] text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${cores[cor]}`}
    >
      {children}
    </button>
  );
}

export function BotaoAtualizar({ onClick }: { onClick: () => void }) {
  return (
    <BotaoAcao onClick={onClick}>
      <RefreshCw className="h-[13px] w-[13px]" strokeWidth={2.5} /> Atualizar
    </BotaoAcao>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">{children}</div>;
}

export function KpiCard({ label, valor, sub, cor = "text-bh-azul", pequeno }: {
  label: string; valor: ReactNode; sub: string; cor?: string; pequeno?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-bh-borda bg-white px-[18px] py-4 shadow-sm">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-bh-cinza">{label}</div>
      <div className={`${pequeno ? "text-[22px]" : "text-3xl"} font-bold leading-none ${cor}`}>{valor}</div>
      <div className="mt-1 text-xs text-bh-cinza">{sub}</div>
    </div>
  );
}

export function Tabela({ cabecalhos, children }: { cabecalhos: { t: string; alinhar?: "left" | "center" | "right" }[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-bh-borda shadow-sm">
      <table className="w-full border-collapse bg-white text-[13px]">
        <thead>
          <tr>
            {cabecalhos.map((c) => (
              <th
                key={c.t}
                className="whitespace-nowrap bg-bh-azul px-3.5 py-[11px] text-[11px] font-bold uppercase tracking-wide text-white"
                style={{ textAlign: c.alinhar ?? "left" }}
              >
                {c.t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child]:border-b-0 [&>tr]:border-b [&>tr]:border-bh-borda [&>tr:hover]:bg-slate-50 [&_td]:px-3.5 [&_td]:py-[11px] [&_td]:align-middle">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function ScoreBadge({ pct, nivel }: { pct: number | null | undefined; nivel?: Nivel | null }) {
  const n: Nivel = nivel ?? (pct === null || pct === undefined ? "sem_dados" : nivelDoScore(pct));
  return (
    <span className={`inline-flex min-w-12 items-center justify-center rounded-full px-[9px] py-[3px] text-xs font-bold ${NIVEL_CLASSES[n].badge}`}>
      {pct === null || pct === undefined ? "—" : `${Number(pct)}%`}
    </span>
  );
}

export function BarList({ dados, contagem }: { dados: [string, number][]; contagem: Record<string, number> }) {
  if (!dados.length) return <div className="text-[13px] text-bh-cinza">Sem dados</div>;
  return (
    <>
      {dados.map(([nome, pct]) => {
        const n = nivelDoScore(pct);
        return (
          <div key={nome} className="mb-2.5 flex items-center gap-2.5">
            <div className="w-[150px] shrink-0 max-md:w-[110px]">
              <div className="truncate text-xs font-medium text-bh-texto" title={nome}>{nome}</div>
              <div className="text-[11px] text-bh-cinza">{contagem[nome] ?? 0} auditoria(s)</div>
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded bg-bh-cinza-lt">
              <div className={`h-full rounded transition-[width] duration-700 ${NIVEL_CLASSES[n].barra}`} style={{ width: `${pct}%` }} />
            </div>
            <div className={`w-10 shrink-0 text-right text-xs font-bold ${NIVEL_CLASSES[n].texto}`}>{pct}%</div>
          </div>
        );
      })}
    </>
  );
}

export function SecTitulo({ children, direita }: { children: ReactNode; direita?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-bh-cinza">
      <span>{children}</span>
      {direita && <span className="text-xs font-normal normal-case tracking-normal">{direita}</span>}
    </div>
  );
}
