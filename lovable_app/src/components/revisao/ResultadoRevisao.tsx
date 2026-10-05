import { useMemo, useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import type { ItemSugestao, ResultadoRevisao as Resultado } from "@/lib/types";
import { fmtPct, limparMarkdown, NIVEL_CLASSES } from "@/lib/format";
import { classificarItem, ItemCard, type TipoItem } from "./ItemCard";

type Filtro = "todos" | TipoItem;

const FILTRO_ATIVO: Record<Filtro, string> = {
  todos: "bg-bh-azul border-bh-azul text-white",
  nc: "bg-bh-vermelho border-bh-vermelho text-white",
  sugestao: "bg-bh-amarelo border-bh-amarelo text-white",
  ok: "bg-bh-verde border-bh-verde text-white",
};

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`flex items-center gap-1 rounded-full px-[9px] py-[3px] text-[11px] font-semibold ${className}`}>{children}</span>;
}

export function ResultadoRevisao({ data }: { data: Resultado }) {
  const r = data.resumo;
  const itens = data.sugestoes?.itens ?? [];
  const parecer = data.sugestoes?.parecer ?? "";
  const nivel = r.nivel_conformidade ?? "sem_dados";
  const emAndamento = r.status === 2;

  const categorias = useMemo(() => {
    const mapa = new Map<string, ItemSugestao[]>();
    for (const item of itens) {
      const cat = item.categoria || "Geral";
      mapa.set(cat, [...(mapa.get(cat) ?? []), item]);
    }
    return [...mapa.entries()];
  }, [itens]);

  const [filtro, setFiltro] = useState<Filtro>("todos");
  // Acordeões com NC ou sugestão começam abertos
  const [abertos, setAbertos] = useState<Set<string>>(
    () => new Set(categorias.filter(([, its]) => its.some((i) => i.sugestao)).map(([c]) => c)),
  );
  const [copiado, setCopiado] = useState(false);

  // Contagens pela mesma classificação dos cards (no original eram calculadas por outra regra e podiam divergir do filtro)
  const totalNC = itens.filter((i) => classificarItem(i) === "nc").length;
  const totalSug = itens.filter((i) => classificarItem(i) === "sugestao").length;
  const totalOk = itens.filter((i) => classificarItem(i) === "ok").length;

  function aplicarFiltro(f: Filtro) {
    setFiltro(f);
    if (f !== "todos") {
      setAbertos((prev) => {
        const novo = new Set(prev);
        categorias.forEach(([cat, its]) => its.some((i) => classificarItem(i) === f) && novo.add(cat));
        return novo;
      });
    }
  }

  function alternar(cat: string) {
    setAbertos((prev) => {
      const novo = new Set(prev);
      novo.has(cat) ? novo.delete(cat) : novo.add(cat);
      return novo;
    });
  }

  function copiarParecer() {
    navigator.clipboard.writeText(limparMarkdown(parecer)).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  const btnFiltro = (f: Filtro, rotulo: string) => (
    <button
      type="button"
      onClick={() => aplicarFiltro(f)}
      className={`rounded-full border-[1.5px] px-3 py-[5px] text-xs font-semibold transition ${
        filtro === f ? FILTRO_ATIVO[f] : "border-bh-borda bg-white text-bh-cinza hover:border-bh-azul-md hover:text-bh-azul-md"
      }`}
    >
      {rotulo}
    </button>
  );

  return (
    <div>
      {/* Score */}
      <div className="mb-4 flex items-center gap-5 rounded-[10px] border border-bh-borda bg-white px-5 py-4 max-[480px]:flex-col max-[480px]:text-center">
        <div className={`flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-full border-4 text-xl font-bold ${NIVEL_CLASSES[nivel].borda} ${NIVEL_CLASSES[nivel].texto}`}>
          <span>{fmtPct(r.percentual_conformidade)}</span>
          <small className="mt-px text-[10px] font-medium">score</small>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-bh-azul">{data.checklist || "Auditoria"}</h3>
          <div className="mt-0.5 text-[13px] text-bh-cinza">
            {data.unidade} ·{" "}
            <span className={`rounded-xl px-2 py-0.5 text-[11px] font-semibold ${emAndamento ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
              {emAndamento ? "Em Andamento" : "Em Análise"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 max-[480px]:justify-center">
            <Pill className="bg-bh-vermelho-lt text-bh-vermelho">✗ {r.nao_conformes || 0} NC</Pill>
            <Pill className="bg-bh-amarelo-lt text-bh-amarelo">~ {r.parciais || 0} Parciais</Pill>
            <Pill className="bg-bh-verde-lt text-bh-verde">✓ {r.conformes || 0} Conformes</Pill>
            <span className="self-center text-[11px] text-bh-cinza">ID #{data.evaluation_id}</span>
          </div>
        </div>
      </div>

      {itens.length > 0 && (
        <>
          <div className="mb-2.5 mt-5 text-[11px] font-bold uppercase tracking-wider text-bh-cinza">Sugestões por item</div>
          <div className="mb-3.5 flex flex-wrap gap-1.5">
            {btnFiltro("todos", `Todos (${itens.length})`)}
            {btnFiltro("nc", `⚠ Obrigatório (${totalNC})`)}
            {btnFiltro("sugestao", `💡 Sugestão (${totalSug})`)}
            {btnFiltro("ok", `✓ Adequados (${totalOk})`)}
          </div>

          {categorias.map(([cat, its]) => {
            const visiveis = its.filter((i) => filtro === "todos" || classificarItem(i) === filtro);
            if (!visiveis.length) return null;
            const countNC = its.filter((i) => classificarItem(i) === "nc").length;
            const countSug = its.filter((i) => classificarItem(i) === "sugestao").length;
            const aberto = abertos.has(cat);
            return (
              <div key={cat} className="mb-2 overflow-hidden rounded-[10px] border border-bh-borda bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => alternar(cat)}
                  className="flex w-full items-center justify-between gap-2.5 px-4 py-3 text-left transition hover:bg-bh-cinza-lt"
                >
                  <span className="flex-1 text-[13px] font-semibold uppercase tracking-wide text-bh-azul">{cat}</span>
                  <span className="flex items-center gap-2">
                    {countNC > 0 && <Pill className="bg-bh-vermelho-lt px-[7px] py-0.5 text-[10px] text-bh-vermelho">{countNC} NC</Pill>}
                    {countSug > 0 && <Pill className="bg-bh-amarelo-lt px-[7px] py-0.5 text-[10px] text-bh-amarelo">{countSug} sugestão</Pill>}
                    <span className="text-[11px] text-bh-cinza">{its.length} item(s)</span>
                  </span>
                  <span className={`shrink-0 text-[11px] text-bh-cinza transition-transform ${aberto ? "rotate-180" : ""}`}>▼</span>
                </button>
                {aberto && (
                  <div className="px-2.5 pb-2.5">
                    {visiveis.map((item, idx) => <ItemCard key={`${item.item_id ?? "x"}-${idx}`} item={item} />)}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {parecer && (
        <div className="mb-4 mt-4 rounded-[10px] border border-bh-borda bg-white p-5 shadow-sm">
          <h3 className="mb-3 border-b border-bh-borda pb-2.5 text-sm font-semibold text-bh-azul">Parecer técnico</h3>
          <div className="whitespace-pre-wrap text-[13px] leading-[1.7] text-bh-texto">{limparMarkdown(parecer)}</div>
          <button
            type="button"
            onClick={copiarParecer}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-bh-borda bg-bh-cinza-lt px-3 py-[7px] text-xs font-medium text-bh-cinza transition hover:bg-gray-200"
          >
            <Copy className="h-3 w-3" /> {copiado ? "Copiado!" : "Copiar parecer"}
          </button>
        </div>
      )}
    </div>
  );
}
