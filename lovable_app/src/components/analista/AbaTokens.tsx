import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Estado } from "@/components/Estado";
import { BotaoAtualizar, Filtros, KpiCard, KpiGrid, selectCls, Tabela } from "./ui";

// Cotação fixa usada no original para a estimativa em reais
const USD_BRL = 6;

interface Resumo {
  total_chamadas: number | null;
  total_tokens: number | null;
  custo_total_usd: number | null;
  auditorias_processadas: number | null;
}
interface PorDia { dia: string; tokens: number | null; custo_usd: number | null; chamadas: number | null }

export function AbaTokens() {
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<{ resumo: Resumo; porDia: PorDia[] } | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setDados(null);
    setErro(false);
    const [r1, r2] = await Promise.all([
      supabase.rpc("resumo_uso_tokens", { dias }),
      supabase.rpc("uso_tokens_por_dia", { dias }),
    ]);
    if (r1.error || r2.error) return setErro(true);
    const resumo = (Array.isArray(r1.data) ? r1.data[0] : r1.data) ?? {};
    setDados({ resumo: resumo as Resumo, porDia: (r2.data ?? []) as PorDia[] });
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  const r = dados?.resumo;
  const totalTokens = Number(r?.total_tokens) || 0;
  const custoUSD = Number(r?.custo_total_usd) || 0;

  return (
    <>
      <Filtros>
        <select className={selectCls} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
        <BotaoAtualizar onClick={carregar} />
      </Filtros>

      {erro ? (
        <Estado>Erro ao carregar.</Estado>
      ) : !dados ? (
        <Estado carregando />
      ) : (
        <>
          <KpiGrid>
            <KpiCard pequeno label="Total de tokens" valor={totalTokens.toLocaleString("pt-BR")} sub={`últimos ${dias} dias`} />
            <KpiCard pequeno label="Custo estimado" valor={`USD ${custoUSD.toFixed(4)}`} sub={`~R$ ${(custoUSD * USD_BRL).toFixed(2)}`} cor="text-bh-verde" />
            <KpiCard pequeno label="Auditorias com IA" valor={Number(r?.auditorias_processadas) || 0} sub="revisões processadas" />
            <KpiCard pequeno label="Chamadas à API" valor={Number(r?.total_chamadas) || 0} sub="total de requisições" />
          </KpiGrid>

          {dados.porDia.length === 0 ? (
            <Estado>
              Nenhum uso registrado neste período.<br />
              <span className="text-xs">O registro começa após a primeira revisão com a API ativa.</span>
            </Estado>
          ) : (
            <Tabela cabecalhos={[{ t: "Dia" }, { t: "Tokens", alinhar: "right" }, { t: "Chamadas", alinhar: "right" }, { t: "Custo", alinhar: "right" }]}>
              {dados.porDia.map((d) => (
                <tr key={d.dia}>
                  <td>{d.dia}</td>
                  <td className="text-right">{(Number(d.tokens) || 0).toLocaleString("pt-BR")}</td>
                  <td className="text-right">{d.chamadas || 0}</td>
                  <td className="text-right font-semibold text-bh-verde">USD {(Number(d.custo_usd) || 0).toFixed(4)}</td>
                </tr>
              ))}
            </Tabela>
          )}
        </>
      )}
    </>
  );
}
