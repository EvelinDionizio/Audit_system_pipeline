import { ChevronDown, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NIVEL_ESTILO, STATUS_LABELS, fmtPct, limparMarkdown, normalizarNivel } from "@/lib/format";
import type { ResultadoRevisao as Resultado, SugestaoRevisao } from "@/lib/revisao.functions";
import { cn } from "@/lib/utils";
import { ItemCard, type TipoItem, classificarItem, useCopiar } from "./item-card";

type Filtro = "todos" | TipoItem;

const FILTRO_ATIVO: Record<Filtro, "default" | "destructive" | "warning" | "success"> = {
  todos: "default",
  nc: "destructive",
  sugestao: "warning",
  ok: "success",
};

export function ResultadoRevisao({ data }: { data: Resultado }) {
  const r = data.resumo;
  const itens = data.sugestoes.itens;
  const parecer = data.sugestoes.parecer;
  const nivel = normalizarNivel(r.nivel_conformidade);
  const { copiado, copiar } = useCopiar();

  const categorias = useMemo(() => {
    const mapa = new Map<string, SugestaoRevisao[]>();
    for (const item of itens) {
      const categoria = item.categoria || "Geral";
      mapa.set(categoria, [...(mapa.get(categoria) ?? []), item]);
    }
    return [...mapa.entries()];
  }, [itens]);

  const [filtro, setFiltro] = useState<Filtro>("todos");
  // Categorias com NC ou sugestão começam abertas.
  const [abertas, setAbertas] = useState<Set<string>>(
    () => new Set(categorias.filter(([, its]) => its.some((i) => classificarItem(i) !== "ok")).map(([c]) => c)),
  );

  const contar = (tipo: TipoItem) => itens.filter((i) => classificarItem(i) === tipo).length;

  function aplicarFiltro(novo: Filtro) {
    setFiltro(novo);
    if (novo !== "todos") {
      setAbertas((anteriores) => {
        const proximas = new Set(anteriores);
        for (const [categoria, its] of categorias) {
          if (its.some((i) => classificarItem(i) === novo)) proximas.add(categoria);
        }
        return proximas;
      });
    }
  }

  function alternar(categoria: string) {
    setAbertas((anteriores) => {
      const proximas = new Set(anteriores);
      if (proximas.has(categoria)) proximas.delete(categoria);
      else proximas.add(categoria);
      return proximas;
    });
  }

  const botaoFiltro = (f: Filtro, rotulo: string) => (
    <Button
      key={f}
      size="xs"
      variant={filtro === f ? FILTRO_ATIVO[f] : "outline"}
      className="rounded-full"
      onClick={() => aplicarFiltro(f)}
    >
      {rotulo}
    </Button>
  );

  return (
    <div className="space-y-4">
      {!data.salvo && (
        <div
          role="alert"
          className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-[13px] leading-normal text-warning"
        >
          <strong>Esta revisão não foi salva e não aparecerá no painel.</strong>
          {data.erro_salvar && <span className="mt-1 block text-foreground">Motivo: {data.erro_salvar}</span>}
        </div>
      )}

      <Card>
        <CardContent className="flex items-center gap-5 max-sm:flex-col max-sm:text-center">
          <div
            className={cn(
              "flex size-[72px] shrink-0 flex-col items-center justify-center rounded-full border-4 text-xl font-bold",
              NIVEL_ESTILO[nivel].borda,
              NIVEL_ESTILO[nivel].texto,
            )}
          >
            <span>{fmtPct(r.percentual_conformidade)}</span>
            <small className="text-[10px] font-medium">score</small>
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-primary">{data.checklist || "Auditoria"}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground max-sm:justify-center">
              {data.unidade}
              <Badge variant={r.status === 2 ? "warning" : "info"}>
                {(r.status !== null && STATUS_LABELS[r.status]) || "Em Análise"}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 max-sm:justify-center">
              <Badge variant="destructive">✗ {r.nao_conformes} NC</Badge>
              <Badge variant="warning">~ {r.parciais} Parciais</Badge>
              <Badge variant="success">✓ {r.conformes} Conformes</Badge>
              <span className="self-center text-[11px] text-muted-foreground">ID #{data.evaluation_id}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {itens.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Sugestões por item
          </h2>
          <div className="mb-3.5 flex flex-wrap gap-1.5">
            {botaoFiltro("todos", `Todos (${itens.length})`)}
            {botaoFiltro("nc", `⚠ Obrigatório (${contar("nc")})`)}
            {botaoFiltro("sugestao", `💡 Sugestão (${contar("sugestao")})`)}
            {botaoFiltro("ok", `✓ Adequados (${contar("ok")})`)}
          </div>

          {categorias.map(([categoria, its]) => {
            const visiveis = its.filter((i) => filtro === "todos" || classificarItem(i) === filtro);
            if (visiveis.length === 0) return null;
            const nc = its.filter((i) => classificarItem(i) === "nc").length;
            const sug = its.filter((i) => classificarItem(i) === "sugestao").length;
            const aberta = abertas.has(categoria);
            return (
              <div key={categoria} className="mb-2 overflow-hidden rounded-lg border bg-card shadow-sm">
                <button
                  type="button"
                  aria-expanded={aberta}
                  onClick={() => alternar(categoria)}
                  className="flex w-full items-center justify-between gap-2.5 px-4 py-3 text-left transition hover:bg-muted"
                >
                  <span className="flex-1 text-[13px] font-semibold uppercase tracking-wide text-primary">
                    {categoria}
                  </span>
                  <span className="flex items-center gap-2">
                    {nc > 0 && <Badge variant="destructive" className="text-[10px]">{nc} NC</Badge>}
                    {sug > 0 && <Badge variant="warning" className="text-[10px]">{sug} sugestão</Badge>}
                    <span className="text-[11px] text-muted-foreground">{its.length} item(s)</span>
                  </span>
                  <ChevronDown
                    className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberta && "rotate-180")}
                  />
                </button>
                {aberta && (
                  <div className="px-2.5 pb-2.5">
                    {visiveis.map((item, indice) => (
                      <ItemCard key={`${item.item_id ?? "x"}-${indice}`} item={item} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {parecer && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-sm text-primary">Parecer técnico</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-[13px] leading-[1.7]">{limparMarkdown(parecer)}</div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => copiar(limparMarkdown(parecer))}>
              <Copy /> {copiado ? "Copiado!" : "Copiar parecer"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
