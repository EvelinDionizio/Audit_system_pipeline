import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Estado } from "@/components/estado";
import { ScoreBadge } from "@/components/score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { auditoriasQuery, historicoReprocessamentos } from "@/lib/analista.functions";
import { STATUS_LABELS, fmtDataBR, fmtDataHoraBR, normalizarNivel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BarList, Filtros, KpiCard, KpiGrid, SecTitulo, Tabela, campoCls, textoErro } from "./ui";

const STATUS_BADGE: Record<number, "warning" | "info" | "success"> = { 2: "warning", 3: "info", 6: "success" };

function media(valores: number[]) {
  return Math.round((valores.reduce((s, x) => s + x, 0) / valores.length) * 10) / 10;
}

export function AbaAuditorias() {
  const [status, setStatus] = useState("2,3");
  const [limite, setLimite] = useState(20);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [historicoDe, setHistoricoDe] = useState<number | null>(null);

  const filtro = {
    status: status.split(",").map(Number),
    limite,
    ...(de ? { de } : {}),
    ...(ate ? { ate } : {}),
  };
  const consulta = useQuery(auditoriasQuery(filtro));
  const auditorias = consulta.data ?? [];

  const stats = useMemo(() => {
    const comScore = auditorias.filter((a) => a.percentual_conformidade !== null);
    const porAuditor: Record<string, number[]> = {};
    const porChecklist: Record<string, number[]> = {};
    const contAuditor: Record<string, number> = {};
    const contChecklist: Record<string, number> = {};
    for (const a of auditorias) {
      if (a.auditor_cf) contAuditor[a.auditor_cf] = (contAuditor[a.auditor_cf] ?? 0) + 1;
      if (a.checklist) contChecklist[a.checklist] = (contChecklist[a.checklist] ?? 0) + 1;
    }
    for (const a of comScore) {
      const pct = Number(a.percentual_conformidade);
      if (a.auditor_cf) (porAuditor[a.auditor_cf] ??= []).push(pct);
      if (a.checklist) (porChecklist[a.checklist] ??= []).push(pct);
    }
    const ordenar = (m: Record<string, number[]>) =>
      Object.entries(m)
        .map(([k, v]) => [k, media(v)] as [string, number])
        .sort((x, y) => y[1] - x[1]);
    return {
      comScore: comScore.length,
      mediaGeral: comScore.length ? media(comScore.map((a) => Number(a.percentual_conformidade))) : null,
      totalNC: auditorias.reduce((s, a) => s + a.total_nc, 0),
      excelentes: auditorias.filter((a) => Number(a.percentual_conformidade ?? 0) >= 90).length,
      auditores: ordenar(porAuditor),
      checklists: ordenar(porChecklist),
      contAuditor,
      contChecklist,
    };
  }, [auditorias]);

  const corMedia =
    stats.mediaGeral === null || (stats.mediaGeral >= 75 && stats.mediaGeral < 90)
      ? "text-primary"
      : stats.mediaGeral >= 90
        ? "text-success"
        : stats.mediaGeral >= 60
          ? "text-warning"
          : "text-destructive";

  return (
    <>
      <Filtros>
        <select aria-label="Status" className={campoCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="2,3">Em Andamento + Análise</option>
          <option value="2">Em Andamento</option>
          <option value="3">Em Análise</option>
          <option value="6">Concluído</option>
          <option value="2,3,6">Todos</option>
        </select>
        <select aria-label="Quantidade" className={campoCls} value={limite} onChange={(e) => setLimite(Number(e.target.value))}>
          <option value={10}>Últimas 10</option>
          <option value={20}>Últimas 20</option>
          <option value={50}>Últimas 50</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          De: <input type="date" className={campoCls} value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Até: <input type="date" className={campoCls} value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
        <Button size="sm" onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>
          <RefreshCw /> Atualizar
        </Button>
      </Filtros>

      {consulta.isError ? (
        <Estado>{textoErro(consulta.error)}</Estado>
      ) : consulta.isPending ? (
        <Estado carregando />
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Auditorias" valor={auditorias.length} sub={`${stats.comScore} com score`} />
            <KpiCard
              label="Score médio"
              valor={stats.mediaGeral !== null ? `${stats.mediaGeral}%` : "—"}
              sub="média das auditorias"
              corValor={corMedia}
            />
            <KpiCard label="Nível excelente" valor={stats.excelentes} sub="score ≥ 90%" corValor="text-success" />
            <KpiCard
              label="Não conformes"
              valor={stats.totalNC}
              sub="total nos itens"
              corValor={stats.totalNC > 0 ? "text-destructive" : "text-success"}
            />
          </KpiGrid>

          {stats.auditores.length > 0 && (
            <div className="mb-5 grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
              <section className="rounded-lg border bg-card p-[18px] shadow-sm">
                <h3 className="mb-4 text-[13px] font-semibold text-primary">Score por auditor</h3>
                <BarList dados={stats.auditores} contagem={stats.contAuditor} />
              </section>
              <section className="rounded-lg border bg-card p-[18px] shadow-sm">
                <h3 className="mb-4 text-[13px] font-semibold text-primary">Score por checklist</h3>
                <BarList dados={stats.checklists} contagem={stats.contChecklist} />
              </section>
            </div>
          )}

          <SecTitulo direita={`${auditorias.length} resultado(s)`}>Todas as auditorias</SecTitulo>
          {auditorias.length === 0 ? (
            <Estado>Nenhuma auditoria encontrada.</Estado>
          ) : (
            <Tabela
              cabecalhos={[
                { t: "ID" },
                { t: "Checklist / Unidade" },
                { t: "Auditor" },
                { t: "Data" },
                { t: "Status" },
                { t: "Score", alinhar: "center" },
                { t: "NC (+Parciais)", alinhar: "center" },
                { t: "Revisões", alinhar: "center" },
                { t: "Ação", alinhar: "center" },
              ]}
            >
              {auditorias.map((a) => (
                <tr key={a.evaluation_id}>
                  <td className="font-semibold text-primary">#{a.evaluation_id}</td>
                  <td>
                    <div className="font-medium">{a.checklist ?? "—"}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{a.unidade ?? "—"}</div>
                  </td>
                  <td>{a.auditor_cf ?? "—"}</td>
                  <td>{fmtDataBR(a.data_inicio)}</td>
                  <td>
                    <Badge variant={(a.status_cf !== null && STATUS_BADGE[a.status_cf]) || "neutral"}>
                      {(a.status_cf !== null && STATUS_LABELS[a.status_cf]) || a.status_cf || "—"}
                    </Badge>
                  </td>
                  <td className="text-center">
                    <ScoreBadge pct={a.percentual_conformidade} nivel={normalizarNivel(a.nivel_conformidade)} />
                  </td>
                  <td className={cn("text-center font-semibold", a.total_nc > 0 ? "text-destructive" : "text-success")}>
                    {a.total_nc}
                    {a.total_parciais > 0 && <span className="text-[11px] text-warning"> (+{a.total_parciais}p)</span>}
                  </td>
                  <td className="text-center">
                    <Button variant="outline" size="xs" onClick={() => setHistoricoDe(a.evaluation_id)}>
                      {a.total_reprocessamentos}x
                    </Button>
                  </td>
                  <td className="text-center">
                    <Button variant="secondary" size="xs" asChild>
                      <Link to="/" search={{ id: a.evaluation_id }}>Revisar →</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </Tabela>
          )}
        </>
      )}

      <ModalHistorico evaluationId={historicoDe} onFechar={() => setHistoricoDe(null)} />
    </>
  );
}

function ModalHistorico({ evaluationId, onFechar }: { evaluationId: number | null; onFechar: () => void }) {
  const historico = useQuery({
    queryKey: ["analista", "reprocessamentos", evaluationId],
    queryFn: () => historicoReprocessamentos({ data: { evaluation_id: evaluationId as number } }),
    enabled: evaluationId !== null,
  });

  return (
    <Dialog open={evaluationId !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-[480px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base text-primary">Histórico de revisões — #{evaluationId}</DialogTitle>
        </DialogHeader>
        {historico.isError ? (
          <Estado>{textoErro(historico.error)}</Estado>
        ) : historico.isPending ? (
          <Estado carregando>{""}</Estado>
        ) : historico.data.length === 0 ? (
          <Estado>Auditoria ainda não processada pelo sistema.</Estado>
        ) : (
          <ul>
            {historico.data.map((h, i) => (
              <li
                key={h.id}
                className={cn(
                  "flex items-center justify-between gap-3 border-b px-3.5 py-3 last:border-b-0",
                  i === 0 && "bg-success-soft",
                )}
              >
                <div>
                  <div className="text-[13px] font-medium">
                    {i === 0 ? "✓ Mais recente" : `Revisão ${historico.data.length - i}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDataHoraBR(h.processado_em)} · {h.usuario_nome ?? "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ScoreBadge pct={h.percentual_conformidade} nivel={normalizarNivel(h.nivel_conformidade)} />
                  <span className="text-xs text-destructive">{h.total_nc} NC</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
