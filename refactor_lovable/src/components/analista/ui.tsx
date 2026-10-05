// Peças visuais compartilhadas pelas abas do Painel do Analista.
import type { ReactNode } from "react";
import { NIVEL_ESTILO, nivelDoScore } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Select nativo e input de data com a aparência dos campos do sistema. */
export const campoCls =
  "h-8 rounded-md border bg-card px-2.5 text-[13px] text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function Filtros({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-center gap-2">{children}</div>;
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">{children}</div>;
}

export function KpiCard({
  label,
  valor,
  sub,
  corValor = "text-primary",
  pequeno,
}: {
  label: string;
  valor: ReactNode;
  sub: string;
  corValor?: string;
  pequeno?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card px-[18px] py-4 shadow-sm">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("font-bold leading-none", pequeno ? "text-[22px]" : "text-3xl", corValor)}>{valor}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

export function Tabela({
  cabecalhos,
  children,
}: {
  cabecalhos: { t: string; alinhar?: "left" | "center" | "right" }[];
  children: ReactNode;
}) {
  const alinhamento = { left: "text-left", center: "text-center", right: "text-right" } as const;
  return (
    <div className="overflow-x-auto rounded-lg border shadow-sm">
      <table className="w-full border-collapse bg-card text-[13px]">
        <thead>
          <tr>
            {cabecalhos.map((c) => (
              <th
                key={c.t}
                scope="col"
                className={cn(
                  "whitespace-nowrap bg-primary px-3.5 py-[11px] text-[11px] font-bold uppercase tracking-wide text-primary-foreground",
                  alinhamento[c.alinhar ?? "left"],
                )}
              >
                {c.t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child]:border-b-0 [&>tr:hover]:bg-muted/60 [&>tr]:border-b [&_td]:px-3.5 [&_td]:py-[11px] [&_td]:align-middle">
          {children}
        </tbody>
      </table>
    </div>
  );
}

/** Barras horizontais de score (por auditor / por checklist). */
export function BarList({ dados, contagem }: { dados: [string, number][]; contagem: Record<string, number> }) {
  if (dados.length === 0) return <div className="text-[13px] text-muted-foreground">Sem dados</div>;
  return (
    <ul className="space-y-2.5">
      {dados.map(([nome, pct]) => {
        const estilo = NIVEL_ESTILO[nivelDoScore(pct)];
        return (
          <li key={nome} className="flex items-center gap-2.5">
            <div className="w-[150px] shrink-0 max-md:w-[110px]">
              <div className="truncate text-xs font-medium" title={nome}>{nome}</div>
              <div className="text-[11px] text-muted-foreground">{contagem[nome] ?? 0} auditoria(s)</div>
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
              <div className={cn("h-full rounded transition-[width] duration-700", estilo.barra)} style={{ width: `${pct}%` }} />
            </div>
            <div className={cn("w-10 shrink-0 text-right text-xs font-bold", estilo.texto)}>{pct}%</div>
          </li>
        );
      })}
    </ul>
  );
}

export function SecTitulo({ children, direita }: { children: ReactNode; direita?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      <h3>{children}</h3>
      {direita && <span className="text-xs font-normal normal-case tracking-normal">{direita}</span>}
    </div>
  );
}

/** Mensagem de erro de uma consulta. */
export function textoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Erro ao carregar.";
}
