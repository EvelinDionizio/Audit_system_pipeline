import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { exigir, invocar } from "@/lib/api";
import { exportarExcel } from "@/lib/exportExcel";
import { fmtDataBR, STATUS_LABELS } from "@/lib/format";
import type { AuditoriaRow, Payload, ReprocessamentoRow } from "@/lib/types";
import { Estado } from "@/components/Estado";
import { BarList, BotaoAcao, BotaoAtualizar, Filtros, KpiCard, KpiGrid, ScoreBadge, SecTitulo, selectCls, Tabela } from "./ui";

const STATUS_PILL: Record<number, string> = {
  2: "bg-amber-100 text-amber-800",
  3: "bg-blue-100 text-blue-800",
  6: "bg-bh-verde-lt text-bh-verde",
};

function media(v: number[]) {
  return Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10;
}

export function AbaAuditorias() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("2,3");
  const [limit, setLimit] = useState(20);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [historico, setHistorico] = useState<AuditoriaRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [reprocessId, setReprocessId] = useState<number | null>(null);
  const [exportando, setExportando] = useState(false);
  const [confirmarLote, setConfirmarLote] = useState(false);
  const [progressoLote, setProgressoLote] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setHistorico(null);
    setErro(null);
    try {
      const rows = exigir(
        await supabase
          .from("auditorias")
          .select("id, evaluation_id, checklist, unidade, auditor_cf, data_inicio, status_cf, percentual_conformidade, nivel_conformidade, total_itens, total_nc, total_parciais, total_reprocessamentos, processado_em")
          .order("processado_em", { ascending: false })
          .limit(500),
      );
      setHistorico(rows as AuditoriaRow[]);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Mesmos filtros de GET /api/auditorias (aplicados ao histórico persistido)
  const auditorias = useMemo(() => {
    if (!historico) return [];
    const statusList = status.split(",").map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
    return historico
      .filter((h) => {
        if (statusList.length && h.status_cf !== null && !statusList.includes(h.status_cf)) return false;
        const dataH = (h.data_inicio ?? "").slice(0, 10);
        if (de && dataH && dataH < de) return false;
        if (ate && dataH && dataH > ate) return false;
        return true;
      })
      .sort((a, b) => (b.data_inicio ?? "").localeCompare(a.data_inicio ?? ""))
      .slice(0, limit);
  }, [historico, status, limit, de, ate]);

  const stats = useMemo(() => {
    const comScore = auditorias.filter((a) => a.percentual_conformidade !== null);
    const porAuditor: Record<string, number[]> = {};
    const porChecklist: Record<string, number[]> = {};
    const contAu: Record<string, number> = {};
    const contCh: Record<string, number> = {};
    for (const a of auditorias) {
      if (a.auditor_cf) contAu[a.auditor_cf] = (contAu[a.auditor_cf] ?? 0) + 1;
      if (a.checklist) contCh[a.checklist] = (contCh[a.checklist] ?? 0) + 1;
    }
    for (const a of comScore) {
      const pct = Number(a.percentual_conformidade);
      if (a.auditor_cf) (porAuditor[a.auditor_cf] ??= []).push(pct);
      if (a.checklist) (porChecklist[a.checklist] ??= []).push(pct);
    }
    const ordenar = (m: Record<string, number[]>) =>
      Object.entries(m).map(([k, v]) => [k, media(v)] as [string, number]).sort((a, b) => b[1] - a[1]);
    return {
      comScore: comScore.length,
      mediaGeral: comScore.length ? media(comScore.map((a) => Number(a.percentual_conformidade))) : null,
      totalNC: auditorias.reduce((s, a) => s + (a.total_nc || 0), 0),
      totalOk: auditorias.filter((a) => Number(a.percentual_conformidade ?? 0) >= 90).length,
      auditores: ordenar(porAuditor),
      checklists: ordenar(porChecklist),
      contAu,
      contCh,
    };
  }, [auditorias]);

  async function exportar() {
    if (!auditorias.length) return toast.error("Nenhuma auditoria para exportar.");
    setExportando(true);
    try {
      const ids = auditorias.map((a) => a.evaluation_id);
      const rows = exigir(await supabase.from("auditorias").select("evaluation_id, payload").in("evaluation_id", ids)) as
        { evaluation_id: number; payload: Payload | null }[];
      const porId = new Map(rows.map((r) => [r.evaluation_id, r.payload]));
      const payloads = ids.map((id) => porId.get(id)).filter((p): p is Payload => !!p);
      if (!payloads.length) return toast.error("As auditorias listadas não têm payload salvo.");
      await exportarExcel(payloads);
    } catch (e) {
      toast.error(`Erro ao exportar: ${(e as Error).message}`);
    } finally {
      setExportando(false);
    }
  }

  // Porta do pipeline em lote (main.py): lista pendentes na API e revisa uma a uma.
  async function processarLote() {
    setConfirmarLote(false);
    setProgressoLote("Buscando auditorias pendentes…");
    try {
      const { ids, total_recebido } = await invocar<{ ids: number[]; total_recebido: number }>("listar-pendentes", { dias: 90, limit: 100 });
      if (!ids.length) {
        toast.info(`Nenhuma auditoria encontrada (${total_recebido} recebida(s) da API).`);
        return;
      }
      const falhas: string[] = [];
      for (let i = 0; i < ids.length; i++) {
        setProgressoLote(`Processando ${i + 1}/${ids.length} — #${ids[i]}`);
        try {
          await invocar("revisar", { evaluation_id: ids[i] });
        } catch (e) {
          falhas.push(`#${ids[i]}: ${(e as Error).message}`);
        }
      }
      const ok = ids.length - falhas.length;
      if (falhas.length) toast.warning(`${ok} processada(s), ${falhas.length} com erro.`, { description: falhas.join("\n") });
      else toast.success(`${ok} auditoria(s) processada(s).`);
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgressoLote(null);
    }
  }

  const corMedia =
    stats.mediaGeral === null ? "text-bh-azul"
    : stats.mediaGeral >= 90 ? "text-bh-verde"
    : stats.mediaGeral >= 75 ? "text-bh-azul"
    : stats.mediaGeral >= 60 ? "text-bh-amarelo"
    : "text-bh-vermelho";

  const inputData = `${selectCls} cursor-text`;

  return (
    <>
      <Filtros>
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="2,3">Em Andamento + Análise</option>
          <option value="2">Em Andamento</option>
          <option value="3">Em Análise</option>
          <option value="6">Concluído</option>
          <option value="2,3,6">Todos</option>
        </select>
        <select className={selectCls} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          <option value={10}>Últimas 10</option>
          <option value={20}>Últimas 20</option>
          <option value={50}>Últimas 50</option>
        </select>
        <label className="text-xs text-bh-cinza">De:</label>
        <input type="date" className={inputData} value={de} onChange={(e) => setDe(e.target.value)} />
        <label className="text-xs text-bh-cinza">Até:</label>
        <input type="date" className={inputData} value={ate} onChange={(e) => setAte(e.target.value)} />
        <BotaoAtualizar onClick={carregar} />
        <BotaoAcao cor="verde" onClick={exportar} disabled={exportando}>
          <FileSpreadsheet className="h-[13px] w-[13px]" /> {exportando ? "Exportando…" : "Exportar Excel"}
        </BotaoAcao>
        <BotaoAcao cor="amarelo" onClick={() => setConfirmarLote(true)} disabled={!!progressoLote} title="Revisa as auditorias 'Em Análise' dos últimos 90 dias">
          <PlayCircle className="h-[13px] w-[13px]" /> {progressoLote ?? "Processar pendentes"}
        </BotaoAcao>
      </Filtros>

      {erro ? (
        <Estado>Erro: {erro}</Estado>
      ) : historico === null ? (
        <Estado carregando />
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Auditorias" valor={auditorias.length} sub={`${stats.comScore} com score`} />
            <KpiCard label="Score médio" valor={stats.mediaGeral !== null ? `${stats.mediaGeral}%` : "—"} sub="média ponderada" cor={corMedia} />
            <KpiCard label="Nível excelente" valor={stats.totalOk} sub="score ≥ 90%" cor="text-bh-verde" />
            <KpiCard label="Não conformes" valor={stats.totalNC} sub="total nos itens" cor={stats.totalNC > 0 ? "text-bh-vermelho" : "text-bh-verde"} />
          </KpiGrid>

          {stats.auditores.length > 0 && (
            <div className="mb-5 grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
              <div className="rounded-[10px] border border-bh-borda bg-white p-[18px] shadow-sm">
                <h3 className="mb-4 text-[13px] font-semibold text-bh-azul">Score por auditor</h3>
                <BarList dados={stats.auditores} contagem={stats.contAu} />
              </div>
              <div className="rounded-[10px] border border-bh-borda bg-white p-[18px] shadow-sm">
                <h3 className="mb-4 text-[13px] font-semibold text-bh-azul">Score por checklist</h3>
                <BarList dados={stats.checklists} contagem={stats.contCh} />
              </div>
            </div>
          )}

          <SecTitulo direita={`${auditorias.length} resultado(s)`}>Todas as auditorias</SecTitulo>
          {auditorias.length === 0 ? (
            <Estado>Nenhuma auditoria encontrada.</Estado>
          ) : (
            <Tabela
              cabecalhos={[
                { t: "ID" }, { t: "Checklist / Unidade" }, { t: "Auditor" }, { t: "Data" }, { t: "Status" },
                { t: "Score" }, { t: "NC (+Parciais)" }, { t: "Revisões" }, { t: "Ação" },
              ]}
            >
              {auditorias.map((a) => (
                <tr key={a.evaluation_id}>
                  <td className="font-semibold text-bh-azul">#{a.evaluation_id}</td>
                  <td>
                    <div className="font-medium">{a.checklist ?? "—"}</div>
                    <div className="mt-0.5 text-[11px] text-bh-cinza">{a.unidade ?? "—"}</div>
                  </td>
                  <td>{a.auditor_cf ?? "—"}</td>
                  <td>{fmtDataBR(a.data_inicio)}</td>
                  <td>
                    <span className={`inline-flex rounded-xl px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[a.status_cf ?? 0] ?? "bg-bh-cinza-lt text-bh-cinza"}`}>
                      {(a.status_cf !== null && STATUS_LABELS[a.status_cf]) || a.status_cf || "—"}
                    </span>
                  </td>
                  <td className="text-center"><ScoreBadge pct={a.percentual_conformidade} nivel={a.nivel_conformidade ?? "sem_dados"} /></td>
                  <td className={`text-center font-semibold ${a.total_nc > 0 ? "text-bh-vermelho" : "text-bh-verde"}`}>
                    {a.total_nc || 0}
                    {a.total_parciais > 0 && <span className="text-[11px] text-bh-amarelo"> (+{a.total_parciais}p)</span>}
                  </td>
                  <td className="text-center">
                    <button type="button" onClick={() => setReprocessId(a.evaluation_id)}
                      className="whitespace-nowrap rounded-[5px] border border-bh-borda px-[7px] py-[3px] text-xs text-bh-cinza transition hover:bg-bh-cinza-lt hover:text-bh-texto">
                      {a.total_reprocessamentos}x
                    </button>
                  </td>
                  <td className="text-center">
                    <button type="button" onClick={() => navigate(`/?id=${a.evaluation_id}`)}
                      className="whitespace-nowrap rounded-md border border-bh-azul-lt px-2.5 py-[5px] text-xs font-medium text-bh-azul-md transition hover:bg-bh-azul-lt">
                      Revisar →
                    </button>
                  </td>
                </tr>
              ))}
            </Tabela>
          )}
        </>
      )}

      <ModalReprocessamentos evaluationId={reprocessId} onFechar={() => setReprocessId(null)} />

      <AlertDialog open={confirmarLote} onOpenChange={setConfirmarLote}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Processar auditorias pendentes?</AlertDialogTitle>
            <AlertDialogDescription>
              Busca até 100 auditorias “Em Análise” dos últimos 90 dias no Checklist Fácil e gera os pareceres com IA
              para cada uma (consome tokens da API do Claude). Mantenha esta aba aberta até o fim.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={processarLote}>Processar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ModalReprocessamentos({ evaluationId, onFechar }: { evaluationId: number | null; onFechar: () => void }) {
  const [hist, setHist] = useState<ReprocessamentoRow[] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (evaluationId === null) return;
    setHist(null);
    setErro(false);
    supabase
      .from("reprocessamentos")
      .select("id, processado_em, percentual_conformidade, nivel_conformidade, total_nc, profiles(nome)")
      .eq("evaluation_id", evaluationId)
      .order("processado_em", { ascending: false })
      .then(({ data, error }) => (error ? setErro(true) : setHist((data ?? []) as unknown as ReprocessamentoRow[])));
  }, [evaluationId]);

  return (
    <Dialog open={evaluationId !== null} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-[480px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base text-bh-azul">Histórico de revisões — #{evaluationId}</DialogTitle>
        </DialogHeader>
        {erro ? (
          <Estado>Erro ao buscar histórico.</Estado>
        ) : hist === null ? (
          <Estado carregando>{""}</Estado>
        ) : hist.length === 0 ? (
          <Estado>Auditoria ainda não processada pelo sistema.</Estado>
        ) : (
          <div>
            {hist.map((h, i) => (
              <div key={h.id} className={`flex items-center justify-between gap-3 border-b border-bh-borda px-3.5 py-3 last:border-b-0 ${i === 0 ? "bg-bh-verde-lt" : ""}`}>
                <div>
                  <div className="text-[13px] font-medium">{i === 0 ? "✓ Mais recente" : `Revisão ${hist.length - i}`}</div>
                  <div className="text-xs text-bh-cinza">{new Date(h.processado_em).toLocaleString("pt-BR")} · {h.profiles?.nome ?? "—"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <ScoreBadge pct={h.percentual_conformidade} nivel={h.nivel_conformidade ?? "sem_dados"} />
                  <span className="text-xs text-bh-vermelho">{h.total_nc || 0} NC</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
